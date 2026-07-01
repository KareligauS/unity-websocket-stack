"use client";

import { useEffect, useRef, useState } from "react";
import { WebSocketClient, WebSocketEvent } from "@/lib/WebSocketClient";
import { getCookie, setCookie } from "@/lib/cookies";

const COOKIE_PASSKEY       = "admin_passkey";
const COOKIE_SEND_INTERVAL = "esp_send_interval";
const COOKIE_POLL_MS       = "esp_poll_ms";
const COOKIE_COUNT_WEIGHTS = "esp_count_weights";

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
  priority?: number;
  dist: { v: number; f: number }[];
  receivedAt: string;
}

const TAB_MONITOR  = 0;
const TAB_COUNT    = 1;
const TAB_SETTINGS = 2;
const TAB_SEND     = 3;

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [client, setClient] = useState<WebSocketClient | null>(null);
  const [visitorCount, setVisitorCount] = useState("");
  const [espSendInterval, setEspSendInterval] = useState("1000");
  const [espPollMs, setEspPollMs] = useState("100");
  const [countWeights, setCountWeights] = useState<string[]>(Array(7).fill("1.0"));
  const [countLines, setCountLines] = useState<CountLine[]>([]);

  const [activeTab, setActiveTab] = useState(TAB_MONITOR);
  const [countLinesOpen, setCountLinesOpen] = useState(true);
  const [logOpen, setLogOpen] = useState(true);

  const counterRef = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);

  const tryLogin = (pw: string): boolean => {
    const expected = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;
    if (!expected || pw === expected) {
      setAuthed(true);
      setPasswordError(false);
      setCookie(COOKIE_PASSKEY, pw);
      return true;
    }
    return false;
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tryLogin(passwordInput)) {
      setPasswordError(true);
      setPasswordInput("");
    }
  };

  // Restore saved passkey and ESP settings from cookies on first load.
  useEffect(() => {
    const savedPasskey = getCookie(COOKIE_PASSKEY);
    if (savedPasskey) {
      setPasswordInput(savedPasskey);
      tryLogin(savedPasskey);
    }

    const savedSendInterval = getCookie(COOKIE_SEND_INTERVAL);
    if (savedSendInterval) setEspSendInterval(savedSendInterval);

    const savedPollMs = getCookie(COOKIE_POLL_MS);
    if (savedPollMs) setEspPollMs(savedPollMs);

    const savedWeights = getCookie(COOKIE_COUNT_WEIGHTS);
    if (savedWeights) {
      try {
        const parsed = JSON.parse(savedWeights);
        if (Array.isArray(parsed) && parsed.length === 7) setCountWeights(parsed);
      } catch {
        // ignore malformed cookie
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

        const unsub = wsClient.onAny((data) => addEntry("received", data.event));

        wsClient.on(4, (msg: WebSocketEvent) => {
          if (!msg.data) return;
          const { n, dominant, priority, dist } = msg.data as {
            n: number;
            dominant: number;
            priority?: number;
            dist: { v: number; f: number }[];
          };
          setCountLines((prev) =>
            [{ n, dominant, priority, dist, receivedAt: new Date().toLocaleTimeString() }, ...prev].slice(0, 10)
          );
        });

        return () => unsub();
      })
      .catch((error) => {
        console.error("Connection failed:", error);
        setConnecting(false);
      });

    return () => wsClient.disconnect();
  }, [authed]);

  useEffect(() => {
    if (logOpen && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log, logOpen]);

  const addEntry = (direction: EventDirection, eventId: number) => {
    setLog((prev) =>
      [...prev, { id: counterRef.current++, eventId, direction, timestamp: new Date() }].slice(-10)
    );
  };

  const sendSimpleEvent = (id: number) => {
    if (!client?.isConnected()) return;
    client.send(id);
    addEntry("sent", id);
  };

  const sendVisitorCount = () => {
    const count = parseInt(visitorCount, 10);
    if (isNaN(count) || !client?.isConnected()) return;
    client.send(3, { count });
    addEntry("sent", 3);
  };

  const summary = log.reduce<Record<number, { sent: number; received: number }>>(
    (acc, e) => {
      if (!acc[e.eventId]) acc[e.eventId] = { sent: 0, received: 0 };
      acc[e.eventId][e.direction]++;
      return acc;
    },
    {}
  );
  const seenIds = Object.keys(summary).map(Number).sort((a, b) => a - b);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 20px",
    fontSize: "14px",
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
    border: "none",
    borderBottom: active ? "2px solid #2563eb" : "2px solid transparent",
    backgroundColor: "transparent",
    color: active ? "#2563eb" : "#6b7280",
  });

  const sectionHeader = (
    label: string,
    open: boolean,
    toggle: () => void,
    onClear?: () => void
  ) => (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: open ? "8px" : 0 }}>
      <button
        onClick={toggle}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: "14px",
          fontWeight: 600,
          color: "#111827",
          padding: 0,
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <span style={{ fontSize: "11px", color: "#6b7280" }}>{open ? "▾" : "▸"}</span>
        {label}
      </button>
      {onClear && (
        <button
          onClick={onClear}
          style={{ fontSize: "12px", background: "#6b7280", padding: "2px 8px", marginLeft: "4px" }}
        >
          Clear
        </button>
      )}
    </div>
  );

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
      <h1 style={{ marginBottom: "16px" }}>Admin</h1>

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

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #d1d5db", marginBottom: "20px" }}>
        <button style={tabStyle(activeTab === TAB_MONITOR)}  onClick={() => setActiveTab(TAB_MONITOR)}>Monitor</button>
        <button style={tabStyle(activeTab === TAB_COUNT)}    onClick={() => setActiveTab(TAB_COUNT)}>Count Lines</button>
        <button style={tabStyle(activeTab === TAB_SETTINGS)} onClick={() => setActiveTab(TAB_SETTINGS)}>ESP Settings</button>
        <button style={tabStyle(activeTab === TAB_SEND)}     onClick={() => setActiveTab(TAB_SEND)}>Send Event</button>
      </div>

      {/* ── Tab 1: Monitor ── */}
      {activeTab === TAB_MONITOR && (
        <>
          {/* Per-event summary cards */}
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

          {/* Event log — collapsible */}
          <div>
            {sectionHeader(
              `Event log (last ${log.length})`,
              logOpen,
              () => setLogOpen((v) => !v),
              () => setLog([])
            )}
            {logOpen && (
              <div
                ref={logRef}
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  minHeight: "120px",
                  maxHeight: "280px",
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
            )}
          </div>
        </>
      )}

      {/* ── Tab 2: Count Lines ── */}
      {activeTab === TAB_COUNT && (
        <div>
          {sectionHeader(
            `Count lines (event 4)`,
            countLinesOpen,
            () => setCountLinesOpen((v) => !v),
            () => setCountLines([])
          )}
          {countLinesOpen && (
            countLines.length === 0 ? (
              <p style={{ color: "#6b7280", fontSize: "13px" }}>No data yet…</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "13px", fontFamily: "monospace" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #d1d5db", textAlign: "left" }}>
                      <th style={{ padding: "4px 10px" }}>Time</th>
                      <th style={{ padding: "4px 10px" }}>N</th>
                      <th style={{ padding: "4px 10px" }}>Dominant</th>
                      <th style={{ padding: "4px 10px" }}>Priority</th>
                      <th style={{ padding: "4px 10px" }}>Distribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {countLines.map((line, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "4px 10px", color: "#6b7280" }}>{line.receivedAt}</td>
                        <td style={{ padding: "4px 10px" }}>{line.n}</td>
                        <td style={{ padding: "4px 10px", fontWeight: "bold" }}>{line.dominant}</td>
                        <td style={{ padding: "4px 10px", color: "#7c3aed" }}>
                          {line.priority !== undefined ? line.priority.toFixed(2) : "—"}
                        </td>
                        <td style={{ padding: "4px 10px" }}>{line.dist.map((d) => `${d.v}×${d.f}`).join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}

      {/* ── Tab 3: Send Event ── */}
      {activeTab === TAB_SEND && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "480px" }}>
          {/* Manual visitor counter */}
          <div style={{ padding: "20px", border: "1px solid #d1d5db", borderRadius: "10px", backgroundColor: "#f9fafb" }}>
            <p style={{ margin: "0 0 4px 0", fontWeight: 600, fontSize: "15px" }}>Manual Visitor Count</p>
            <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "#6b7280" }}>
              Nudge the visitor counter up or down by one.
            </p>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => sendSimpleEvent(1)}
                disabled={!connected}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "14px",
                  fontSize: "20px",
                  fontWeight: 700,
                  color: "#fff",
                  backgroundColor: "#16a34a",
                  border: "none",
                  borderRadius: "8px",
                  cursor: connected ? "pointer" : "not-allowed",
                  opacity: connected ? 1 : 0.5,
                }}
              >
                +1
                <span style={{ fontSize: "11px", fontWeight: 400, opacity: 0.85 }}>event 1</span>
              </button>
              <button
                onClick={() => sendSimpleEvent(2)}
                disabled={!connected}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "14px",
                  fontSize: "20px",
                  fontWeight: 700,
                  color: "#fff",
                  backgroundColor: "#dc2626",
                  border: "none",
                  borderRadius: "8px",
                  cursor: connected ? "pointer" : "not-allowed",
                  opacity: connected ? 1 : 0.5,
                }}
              >
                −1
                <span style={{ fontSize: "11px", fontWeight: 400, opacity: 0.85 }}>event 2</span>
              </button>
            </div>
          </div>

          {/* Send absolute visitor count */}
          <div style={{ padding: "20px", border: "1px solid #d1d5db", borderRadius: "10px", backgroundColor: "#f9fafb" }}>
            <p style={{ margin: "0 0 4px 0", fontWeight: 600, fontSize: "15px" }}>Send Visitor Count</p>
            <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "#6b7280" }}>
              Push an absolute visitor count to Unity.
            </p>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type="number"
                min={0}
                value={visitorCount}
                onChange={(e) => setVisitorCount(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendVisitorCount(); }}
                placeholder="Count"
                disabled={!connected}
                style={{
                  padding: "10px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  fontSize: "14px",
                  width: "140px",
                }}
              />
              <button
                onClick={sendVisitorCount}
                disabled={!connected || visitorCount === ""}
                style={{
                  padding: "10px 22px",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#fff",
                  backgroundColor: "#2563eb",
                  border: "none",
                  borderRadius: "6px",
                  cursor: connected && visitorCount !== "" ? "pointer" : "not-allowed",
                  opacity: connected && visitorCount !== "" ? 1 : 0.5,
                }}
              >
                Send <span style={{ fontSize: "11px", fontWeight: 400, opacity: 0.85 }}>(event 3)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab 3: ESP Settings ── */}
      {activeTab === TAB_SETTINGS && (
        <div style={{ padding: "16px", border: "1px solid #d1d5db", borderRadius: "8px", backgroundColor: "#f9fafb", maxWidth: "520px" }}>
          <p style={{ margin: "0 0 16px 0", fontWeight: 600, fontSize: "14px" }}>ESP Settings — event 5</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
              send_interval (ms)
              <input
                type="number"
                min={100}
                max={30000}
                value={espSendInterval}
                onChange={(e) => setEspSendInterval(e.target.value)}
                disabled={!connected}
                style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", width: "160px" }}
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
                style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", width: "160px" }}
              />
            </label>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px" }}>
              <span style={{ fontWeight: 500 }}>Count weights (priority = freq × weight)</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                {countWeights.map((w, i) => (
                  <label key={i} style={{ display: "flex", flexDirection: "column", gap: "3px", fontSize: "12px" }}>
                    Count {i + 1}
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={w}
                      onChange={(e) => setCountWeights((prev) => {
                        const next = [...prev];
                        next[i] = e.target.value;
                        return next;
                      })}
                      disabled={!connected}
                      style={{ padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "12px", width: "100%" }}
                    />
                  </label>
                ))}
              </div>
            </div>

            <button
              disabled={!connected}
              style={{ alignSelf: "flex-start" }}
              onClick={() => {
                const si = parseInt(espSendInterval, 10);
                const pm = parseInt(espPollMs, 10);
                if (isNaN(si) || isNaN(pm) || !client?.isConnected()) return;
                const weights: Record<string, number> = {};
                countWeights.forEach((w, i) => {
                  const val = parseFloat(w);
                  if (!isNaN(val)) weights[`w${i + 1}`] = val;
                });
                client.send(5, { send_interval: si, poll_ms: pm, ...weights });
                addEntry("sent", 5);

                setCookie(COOKIE_SEND_INTERVAL, espSendInterval);
                setCookie(COOKIE_POLL_MS, espPollMs);
                setCookie(COOKIE_COUNT_WEIGHTS, JSON.stringify(countWeights));
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
