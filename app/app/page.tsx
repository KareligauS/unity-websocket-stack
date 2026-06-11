"use client";

import { useEffect, useState } from "react";
import { WebSocketClient } from "@/lib/WebSocketClient";

export default function Home() {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [client, setClient] = useState<WebSocketClient | null>(null);

  useEffect(() => {
    const wsClient = new WebSocketClient("ws://localhost:8080");

    wsClient
      .connect()
      .then(() => {
        setConnected(true);
        setClient(wsClient);

        const unsubscribe = wsClient.on(1, (data) => {
          setMessages((prev) => [...prev, `Event ${data.event} received`]);
        });

        return unsubscribe;
      })
      .catch((error) => {
        console.error("Connection failed:", error);
        setMessages((prev) => [...prev, "Connection failed"]);
      });

    return () => {
      wsClient.disconnect();
    };
  }, []);

  const sendEvent = (eventId: number) => {
    if (client?.isConnected()) {
      client.send(eventId);
      setMessages((prev) => [...prev, `Event ${eventId} sent`]);
    }
  };

  return (
    <main style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>Unity WebSocket Platform</h1>

      <div
        style={{
          marginBottom: "20px",
          padding: "10px",
          backgroundColor: connected ? "#e8f5e9" : "#ffebee",
          borderRadius: "4px",
        }}
      >
        <p>
          Status: <strong>{connected ? "Connected" : "Disconnected"}</strong>
        </p>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <h2>Send Events</h2>
        <button onClick={() => sendEvent(1)} disabled={!connected}>
          Send Event 1
        </button>
        <button onClick={() => sendEvent(2)} disabled={!connected} style={{ marginLeft: "10px" }}>
          Send Event 2
        </button>
      </div>

      <div>
        <h2>Messages</h2>
        <div
          style={{
            border: "1px solid #ccc",
            padding: "10px",
            minHeight: "200px",
            backgroundColor: "#f5f5f5",
            maxHeight: "400px",
            overflowY: "auto",
          }}
        >
          {messages.map((msg, i) => (
            <div key={i}>{msg}</div>
          ))}
        </div>
      </div>
    </main>
  );
}
