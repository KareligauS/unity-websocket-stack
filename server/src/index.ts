import { createServer } from "http";
import WebSocket, { WebSocketServer, RawData } from "ws";
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

const httpServer = createServer(app);

// WebSocket piggybacks on the same HTTP server (required for single-port hosts like Render)
const wss = new WebSocketServer({
  server: httpServer,
  perMessageDeflate: false,
});

interface WebSocketEvent {
  type: "event";
  event: number;
}

let connectedClients = 0;

wss.on("connection", (ws: WebSocket) => {
  connectedClients++;
  console.log(`Client connected. Total clients: ${connectedClients}`);

  ws.on("message", (data: RawData) => {
    try {
      const message: WebSocketEvent = JSON.parse(data.toString());

      if (message.type === "event") {
        console.log(`Received event: ${message.event}`);

        // Broadcast to all connected clients
        wss.clients.forEach((client: WebSocket) => {
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

  ws.on("error", (error: Error) => {
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

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (HTTP + WebSocket)`);
});
