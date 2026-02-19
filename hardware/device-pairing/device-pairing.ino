#include "secrets.h"

void setup() {
  Serial.begin(115200);
  delay(2000);

  Serial.println("Device Info:");
  Serial.print("Device ID: ");
  Serial.println(DEVICE_ID);

  Serial.print("Device Secret: ");
  Serial.println(DEVICE_SECRET);
}

void loop() {
}
