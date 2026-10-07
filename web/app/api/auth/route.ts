import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface UserProfile {
  id: string;
  username: string;
  email: string;
  role: string;
  tier: string;
  binanceStatus: "CONNECTED" | "DISCONNECTED";
  bitgetStatus: "CONNECTED" | "DISCONNECTED";
  runServerBotWhenLoggedOut: boolean;
  lastLogin: string;
}

const DEFAULT_PROFILE: UserProfile = {
  id: "usr_quant_984",
  username: "InstitutionalQuant",
  email: "demo@quantfunds.io",
  role: "Lead Portfolio Manager",
  tier: "VIP Institutional (Zero Maker Fee)",
  binanceStatus: "CONNECTED",
  bitgetStatus: "CONNECTED",
  runServerBotWhenLoggedOut: true,
  lastLogin: new Date().toISOString(),
};

export async function GET(req: Request) {
  // Check auth cookie or header
  const authCookie = req.headers.get("cookie") || "";
  const isLoggedIn = authCookie.includes("auth_session=") || true; // Demo default active

  return NextResponse.json({
    success: true,
    isLoggedIn,
    profile: DEFAULT_PROFILE,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = body.action || "login";

  if (action === "logout") {
    const res = NextResponse.json({
      success: true,
      action: "logout",
      message: "Logged out. Server autonomous bot continues running in background 24/7.",
      serverBotActive: true,
    });
    res.cookies.set("auth_session", "", { maxAge: 0, path: "/" });
    return res;
  }

  // Login or Register
  const email = body.email || "demo@quantfunds.io";
  const username = body.username || (email.split("@")[0] || "Trader");

  const profile: UserProfile = {
    ...DEFAULT_PROFILE,
    email,
    username,
    lastLogin: new Date().toISOString(),
  };

  const res = NextResponse.json({
    success: true,
    action: "login",
    profile,
    token: "token_" + Math.random().toString(36).substring(2, 12),
  });

  res.cookies.set("auth_session", "session_active", {
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    httpOnly: false,
  });

  return res;
}
