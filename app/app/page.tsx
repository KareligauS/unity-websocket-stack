import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: "20px", fontFamily: "Arial, sans-serif", maxWidth: "400px", margin: "80px auto" }}>
      <h1 style={{ marginBottom: "8px" }}>Unity WebSocket Platform</h1>
      <p style={{ color: "#6b7280", marginBottom: "32px", fontSize: "14px" }}>Select a view to continue.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <Link href="/admin">
          <button style={{ width: "100%" }}>Admin</button>
        </Link>
        <Link href="/client">
          <button style={{ width: "100%", background: "#6b7280" }}>Client</button>
        </Link>
      </div>
    </main>
  );
}
