# Unity WebSocket Stack

A WebSocket platform for Unity remote web operations with a simple event-based protocol.

## Project Structure

```
unity-websocket-stack/
├── server/           # Node.js WebSocket + HTTP server
├── app/              # Next.js frontend
├── client/           # Unity WebSocket client library
├── tcp-bridge/       # Python bridge: Arduino USB Serial → WebSocket server
└── arduino/          # Arduino/ESP sketch
    └── SerialBridgeClient/SerialBridgeClient.ino
```

## WebSocket Protocol

Simple JSON event messages:

```json
{ "type": "event", "event": 0 }
```

| Event | Meaning |
|-------|---------|
| `0`   | Connection confirmation (sent by server on connect) |
| `1–N` | Custom events (user-defined) |

---

## Modules

### Server (Node.js)

WebSocket and HTTP on a single port.

```bash
cd server
npm install
npm run dev       # development (tsx, hot-reload)
npm start         # production (compiles then runs)
```

Runs on `http://localhost:8080` / `ws://localhost:8080`.

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /stats`  | Client count + timestamp |

---

### Frontend (Next.js)

```bash
cd app
npm install
npm run dev
```

Runs on `http://localhost:3000`. Connect, send, and receive events in the browser.

---

### Unity Client

1. Install **WebSocketSharp** and **Newtonsoft.Json** via Unity Package Manager.
2. Copy `client/Runtime/WebSocketClient.cs` into your project.
3. Attach `WebSocketClient` to a GameObject.
4. See `client/Samples~/Basic/WebSocketExample.cs` for a full example.

```csharp
WebSocketClient ws = GetComponent<WebSocketClient>();
ws.Connect("ws://localhost:8080");

ws.On(1, e => Debug.Log($"Event received: {e.@event}"));
ws.Send(2);
```

---

### Serial Bridge (Python)

Reads events from an Arduino over USB Serial and forwards them to the WebSocket server. Reconnects automatically if the serial port or WebSocket connection drops.

```
Arduino ──USB──► bridge.py ──WS──► WebSocket Server
```

**Setup:**

```bash
cd tcp-bridge
pip install -r requirements.txt
# Edit .env: set SERIAL_PORT and WS_URL
python bridge.py
```

**Arduino message formats** (newline-terminated):

| Arduino sends | Forwarded as |
|---|---|
| `1\n` | `{"type":"event","event":1}` |
| `{"type":"event","event":2}\n` | forwarded as-is |

**Configuration** (`.env`):

| Variable | Default | Description |
|---|---|---|
| `SERIAL_PORT` | `/dev/ttyUSB0` | Serial port the Arduino is on |
| `SERIAL_BAUD` | `115200` | Baud rate (must match the sketch) |
| `WS_URL` | `ws://localhost:8080` | WebSocket server URL (`wss://` for TLS) |
| `WS_RECONNECT_DELAY` | `3.0` | Seconds between WS reconnect attempts |
| `SERIAL_RECONNECT_DELAY` | `3.0` | Seconds between serial reconnect attempts |
| `LOG_LEVEL` | `INFO` | `DEBUG` / `INFO` / `WARNING` / `ERROR` |

Common serial port names: `/dev/cu.usbmodem*` (macOS), `/dev/ttyUSB0` (Linux), `COM3` (Windows).

---

### Arduino Sketch (HuskyLens face detection)

`arduino/SerialBridgeClient/SerialBridgeClient.ino` — polls a HuskyLens camera over I2C every 500 ms and sends the current face count over USB Serial whenever it changes.

**Required library:** install **HUSKYLENS** by DFRobot via the Arduino Library Manager.

**Wiring (I2C):**

| HuskyLens | Arduino Uno | ESP32 | ESP8266 |
|-----------|-------------|-------|---------|
| SDA | A4 | D21 | D2 |
| SCL | A5 | D22 | D1 |
| VCC | 5 V | 3.3 V | 3.3 V |
| GND | GND | GND | GND |

**Setup:**

1. Wire HuskyLens as above.
2. Open `arduino/SerialBridgeClient/SerialBridgeClient.ino` in the Arduino IDE.
3. Flash to your board.
4. Set `SERIAL_PORT` in `tcp-bridge/.env` to the port the board appears on.

**Message sent on face count change:**

```json
{ "type": "event", "event": 1, "faces": 3 }
```

The bridge passes JSON through unchanged, so Unity receives the full object including `faces`. On the Unity side, read it from `WebSocketEvent` (you may need to extend the model to include the `faces` field).

---

## Quick Start (Makefile)

```bash
make install      # install all dependencies
make server-dev   # start WebSocket server (dev mode)
make app-dev      # start Next.js frontend (dev mode)
make bridge       # start TCP bridge
```

Run server and frontend together:

```bash
make dev
```

See all commands: `make help`

---

## Deployment

### Render (Server)

1. New Web Service → root directory: `server`
2. Build command: `npm run build`
3. Start command: `npm start`
4. Env var: `PORT=10000`

### Vercel (Frontend)

1. Connect repo, set root directory: `app`
2. Env var: `NEXT_PUBLIC_WS_URL=wss://your-server.onrender.com`
3. Deploy on push to `main`
