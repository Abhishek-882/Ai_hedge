import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Funding Rate Arbitrage Cockpit // 3D Dual-Leg Engine",
  description: "Cross-exchange funding rate arbitrage platform with 3D WebGL Prismatic Core and testnet execution engine.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-zinc-100 min-h-screen antialiased selection:bg-accent-amber/20 selection:text-accent-amber">
        {children}
      </body>
    </html>
  );
}
