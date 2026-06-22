// HuskyLens Serial Bridge
// Counts people by face or by object recognition and sends the count over USB Serial.
// bridge.py forwards the JSON to the WebSocket server unchanged.
//
// Wiring (I2C):
//   HuskyLens SDA → Arduino SDA  (A4 on Uno, D21 on ESP32, D2 on ESP8266)
//   HuskyLens SCL → Arduino SCL  (A5 on Uno, D22 on ESP32, D1 on ESP8266)
//   HuskyLens VCC → 5 V (Uno) or 3.3 V (ESP)
//   HuskyLens GND → GND
//
// Required library: "HUSKYLENS" by DFRobot (install via Library Manager)

#include <Wire.h>
#include "HUSKYLENS.h"

// ── Mode ──────────────────────────────────────────────────────────────────────
// FACE   — counts every detected face (no training needed)
// OBJECT — counts recognised objects (requires training on the HuskyLens device)

#define MODE_FACE   0
#define MODE_OBJECT 1

const int MODE = MODE_OBJECT;

// ── Configuration ─────────────────────────────────────────────────────────────

const uint32_t      SERIAL_BAUD = 115200; // must match SERIAL_BAUD in bridge .env
const unsigned long POLL_MS     = 500;    // HuskyLens poll interval (ms)

// Event number received by Unity.
const int EVENT_DETECTION = 3;

// ── Globals ───────────────────────────────────────────────────────────────────

HUSKYLENS    huskylens;
int          lastCount = -1;    // -1 forces a send on the very first reading
unsigned long lastPollAt = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

// Sends {"type":"event","event":3,"data":{"count":N,"mode":"face"|"object"}}
void sendCount(int count) {
  Serial.print(F("{\"type\":\"event\",\"event\":"));
  Serial.print(EVENT_DETECTION);
  Serial.print(F(",\"data\":{\"count\":"));
  Serial.print(count);
  Serial.print(F(",\"mode\":\""));
  Serial.print(MODE == MODE_FACE ? F("face") : F("object"));
  Serial.println(F("\"}}"));
}

// ── Setup / Loop ──────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(SERIAL_BAUD);
  Wire.begin();

  while (!huskylens.begin(Wire)) {
    delay(500);
  }

  huskylens.writeAlgorithm(
    MODE == MODE_FACE ? ALGORITHM_FACE_RECOGNITION : ALGORITHM_OBJECT_RECOGNITION
  );
}

void loop() {
  if (millis() - lastPollAt < POLL_MS) return;
  lastPollAt = millis();

  int count = 0;
  if (huskylens.request()) {
    count = huskylens.countBlocks();
  }

  // Only transmit when the count changes to avoid spamming the bridge.
  if (count != lastCount) {
    sendCount(count);
    lastCount = count;
  }
}
