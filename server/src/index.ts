import WebSocket from "ws";
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 8080;
const WS_PORT = process.env.WS_PORT || 8081;

app.use(cors());
app.use(express.json());

// WebSocket Server
const wss = new WebSocket.Server({ port: WS_PORT });

interface WebSocketEvent {
  type: "event";
  event: number;
}

let connectedClients = 0;

wss.on("connection", (ws) => {
  connectedClients++;
  console.log(`Client connected. Total clients: ${connectedClients}`);

  ws.on("message", (data) => {
    try {
      const message: WebSocketEvent = JSON.parse(data.toString());

      if (message.type === "event") {
        console.log(`Received event: ${message.event}`);

        // Broadcast to all connected clients
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
          }
        });
      }
    } catch (error) {
      console.error("Failed to parse message:", error);
    }
  });

  ws.on("close", () => {
    connectedClients--;
    console.log(`Client disconnected. Total clients: ${connectedClients}`);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });

  // Send initial connection message
  const connectMessage: WebSocketEvent = { type: "event", event: 0 };
  ws.send(JSON.stringify(connectMessage));
});

// HTTP Endpoints
app.get("/health", (req, res) => {
  res.json({ status: "ok", connectedClients });
});

app.get("/stats", (req, res) => {
  res.json({
    connectedClients,
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`HTTP Server running on http://localhost:${PORT}`);
  console.log(`WebSocket Server running on ws://localhost:${WS_PORT}`);
});
