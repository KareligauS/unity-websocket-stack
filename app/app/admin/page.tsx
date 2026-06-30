"use client";

import { useEffect, useRef, useState } from "react";
import { WebSocketClient, WebSocketEvent } from "@/lib/WebSocketClient";

type EventDirection = "sent" | "received";

interface LogEntry {
  id: number;
  eventId: number;
  direction: EventDirection;
  timestamp: Date;
}

interface CountLine {
  n: number;
  dominant: number;
  dist: { v: number; f: number }[];
  receivedAt: string;
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [client, setClient] = useState<WebSocketClient | null>(null);
  const [sendInput, setSendInput] = useState("");
  const [espSendInterval, setEspSendInterval] = useState("500");
  const [espPollMs, setEspPollMs] = useState("50");
  const [countLines, setCountLines] = useState<CountLine[]>([]);
  const counterRef = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const expected = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;
    if (!expected || passwordInput === expected) {
      setAuthed(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
      setPasswordInput("");
    }
  };

  useEffect(() => {
    if (!authed) return;

    const wsClient = new WebSocketClient();

    wsClient.onClose(() => setConnected(false));

    wsClient
      .connect()
      .then(() => {
        setConnected(true);
        setConnecting(false);
        setClient(wsClient);

        const unsub = wsClient.onAny((data) =>
          addEntry("received", data.event)
        );

        wsClient.on(4, (msg: WebSocketEvent) => {
          if (!msg.data) return;
          const { n, dominant, dist } = msg.data as {
            n: number;
            dominant: number;
            dist: { v: number; f: number }[];
          };
          setCountLines((prev) =>
            [{ n, dominant, dist, receivedAt: new Date().toLocaleTimeString() }, ...prev].slice(0, 50)
          );
        });

        return () => unsub();
      })
      .catch((error) => {
        console.error("Connection failed:", error);
        setConnecting(false);
      });

    return () => {
      wsClient.disconnect();
    };
  }, [authed]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  const addEntry = (direction: EventDirection, eventId: number) => {
    setLog((prev) => [
      ...prev,
      { id: counterRef.current++, eventId, direction, timestamp: new Date() },
    ]);
  };

  const sendEvent = () => {
    const id = parseInt(sendInput, 10);
    if (isNaN(id) || !client?.isConnected()) return;
    client.send(id);
    addEntry("sent", id);
  };

  const handleSendKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") sendEvent();
  };

  // Build per-event summary from log
  const summary = log.reduce<Record<number, { sent: number; received: number }>>(
    (acc, e) => {
      if (!acc[e.eventId]) acc[e.eventId] = { sent: 0, received: 0 };
      acc[e.eventId][e.direction]++;
      return acc;
    },
    {}
  );
  const seenIds = Object.keys(summary)
    .map(Number)
    .sort((a, b) => a - b);

  if (!authed) {
    return (
      <main style={{ padding: "20px", fontFamily: "Arial, sans-serif", maxWidth: "400px", margin: "80px auto" }}>
        <h1 style={{ marginBottom: "8px" }}>Admin</h1>
        <p style={{ color: "#6b7280", marginBottom: "24px", fontSize: "14px" }}>
          Enter the admin password to continue.
        </p>
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Password"
            autoFocus
            style={{
              padding: "10px 12px",
              border: `1px solid ${passwordError ? "#ef4444" : "#d1d5db"}`,
              borderRadius: "6px",
              fontSize: "14px",
              outline: "none",
            }}
          />
          {passwordError && (
            <p style={{ color: "#ef4444", fontSize: "13px", margin: 0 }}>Incorrect password.</p>
          )}
          <button type="submit">Enter</button>
        </form>
      </main>
    );
  }

