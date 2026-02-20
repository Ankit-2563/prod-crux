/**
 * device-pairing.ino
 *
 * ESP32-S3 talks to Quectel EC200U via UART using AT commands.
 * On boot it POSTs { deviceId, deviceSecret } to your AWS server over HTTPS (TLS 1.2).
 *
 * Wiring (adjust pins to match your VVM601 board schematic):
 *   ESP32-S3 TX (GPIO17) → EC200U RX
 *   ESP32-S3 RX (GPIO18) → EC200U TX
 *   EC200U PWRKEY         → GPIO 4 (or hold high per board design)
 */

#include <Arduino.h>
#include "secrets.h"

// ─── Serial ports ─────────────────────────────────────────────────────────────
// Serial  = USB debug monitor (115200 baud)
// Serial1 = UART to EC200U   (115200 baud) — adjust pins to your board
#define EC200U_BAUD   115200
#define EC200U_RX_PIN 18
#define EC200U_TX_PIN 17

HardwareSerial ec200u(1);   // UART1

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Send an AT command and wait for an expected response substring.
 * Returns true if the response arrives within timeoutMs.
 */
bool sendAT(const char* cmd, const char* expected, unsigned long timeoutMs = 5000) {
  ec200u.println(cmd);
  Serial.print("[AT] >> "); Serial.println(cmd);

  String resp = "";
  unsigned long start = millis();
  while (millis() - start < timeoutMs) {
    while (ec200u.available()) {
      char c = ec200u.read();
      resp += c;
    }
    if (resp.indexOf(expected) != -1) {
      Serial.print("[AT] << "); Serial.println(resp);
      return true;
    }
  }
  Serial.print("[AT] TIMEOUT waiting for: "); Serial.println(expected);
  Serial.print("[AT] Got: "); Serial.println(resp);
  return false;
}

/**
 * Read everything the modem sends for up to timeoutMs and return it.
 */
String readResponse(unsigned long timeoutMs = 3000) {
  String resp = "";
  unsigned long start = millis();
  while (millis() - start < timeoutMs) {
    while (ec200u.available()) {
      resp += (char)ec200u.read();
    }
  }
  return resp;
}

// ─── Modem init ───────────────────────────────────────────────────────────────

bool initModem() {
  Serial.println("[MODEM] Waiting for modem to boot...");
  delay(5000);

  // Basic AT handshake
  if (!sendAT("AT", "OK", 3000))          return false;
  if (!sendAT("ATE0", "OK"))              return false;   // echo off
  if (!sendAT("AT+CMEE=2", "OK"))         return false;   // verbose errors

  // Check SIM
  if (!sendAT("AT+CIMI", "OK", 5000))     return false;

  // Set APN
  String apnCmd = "AT+CGDCONT=1,\"IP\",\"" + String(APN) + "\"";
  if (!sendAT(apnCmd.c_str(), "OK"))      return false;

  // Attach to network (wait up to 30s)
  Serial.println("[MODEM] Attaching to LTE...");
  if (!sendAT("AT+CGATT=1", "OK", 30000)) return false;

  // Wait for registration (stat 1=home, 5=roaming)
  for (int i = 0; i < 15; i++) {
    ec200u.println("AT+CEREG?");
    String r = readResponse(2000);
    if (r.indexOf(",1") != -1 || r.indexOf(",5") != -1) {
      Serial.println("[MODEM] Registered on LTE");
      break;
    }
    delay(2000);
    if (i == 14) {
      Serial.println("[MODEM] Failed to register on LTE");
      return false;
    }
  }

  // Activate PDP context
  if (!sendAT("AT+CGACT=1,1", "OK", 15000)) return false;

  Serial.println("[MODEM] Modem ready.");
  return true;
}

// ─── HTTPS POST via EC200U ────────────────────────────────────────────────────

/**
 * POST JSON to the server using the EC200U HTTPS AT commands.
 * EC200U supports TLS 1.2 natively — matches your AWS Nginx config.
 */
