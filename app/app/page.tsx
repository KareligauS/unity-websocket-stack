"use client";

import { useEffect, useState } from "react";
import { WebSocketClient } from "@/lib/WebSocketClient";

export default function Home() {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [client, setClient] = useState<WebSocketClient | null>(null);
  const [connecting, setConnecting] = useState(true);

  useEffect(() => {
    const wsClient = new WebSocketClient();

    wsClient
      .connect()
      .then(() => {
        setConnected(true);
        setConnecting(false);
        setClient(wsClient);

        const unsubscribe = wsClient.on(1, (data) => {
          setMessages((prev) => [...prev, `Event ${data.event} received`]);
        });

        return unsubscribe;
      })
      .catch((error) => {
        console.error("Connection failed:", error);
        setMessages((prev) => [...prev, `Connection failed: ${error.message}`]);
        setConnecting(false);
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
    <main style={{ padding: "20px", fontFamily: "Arial, sans-serif", maxWidth: "800px", margin: "0 auto" }}>
      <h1>🚀 Unity WebSocket Platform</h1>

      <div
        style={{
          marginBottom: "20px",
          padding: "12px 16px",
          backgroundColor: connecting ? "#fef3c7" : connected ? "#d1fae5" : "#fee2e2",
          borderRadius: "6px",
          border: `1px solid ${connecting ? "#fcd34d" : connected ? "#6ee7b7" : "#fca5a5"}`,
        }}
      >
        <p>
          <strong>Status:</strong> {connecting ? "Connecting..." : connected ? "✓ Connected" : "✗ Disconnected"}
        </p>
        {process.env.NEXT_PUBLIC_WS_URL && (
          <p style={{ fontSize: "12px", color: "#666", margin: "4px 0 0 0" }}>
            Connected to: {process.env.NEXT_PUBLIC_WS_URL}
          </p>
        )}
      </div>

      <div style={{ marginBottom: "20px" }}>
        <h2>Send Events</h2>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => sendEvent(1)} disabled={!connected}>
            Send Event 1
          </button>
          <button onClick={() => sendEvent(2)} disabled={!connected}>
            Send Event 2
          </button>
          <button onClick={() => setMessages([])} style={{ marginLeft: "auto", background: "#6b7280" }}>
            Clear Messages
          </button>
        </div>
      </div>

      <div>
        <h2>Messages ({messages.length})</h2>
        <div
          style={{
            border: "1px solid #d1d5db",
            padding: "12px",
            minHeight: "200px",
            backgroundColor: "#f9fafb",
            borderRadius: "6px",
            maxHeight: "400px",
            overflowY: "auto",
            fontSize: "14px",
            fontFamily: "monospace",
          }}
        >
          {messages.length === 0 ? (
            <p style={{ color: "#9ca3af" }}>No messages yet...</p>
          ) : (
            messages.map((msg, i) => (
              <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid #e5e7eb" }}>
                {msg}
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
