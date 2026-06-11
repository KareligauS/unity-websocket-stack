import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Unity WebSocket Platform",
  description: "WebSocket platform for Unity remote web operations",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
