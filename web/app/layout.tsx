import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Funding Rate Arbitrage | Dual-Venue Basis Trading",
  description: "Cross-exchange funding rate basis trading across Binance USD-M and Bitget Perpetuals.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#09090b",
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
