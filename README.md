# Unity WebSocket Stack

A WebSocket platform for Unity remote web operations with a simple event-based protocol.

## Project Structure

```
unity-websocket-stack/
├── app/              # Next.js frontend application
├── server/           # Node.js WebSocket server
├── client/           # Unity WebSocket client library
└── README.md         # This file
```

## WebSocket Protocol

Simple JSON-based event protocol:

```json
{
  "type": "event",
  "event": <int>
}
```

### Event Types

- **0**: Connection confirmation (sent by server)
- **1-N**: Custom events (user-defined)

---

## Getting Started

### 1. Server (Node.js)

**Development:**
```bash
cd server
npm install
npm run dev
```

**Production:**
```bash
cd server
npm install --production
npm start
```

Server runs on:
- HTTP: `http://localhost:8080`
- WebSocket: `ws://localhost:8081`

**Endpoints:**
- `GET /health` - Server health check
- `GET /stats` - Connected clients and timestamp

### 2. Frontend (Next.js)

```bash
cd app
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`

**Features:**
- Connect to WebSocket server
- Send and receive events
- Real-time message display

### 3. Unity Client

1. Install WebSocketSharp and Newtonsoft.Json via Unity Package Manager
2. Add the `client/Runtime/WebSocketClient.cs` script to your project
3. Attach `WebSocketClient` component to a GameObject
4. Use the sample in `Samples~/WebSocketExample.cs` as reference

**Usage:**

```csharp
WebSocketClient wsClient = GetComponent<WebSocketClient>();
wsClient.Connect("ws://localhost:8081");

// Listen to events
wsClient.On(1, (event) => {
    Debug.Log($"Received event: {event.@event}");
});

// Send events
wsClient.Send(1);
```

---

---

## Deployment

### Vercel (Frontend)

1. Connect your GitHub repo to Vercel
2. Set environment variable in Vercel dashboard:
   ```
   NEXT_PUBLIC_WS_URL=wss://your-server-url.onrender.com
   ```
3. Deploy automatically on push to main

### Render (Backend)

1. Create new Web Service from GitHub
2. Set root directory: `server`
3. Build command: `npm run build`
4. Start command: `npm start`
5. Add environment variables:
   ```
   PORT=10000
   WS_PORT=10001
   ```
6. Deploy

**Note:** WebSocket connections may require specific port configuration on your hosting provider.