bool postDeviceRegister() {
  // Build the JSON body
  String body = "{\"deviceId\":\"" + String(DEVICE_ID) +
                "\",\"deviceSecret\":\"" + String(DEVICE_SECRET) + "\"}";
  int bodyLen = body.length();

  // ── 1. Configure SSL context (TLS 1.2, no client cert needed) ──────────────
  // sslctxID = 0, version = 3 (TLS 1.2), ciphersuite = default, sec level = 0 (no cert verify)
  // For production set sec level = 1 and upload your CA cert via AT+QSSLCFG
  if (!sendAT("AT+QSSLCFG=\"sslversion\",0,3", "OK")) return false;
  if (!sendAT("AT+QSSLCFG=\"seclevel\",0,0", "OK"))   return false;   // change to 1 + CA for prod

  // ── 2. Configure HTTP(S) client ─────────────────────────────────────────────
  if (!sendAT("AT+QHTTPCFG=\"contextid\",1", "OK"))                return false;
  if (!sendAT("AT+QHTTPCFG=\"requestheader\",0", "OK"))            return false;
  if (!sendAT("AT+QHTTPCFG=\"contenttype\",0", "OK"))              return false;  // 0 = application/json
  if (!sendAT("AT+QHTTPCFG=\"sslctxid\",0", "OK"))                 return false;

  // ── 3. Set URL ───────────────────────────────────────────────────────────────
  String url = "https://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + String(SERVER_PATH);
  String urlCmd = "AT+QHTTPURL=" + String(url.length()) + ",80";

  ec200u.println(urlCmd);
  String r = readResponse(3000);
  if (r.indexOf("CONNECT") == -1) {
    Serial.println("[HTTP] URL prompt not received");
    return false;
  }
  ec200u.print(url);
  if (!sendAT("", "OK", 5000)) return false;

  // ── 4. POST ──────────────────────────────────────────────────────────────────
  // AT+QHTTPPOST=<body_len>,<input_timeout>,<response_timeout>
  String postCmd = "AT+QHTTPPOST=" + String(bodyLen) + ",10,30";
  ec200u.println(postCmd);
  r = readResponse(3000);
  if (r.indexOf("CONNECT") == -1) {
    Serial.println("[HTTP] POST prompt not received");
    return false;
  }

  // Send the JSON body
  ec200u.print(body);
  Serial.print("[HTTP] Body: "); Serial.println(body);

  // Wait for HTTP response code
  r = readResponse(35000);
  Serial.print("[HTTP] Response: "); Serial.println(r);

  // EC200U returns +QHTTPPOST: <err>,<http_status>,<content_length>
  if (r.indexOf("+QHTTPPOST: 0,200") != -1 ||
      r.indexOf("+QHTTPPOST: 0,201") != -1) {
    Serial.println("[HTTP] Device registered / checked-in successfully!");

    // Optionally read the response body
    ec200u.println("AT+QHTTPREAD=10");
    String body_resp = readResponse(12000);
    Serial.print("[HTTP] Body response: "); Serial.println(body_resp);
    return true;
  }

  Serial.println("[HTTP] Server returned non-2xx or error");
  return false;
}

// ─── Arduino entry points ────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("=== Crux Device Boot ===");
  Serial.print("Device ID: "); Serial.println(DEVICE_ID);

  ec200u.begin(EC200U_BAUD, SERIAL_8N1, EC200U_RX_PIN, EC200U_TX_PIN);

  if (!initModem()) {
    Serial.println("[BOOT] Modem init failed. Halting.");
    while (true) delay(1000);
  }

  if (!postDeviceRegister()) {
    Serial.println("[BOOT] Device registration failed. Will retry on next boot.");
  }

  Serial.println("[BOOT] Setup complete.");
}

void loop() {
  // Your main sensor reading / data sending logic goes here
  delay(10000);
}
