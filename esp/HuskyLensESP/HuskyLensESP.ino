// HuskyLens ESP WebSocket Client
// Reads HuskyLens and sends person-count events directly to the WebSocket
// server over WiFi — no USB-serial bridge required.
//
// Wiring (I2C):
//   HuskyLens SDA → ESP32 GPIO 21  |  ESP8266 D2 (GPIO 4)
//   HuskyLens SCL → ESP32 GPIO 22  |  ESP8266 D1 (GPIO 5)
//   HuskyLens VCC → 5 V
//   HuskyLens GND → GND
//
// Required libraries (install via Library Manager):
//   - "HUSKYLENS" by DFRobot
//   - "WebSockets"  by Markus Sattler (Links2004)

#ifdef ESP8266
  #include <ESP8266WiFi.h>
#else
  #include <WiFi.h>
#endif

#include <WebSocketsClient.h>
#include <Wire.h>
#include "HUSKYLENS.h"

// ── WiFi / Server ─────────────────────────────────────────────────────────────

#define WIFI_SSID     "kgserver2"
#define WIFI_PASSWORD "holran344"

#define WS_HOST  "unity-websocket-stack.onrender.com"
#define WS_PORT  443
#define WS_PATH  "/"
#define WS_TLS   true

// ── Mode ──────────────────────────────────────────────────────────────────────
// FACE   — counts every detected face (no training needed)
// OBJECT — counts only the trained object with PERSON_ID

#define MODE_FACE   0
#define MODE_OBJECT 1

const int     MODE      = MODE_OBJECT;
const uint8_t PERSON_ID = 1;  // HuskyLens ID of the trained "person" class

// ── Timing ────────────────────────────────────────────────────────────────────

#define POLL_MS          50UL
#define SEND_INTERVAL_MS 2000UL
#define BUFFER_SIZE      (SEND_INTERVAL_MS / POLL_MS)  // number of slots

// ── Configuration ─────────────────────────────────────────────────────────────

const int EVENT_DETECTION = 3;

// ── Globals ───────────────────────────────────────────────────────────────────

HUSKYLENS        huskylens;
WebSocketsClient ws;
bool             wsConnected = false;
int              lastCount   = -1;
uint32_t         reportN     = 0;

uint8_t       countBuffer[BUFFER_SIZE];
int           bufferLen  = 0;
unsigned long lastPollAt = 0;
unsigned long lastSendAt = 0;

// ── WebSocket event handler ───────────────────────────────────────────────────

void onWsEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      wsConnected = true;
      Serial.println("[WS] connected");
      break;
    case WStype_DISCONNECTED:
      wsConnected = false;
      Serial.println("[WS] disconnected — will retry");
      break;
    default:
      break;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns the most frequent non-zero value, or 0 if all entries are zero.
static int mostFrequentNonZero(const uint8_t* buf, int len) {
  uint8_t freq[16] = {};
  for (int i = 0; i < len; i++) {
    if (buf[i] > 0) freq[buf[i] < 16 ? buf[i] : 15]++;
  }
  int best = 1;
  for (int i = 2; i < 16; i++) {
    if (freq[i] > freq[best]) best = i;
  }
  return freq[best] > 0 ? best : 0;
}

static int readCount() {
  if (!huskylens.request()) return 0;
  if (MODE == MODE_FACE) return huskylens.countBlocks();

  int n = 0;
  for (int i = 0; i < huskylens.countBlocks(); i++) {
    if (huskylens.getBlock(i).ID == PERSON_ID) n++;
  }
  return n;
}

void printBuffer(const uint8_t* buf, int len, int dominant) {
  uint8_t freq[16] = {};
  for (int i = 0; i < len; i++) {
    uint8_t v = buf[i] < 16 ? buf[i] : 15;
    freq[v]++;
  }
  Serial.printf("[N=%u] ", reportN);
  Serial.printf("%d  ←  ", dominant);
  bool first = true;
  for (int i = 0; i < 16; i++) {
    if (freq[i] == 0) continue;
    if (!first) Serial.print(", ");
    Serial.printf("%d-%d", i, freq[i]);
    first = false;
  }
  Serial.println();
}

void sendCount(int count) {
  char buf[96];
  snprintf(buf, sizeof(buf),
    "{\"type\":\"event\",\"event\":%d,\"data\":{\"count\":%d,\"mode\":\"%s\"}}",
    EVENT_DETECTION, count, MODE == MODE_FACE ? "face" : "object");
  if (wsConnected) {
    ws.sendTXT(buf);
    Serial.printf("[WS] sent count=%d\n", count);
  } else {
    Serial.println("[WS] not connected, skipped send");
  }
}

// ── Setup / Loop ──────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  Wire.begin();

  Serial.print("[HS] waiting");
  while (!huskylens.begin(Wire)) {
    Serial.print(".");
    delay(500);
  }
  huskylens.writeAlgorithm(
    MODE == MODE_FACE ? ALGORITHM_FACE_RECOGNITION : ALGORITHM_OBJECT_RECOGNITION
  );
  Serial.println(" ready");

  Serial.printf("[WS] connecting to %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[WS] wifi up: %s\n", WiFi.localIP().toString().c_str());

  if (WS_TLS) {
    ws.beginSSL(WS_HOST, WS_PORT, WS_PATH);
  } else {
    ws.begin(WS_HOST, WS_PORT, WS_PATH);
  }
  ws.onEvent(onWsEvent);
  ws.setReconnectInterval(3000);
}

void loop() {
  ws.loop();

  unsigned long now = millis();

  if (now - lastPollAt >= POLL_MS) {
    lastPollAt = now;
    if (bufferLen < BUFFER_SIZE) {
      countBuffer[bufferLen++] = (uint8_t)readCount();
    }
  }

  if (now - lastSendAt >= SEND_INTERVAL_MS && bufferLen > 0) {
    lastSendAt = now;
    reportN++;
    int dominant = mostFrequentNonZero(countBuffer, bufferLen);
    printBuffer(countBuffer, bufferLen, dominant);
    bufferLen = 0;
    if (dominant != lastCount) {
      sendCount(dominant);
      lastCount = dominant;
    }
  }
}
