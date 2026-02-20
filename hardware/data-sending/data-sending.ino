/**
 * data-sending.ino
 *
 * ESP32-S3 reads battery sensor data and POSTs it to the Crux server
 * via the Quectel EC200U modem using AT commands over UART.
 *
 * Sensor pins are stubbed — configure them after soldering your hardware.
 *
 * Wiring (adjust pins to match your VVM601 board schematic):
 *   ESP32-S3 TX (GPIO17) → EC200U RX
 *   ESP32-S3 RX (GPIO18) → EC200U TX
 */

#include <Arduino.h>
#include <time.h>
#include "secrets.h"

// ─── Serial ports ─────────────────────────────────────────────────────────────
#define EC200U_BAUD   115200
#define EC200U_RX_PIN 18
#define EC200U_TX_PIN 17

HardwareSerial ec200u(1);   // UART1

// ─── Sensor Data struct ───────────────────────────────────────────────────────
struct SensorData {
  float temperature;  // °C
  float voltage;      // V
  float power;        // W
  float current;      // A
  float soc;          // % State of Charge
  float soh;          // % State of Health
};

// ─────────────────────────────────────────────────────────────────────────────
// TODO: Replace stubs with real sensor reads after soldering
// ─────────────────────────────────────────────────────────────────────────────
SensorData readSensors() {
  SensorData data;

  // ── Temperature ─────────────────────────────────────────────────────────
  // Example: NTC thermistor on ADC pin
  // int raw = analogRead(TEMP_PIN);
  // data.temperature = convertToTemp(raw);
  data.temperature = 35.2;  // STUB — replace with real read

  // ── Voltage ─────────────────────────────────────────────────────────────
  // Example: voltage divider on ADC pin
  // int raw = analogRead(VOLTAGE_PIN);
  // data.voltage = (raw / 4095.0) * 3.3 * VOLTAGE_DIVIDER_RATIO;
  data.voltage = 48.6;      // STUB

  // ── Current ─────────────────────────────────────────────────────────────
  // Example: INA219 or shunt resistor
  // data.current = readCurrentSensor();
  data.current = 2.48;      // STUB

  // ── Power (derived) ─────────────────────────────────────────────────────
  data.power = data.voltage * data.current;  // W = V × A

  // ── SOC ─────────────────────────────────────────────────────────────────
  // Example: coulomb counting or BMS IC
  // data.soc = readSOC();
  data.soc = 87.3;          // STUB (0–100%)

  // ── SOH ─────────────────────────────────────────────────────────────────
  // Example: BMS IC output or cycle count estimation
  // data.soh = readSOH();
  data.soh = 95.1;          // STUB (0–100%)

  return data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

bool sendAT(const char* cmd, const char* expected, unsigned long timeoutMs = 5000) {
  ec200u.println(cmd);
  Serial.print("[AT] >> "); Serial.println(cmd);

  String resp = "";
  unsigned long start = millis();
  while (millis() - start < timeoutMs) {
    while (ec200u.available()) {
      resp += (char)ec200u.read();
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

  if (!sendAT("AT", "OK", 3000))          return false;
  if (!sendAT("ATE0", "OK"))              return false;
  if (!sendAT("AT+CMEE=2", "OK"))         return false;
  if (!sendAT("AT+CIMI", "OK", 5000))     return false;

  String apnCmd = "AT+CGDCONT=1,\"IP\",\"" + String(APN) + "\"";
  if (!sendAT(apnCmd.c_str(), "OK"))      return false;

  Serial.println("[MODEM] Attaching to LTE...");
  if (!sendAT("AT+CGATT=1", "OK", 30000)) return false;

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

  if (!sendAT("AT+CGACT=1,1", "OK", 15000)) return false;

  Serial.println("[MODEM] Modem ready.");
  return true;
}

// ─── HTTPS POST ───────────────────────────────────────────────────────────────

bool postBatteryData(const SensorData& data) {
  // Build ISO-8601 timestamp (approximate — replace with NTP if needed)
  char recordedAt[30];
  unsigned long epochSec = millis() / 1000;
  snprintf(recordedAt, sizeof(recordedAt), "2026-01-01T00:00:%02luZ", epochSec % 60);

  // Build JSON body
  char body[512];
  snprintf(body, sizeof(body),
    "{\"deviceId\":\"%s\","
    "\"deviceSecret\":\"%s\","
    "\"temperature\":%.2f,"
    "\"voltage\":%.2f,"
    "\"power\":%.2f,"
    "\"current\":%.2f,"
    "\"soc\":%.2f,"
    "\"soh\":%.2f}",
    DEVICE_ID, DEVICE_SECRET,
    data.temperature, data.voltage, data.power,
    data.current, data.soc, data.soh
  );
  int bodyLen = strlen(body);

  Serial.print("[HTTP] Payload: "); Serial.println(body);

  // ── SSL config ───────────────────────────────────────────────────────────
  if (!sendAT("AT+QSSLCFG=\"sslversion\",0,3", "OK")) return false;
  if (!sendAT("AT+QSSLCFG=\"seclevel\",0,0", "OK"))   return false;

  // ── HTTP(S) client config ────────────────────────────────────────────────
  if (!sendAT("AT+QHTTPCFG=\"contextid\",1", "OK"))       return false;
  if (!sendAT("AT+QHTTPCFG=\"requestheader\",0", "OK"))   return false;
  if (!sendAT("AT+QHTTPCFG=\"contenttype\",0", "OK"))     return false;
  if (!sendAT("AT+QHTTPCFG=\"sslctxid\",0", "OK"))        return false;

  // ── Set URL ──────────────────────────────────────────────────────────────
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

  // ── POST ─────────────────────────────────────────────────────────────────
  String postCmd = "AT+QHTTPPOST=" + String(bodyLen) + ",10,30";
  ec200u.println(postCmd);
  r = readResponse(3000);
  if (r.indexOf("CONNECT") == -1) {
    Serial.println("[HTTP] POST prompt not received");
    return false;
  }

  ec200u.print(body);
  r = readResponse(35000);
  Serial.print("[HTTP] Response: "); Serial.println(r);

  if (r.indexOf("+QHTTPPOST: 0,201") != -1) {
    Serial.println("[HTTP] Battery data sent successfully!");
    ec200u.println("AT+QHTTPREAD=10");
    Serial.println(readResponse(12000));
    return true;
  }

  Serial.println("[HTTP] Server returned non-201 or error");
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

  Serial.println("[BOOT] Setup complete. Starting data loop.");
}

void loop() {
  Serial.println("[LOOP] Reading sensors...");
  SensorData data = readSensors();

  Serial.printf("[LOOP] Temp=%.2f°C  V=%.2fV  I=%.2fA  P=%.2fW  SOC=%.1f%%  SOH=%.1f%%\n",
    data.temperature, data.voltage, data.current, data.power, data.soc, data.soh);

  if (!postBatteryData(data)) {
    Serial.println("[LOOP] Failed to send data. Will retry next interval.");
  }

  Serial.printf("[LOOP] Sleeping for %d ms...\n", SEND_INTERVAL_MS);
  delay(SEND_INTERVAL_MS);
}
