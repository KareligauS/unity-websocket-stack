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

struct WifiNetwork { const char* ssid; const char* password; };

static const WifiNetwork WIFI_NETWORKS[] = {
  { "Black Brick Bottom Floor Wifi",   "BBBFW31F" },   // primary
  { "kgserver2",  "holran344" },  // secondary — edit as needed
};
static const int          WIFI_NETWORK_COUNT      = sizeof(WIFI_NETWORKS) / sizeof(WIFI_NETWORKS[0]);
static const unsigned long WIFI_CONNECT_TIMEOUT_MS = 10000UL;  // per-network attempt
static const unsigned long WIFI_CHECK_INTERVAL_MS  = 5000UL;   // how often loop checks WiFi

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
const uint8_t DOG_ID    = 2;  // HuskyLens ID of the trained "dog" class
const uint8_t CAT_ID    = 3;  // HuskyLens ID of the trained "cat" class
const uint8_t BIRD_ID   = 4;  // HuskyLens ID of the trained "other" class

// ── Timing ────────────────────────────────────────────────────────────────────

#define MAX_BUFFER_SIZE  200   // absolute cap regardless of interval settings

// ── Configuration ─────────────────────────────────────────────────────────────

const int EVENT_DETECTION  = 3;
const int EVENT_COUNT_LINE = 4;
const int EVENT_SETTINGS   = 5;  // admin → ESP: {"send_interval":ms,"poll_ms":ms}

// ── Globals ───────────────────────────────────────────────────────────────────

HUSKYLENS        huskylens;
WebSocketsClient ws;
bool             wsConnected    = false;
int              lastCount      = -1;
uint32_t         reportN        = 0;
int              currentNetIdx  = 0;
unsigned long    lastWifiCheck  = 0;

// Runtime-adjustable timing settings (updated via event 5)
unsigned long pollMs         = 50UL;
unsigned long sendIntervalMs = 500UL;

// Per-count weights (index 1–7); priority = freq * weight
float countWeights[8] = {0.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f};

uint8_t       countBuffer[MAX_BUFFER_SIZE];
int           bufferLen  = 0;
unsigned long lastPollAt = 0;
unsigned long lastSendAt = 0;

// ── WebSocket event handler ───────────────────────────────────────────────────

// Extract an integer value for "key": N from a JSON string.
static float jsonGetFloat(const char* json, const char* key) {
  char search[40];
  snprintf(search, sizeof(search), "\"%s\"", key);
  const char* p = strstr(json, search);
  if (!p) return -1.0f;
  p = strchr(p + strlen(search), ':');
  if (!p) return -1.0f;
  while (*p == ':' || *p == ' ') p++;
  return atof(p);
}

static long jsonGetInt(const char* json, const char* key) {
  char search[40];
  snprintf(search, sizeof(search), "\"%s\"", key);
  const char* p = strstr(json, search);
  if (!p) return -1;
  p = strchr(p + strlen(search), ':');
  if (!p) return -1;
  while (*p == ':' || *p == ' ') p++;
  return atol(p);
}

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
    case WStype_TEXT: {
      const char* json = (const char*)payload;
      long evId = jsonGetInt(json, "event");
      if (evId == EVENT_SETTINGS) {
        long newSendInterval = jsonGetInt(json, "send_interval");
        long newPollMs       = jsonGetInt(json, "poll_ms");
        if (newSendInterval > 0) {
          sendIntervalMs = (unsigned long)newSendInterval;
          Serial.printf("[CFG] send_interval → %lu ms\n", sendIntervalMs);
        }
        if (newPollMs > 0) {
          pollMs = (unsigned long)newPollMs;
          Serial.printf("[CFG] poll_ms → %lu ms\n", pollMs);
        }
        for (int i = 1; i <= 7; i++) {
          char key[4];
          snprintf(key, sizeof(key), "w%d", i);
          float w = jsonGetFloat(json, key);
          if (w >= 0.0f) {
            countWeights[i] = w;
            Serial.printf("[CFG] w%d → %.2f\n", i, w);
          }
        }
        bufferLen = 0;  // discard partial buffer after settings change
      }
      break;
    }
    default:
      break;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns the highest-priority non-zero count (priority = freq * weight).
// Writes the winning priority into *outPriority if non-null.
static int mostFrequentNonZero(const uint8_t* buf, int len, float* outPriority = nullptr) {
  uint8_t freq[16] = {};
  for (int i = 0; i < len; i++) {
    if (buf[i] > 0) freq[buf[i] < 16 ? buf[i] : 15]++;
  }
  int   best         = 0;
  float bestPriority = 0.0f;
  for (int i = 1; i < 16; i++) {
    if (freq[i] == 0) continue;
    float w        = (i <= 7) ? countWeights[i] : 1.0f;
    float priority = freq[i] * w;
    if (priority > bestPriority) { bestPriority = priority; best = i; }
  }
  if (outPriority) *outPriority = bestPriority;
  return best;
}

static int readCount() {
  if (!huskylens.request()) return 0;
  if (MODE == MODE_FACE) return huskylens.countBlocks();

  int n = 0;
  for (int i = 0; i < huskylens.countBlocks(); i++) {
    auto block = huskylens.getBlock(i);
    if (block.ID == PERSON_ID || block.ID == CAT_ID || block.ID == DOG_ID || block.ID == BIRD_ID) n++;
  }
  return n;
}

