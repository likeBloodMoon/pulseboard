import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pulseboard Live Metrics",
  description: "Live device telemetry from the Pulseboard agent"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