  return (
    <main style={{ padding: "20px", fontFamily: "Arial, sans-serif", maxWidth: "900px", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "16px" }}>Admin — Event Log</h1>

      {/* Status bar */}
      <div
        style={{
          marginBottom: "20px",
          padding: "10px 16px",
          backgroundColor: connecting ? "#fef3c7" : connected ? "#d1fae5" : "#fee2e2",
          borderRadius: "6px",
          border: `1px solid ${connecting ? "#fcd34d" : connected ? "#6ee7b7" : "#fca5a5"}`,
          fontSize: "14px",
        }}
      >
        <strong>Status:</strong>{" "}
        {connecting ? "Connecting…" : connected ? "✓ Connected" : "✗ Disconnected"}
        {process.env.NEXT_PUBLIC_WS_URL && (
          <span style={{ marginLeft: "12px", color: "#6b7280", fontSize: "12px" }}>
            {process.env.NEXT_PUBLIC_WS_URL}
          </span>
        )}
      </div>

      {/* Per-event summary cards — only shows events that have actually appeared */}
      {seenIds.length > 0 && (
        <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
          {seenIds.map((eventId) => {
            const c = summary[eventId];
            return (
              <div
                key={eventId}
                style={{
                  flex: "1 1 140px",
                  border: "1px solid #d1d5db",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  backgroundColor: "#f9fafb",
                }}
              >
                <p style={{ margin: "0 0 8px 0", fontWeight: 600, fontSize: "14px" }}>Event {eventId}</p>
                <div style={{ display: "flex", gap: "16px", fontSize: "13px" }}>
                  <span style={{ color: "#2563eb" }}>↑ {c.sent}</span>
                  <span style={{ color: "#16a34a" }}>↓ {c.received}</span>
                </div>
              </div>
            );
          })}
          <div
            style={{
              flex: "1 1 140px",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              padding: "12px 16px",
              backgroundColor: "#f9fafb",
            }}
          >
            <p style={{ margin: "0 0 8px 0", fontWeight: 600, fontSize: "14px" }}>Total</p>
            <div style={{ display: "flex", gap: "16px", fontSize: "13px" }}>
              <span style={{ color: "#2563eb" }}>↑ {log.filter((e) => e.direction === "sent").length}</span>
              <span style={{ color: "#16a34a" }}>↓ {log.filter((e) => e.direction === "received").length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Count lines (event 4) */}
      <div style={{ marginBottom: "20px" }}>
        <h2 style={{ marginBottom: "8px", fontSize: "16px" }}>
          Count lines (event 4)
          <button
            onClick={() => setCountLines([])}
            style={{ marginLeft: "12px", fontSize: "12px", background: "#6b7280", padding: "2px 8px" }}
          >
            Clear
          </button>
        </h2>
        {countLines.length === 0 ? (
          <p style={{ color: "#6b7280", fontSize: "13px" }}>No data yet…</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "13px", fontFamily: "monospace" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #d1d5db", textAlign: "left" }}>
                  <th style={{ padding: "4px 10px" }}>Time</th>
                  <th style={{ padding: "4px 10px" }}>N</th>
                  <th style={{ padding: "4px 10px" }}>Dominant</th>
                  <th style={{ padding: "4px 10px" }}>Distribution</th>
                </tr>
              </thead>
              <tbody>
                {countLines.map((line, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "4px 10px", color: "#6b7280" }}>{line.receivedAt}</td>
                    <td style={{ padding: "4px 10px" }}>{line.n}</td>
                    <td style={{ padding: "4px 10px", fontWeight: "bold" }}>{line.dominant}</td>
                    <td style={{ padding: "4px 10px" }}>{line.dist.map((d) => `${d.v}×${d.f}`).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ESP settings */}
      <div style={{ marginBottom: "20px", padding: "16px", border: "1px solid #d1d5db", borderRadius: "8px", backgroundColor: "#f9fafb" }}>
        <p style={{ margin: "0 0 12px 0", fontWeight: 600, fontSize: "14px" }}>ESP Settings (event 5)</p>
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
            send_interval (ms)
            <input
              type="number"
              min={100}
              max={30000}
              value={espSendInterval}
              onChange={(e) => setEspSendInterval(e.target.value)}
              disabled={!connected}
              style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", width: "140px" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
            poll_ms (ms)
            <input
              type="number"
              min={10}
              max={1000}
              value={espPollMs}
              onChange={(e) => setEspPollMs(e.target.value)}
              disabled={!connected}
              style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", width: "120px" }}
            />
          </label>
          <button
            disabled={!connected}
            onClick={() => {
              const si = parseInt(espSendInterval, 10);
              const pm = parseInt(espPollMs, 10);
              if (isNaN(si) || isNaN(pm) || !client?.isConnected()) return;
              client.send(5, { send_interval: si, poll_ms: pm });
              addEntry("sent", 5);
            }}
          >
            Apply
          </button>
        </div>
      </div>

      {/* Send controls */}
      <div style={{ marginBottom: "20px", display: "flex", gap: "8px", alignItems: "center" }}>
        <input
          type="number"
          min={0}
          value={sendInput}
          onChange={(e) => setSendInput(e.target.value)}
          onKeyDown={handleSendKey}
          placeholder="Event ID"
          disabled={!connected}
          style={{
            padding: "8px 12px",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            fontSize: "14px",
            width: "120px",
          }}
        />
        <button onClick={sendEvent} disabled={!connected || sendInput === ""}>
          Send
        </button>
        <button
          onClick={() => setLog([])}
          style={{ marginLeft: "auto", background: "#6b7280" }}
        >
          Clear Log
        </button>
      </div>

      {/* Event log */}
      <div>
        <h2 style={{ marginBottom: "8px", fontSize: "16px" }}>
          Event Log{" "}
          <span style={{ fontWeight: 400, color: "#6b7280", fontSize: "13px" }}>
            ({log.length} entries)
          </span>
        </h2>
        <div
          ref={logRef}
          style={{
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            minHeight: "260px",
            maxHeight: "480px",
            overflowY: "auto",
            backgroundColor: "#111827",
            padding: "8px",
            fontFamily: "monospace",
            fontSize: "13px",
          }}
        >
          {log.length === 0 ? (
            <p style={{ color: "#6b7280", padding: "8px" }}>No events yet…</p>
          ) : (
            log.map((e) => (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  gap: "12px",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  color: e.direction === "sent" ? "#93c5fd" : "#86efac",
                }}
              >
                <span style={{ color: "#6b7280", flexShrink: 0 }}>
                  {e.timestamp.toLocaleTimeString("en-US", { hour12: false })}.
                  {String(e.timestamp.getMilliseconds()).padStart(3, "0")}
                </span>
                <span style={{ flexShrink: 0, width: "60px" }}>
                  {e.direction === "sent" ? "↑ SENT" : "↓ RECV"}
                </span>
                <span>Event {e.eventId}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