void printBuffer(const uint8_t* buf, int len, int dominant, float priority) {
  uint8_t freq[16] = {};
  for (int i = 0; i < len; i++) {
    uint8_t v = buf[i] < 16 ? buf[i] : 15;
    freq[v]++;
  }
  Serial.printf("[N=%u] ", reportN);
  Serial.printf("%d [priority=%.2f]  ←  ", dominant, priority);
  bool first = true;
  for (int i = 0; i < 16; i++) {
    if (freq[i] == 0) continue;
    if (!first) Serial.print(", ");
    float w = (i >= 1 && i <= 7) ? countWeights[i] : 1.0f;
    Serial.printf("%d×%d(%.2f)", i, freq[i], freq[i] * w);
    first = false;
  }
  Serial.println();
}

void sendCountLine(uint32_t n, int dominant, float priority, const uint8_t* buf, int len) {
  uint8_t freq[16] = {};
  for (int i = 0; i < len; i++) {
    uint8_t v = buf[i] < 16 ? buf[i] : 15;
    freq[v]++;
  }

  // Build distribution JSON array: [{"v":0,"f":3}, ...]
  char dist[128];
  int pos = 0;
  pos += snprintf(dist + pos, sizeof(dist) - pos, "[");
  bool first = true;
  for (int i = 0; i < 16; i++) {
    if (freq[i] == 0) continue;
    if (!first) pos += snprintf(dist + pos, sizeof(dist) - pos, ",");
    pos += snprintf(dist + pos, sizeof(dist) - pos, "{\"v\":%d,\"f\":%d}", i, freq[i]);
    first = false;
  }
  snprintf(dist + pos, sizeof(dist) - pos, "]");

  char buf2[256];
  snprintf(buf2, sizeof(buf2),
    "{\"type\":\"event\",\"event\":%d,\"data\":{\"n\":%u,\"dominant\":%d,\"priority\":%.2f,\"dist\":%s}}",
    EVENT_COUNT_LINE, n, dominant, priority, dist);
  if (wsConnected) {
    ws.sendTXT(buf2);
  }
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

// ── WiFi helpers ──────────────────────────────────────────────────────────────

// Tries each network in round-robin order starting after the last known good
// one. Returns true if connected, false if all networks timed out.
bool connectWiFi() {
  for (int attempt = 0; attempt < WIFI_NETWORK_COUNT; attempt++) {
    int idx = (currentNetIdx + attempt) % WIFI_NETWORK_COUNT;
    Serial.printf("[WiFi] trying \"%s\"...\n", WIFI_NETWORKS[idx].ssid);
    WiFi.disconnect(true);
    delay(100);
    WiFi.begin(WIFI_NETWORKS[idx].ssid, WIFI_NETWORKS[idx].password);

    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED) {
      if (millis() - start >= WIFI_CONNECT_TIMEOUT_MS) break;
      delay(500);
      Serial.print(".");
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
      currentNetIdx = idx;
      Serial.printf("[WiFi] connected to \"%s\" — IP: %s\n",
        WIFI_NETWORKS[idx].ssid, WiFi.localIP().toString().c_str());
      return true;
    }
    Serial.printf("[WiFi] \"%s\" failed, trying next\n", WIFI_NETWORKS[idx].ssid);
    // advance so next attempt starts on the next network
    currentNetIdx = (idx + 1) % WIFI_NETWORK_COUNT;
  }
  Serial.println("[WiFi] all networks unreachable");
  return false;
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

  while (!connectWiFi()) {
    Serial.println("[WiFi] retrying all networks in 5 s...");
    delay(5000);
  }

  if (WS_TLS) {
    ws.beginSSL(WS_HOST, WS_PORT, WS_PATH);
  } else {
    ws.begin(WS_HOST, WS_PORT, WS_PATH);
  }
  ws.onEvent(onWsEvent);
  ws.setReconnectInterval(3000);
}

void loop() {
  unsigned long now = millis();

  // Periodically check WiFi; on loss, try next network then let WS reconnect.
  if (now - lastWifiCheck >= WIFI_CHECK_INTERVAL_MS) {
    lastWifiCheck = now;
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[WiFi] connection lost, reconnecting...");
      wsConnected = false;
      if (connectWiFi()) {
        // Re-init WebSocket after WiFi is back
        if (WS_TLS) {
          ws.beginSSL(WS_HOST, WS_PORT, WS_PATH);
        } else {
          ws.begin(WS_HOST, WS_PORT, WS_PATH);
        }
      }
    }
  }

  ws.loop();

  if (now - lastPollAt >= pollMs) {
    lastPollAt = now;
    int bufCap = (int)(sendIntervalMs / pollMs);
    if (bufCap > MAX_BUFFER_SIZE) bufCap = MAX_BUFFER_SIZE;
    if (bufferLen < bufCap) {
      countBuffer[bufferLen++] = (uint8_t)readCount();
    }
  }

  if (now - lastSendAt >= sendIntervalMs && bufferLen > 0) {
    lastSendAt = now;
    reportN++;
    float dominantPriority = 0.0f;
    int dominant = mostFrequentNonZero(countBuffer, bufferLen, &dominantPriority);
    printBuffer(countBuffer, bufferLen, dominant, dominantPriority);
    sendCountLine(reportN, dominant, dominantPriority, countBuffer, bufferLen);
    bufferLen = 0;
    if (dominant != lastCount) {
      sendCount(dominant);
      lastCount = dominant;
    }
  }
}
