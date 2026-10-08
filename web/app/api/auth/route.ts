import { NextRequest, NextResponse } from "next/server";
import {
  authenticateUser,
  registerUser,
  findUserByEmail,
  findUserById,
  updateUserApiKeys,
  ADMIN_EMAIL_PRIMARY,
  ADMIN_EMAIL_ALIAS,
  ADMIN_DEFAULT_PASSWORD,
} from "@/lib/userStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") || "";
  const authCookie = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("auth_session="));

  const emailHeader = req.headers.get("x-user-email");
  const idHeader = req.headers.get("x-user-id");

  let user = null;

  if (authCookie) {
    const rawVal = decodeURIComponent(authCookie.replace("auth_session=", "").trim());
    if (rawVal) {
      if (rawVal.startsWith("usr_")) {
        user = findUserById(rawVal);
      }
      if (!user) {
        user = findUserByEmail(rawVal);
      }
    }
  }

  if (!user && (emailHeader || idHeader)) {
    if (idHeader) user = findUserById(idHeader);
    if (!user && emailHeader) user = findUserByEmail(emailHeader);
  }

  if (!user) {
    return NextResponse.json({
      success: true,
      isLoggedIn: false,
      user: null,
    });
  }

  // Sanitize user object for client
  const safeUser = {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin,
    apiKeys: user.role === "admin"
      ? user.apiKeys
      : {
          binanceKey: user.apiKeys?.binanceKey || "",
          binanceSecret: user.apiKeys?.binanceSecret ? "••••••••••••" : "",
          binanceEndpoint: user.apiKeys?.binanceEndpoint || "https://demo-fapi.binance.com",
          bitgetKey: user.apiKeys?.bitgetKey || "",
          bitgetSecret: user.apiKeys?.bitgetSecret ? "••••••••••••" : "",
          bitgetPassphrase: user.apiKeys?.bitgetPassphrase ? "••••••••••••" : "",
          bitgetEnv: user.apiKeys?.bitgetEnv || "demo",
        },
  };

  return NextResponse.json({
    success: true,
    isLoggedIn: true,
    user: safeUser,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "login";

    if (action === "logout") {
      const res = NextResponse.json({
        success: true,
        action: "logout",
        message: "Successfully signed out. Autonomous bot runs on server 24/7 if configured.",
      });
      res.cookies.set("auth_session", "", { path: "/", maxAge: 0 });
      res.cookies.set("auth_role", "", { path: "/", maxAge: 0 });
      res.cookies.set("auth_email", "", { path: "/", maxAge: 0 });
      return res;
    }

    if (action === "signup") {
      const { email, password, username } = body;
      if (!email || !password) {
        return NextResponse.json(
          { success: false, error: "Email and password are required" },
          { status: 400 }
        );
      }

      const result = registerUser(email, password, username);
      if (!result.success || !result.user) {
        return NextResponse.json(
          { success: false, error: result.error || "Failed to register" },
          { status: 400 }
        );
      }

      const user = result.user;
      const safeUser = {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
        apiKeys: user.apiKeys,
      };

      const res = NextResponse.json({
        success: true,
        action: "signup",
        user: safeUser,
      });

      res.cookies.set("auth_session", user.id, {
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
        httpOnly: false,
        sameSite: "lax",
      });
      res.cookies.set("auth_role", user.role, { path: "/", maxAge: 60 * 60 * 24 * 7 });
      res.cookies.set("auth_email", user.email, { path: "/", maxAge: 60 * 60 * 24 * 7 });

      return res;
    }

    if (action === "update_keys") {
      const cookieHeader = req.headers.get("cookie") || "";
      const authCookie = cookieHeader
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("auth_session="));
      const userId = body.userId || (authCookie ? decodeURIComponent(authCookie.replace("auth_session=", "")) : "");

      if (!userId) {
        return NextResponse.json({ success: false, error: "Unauthorized session" }, { status: 401 });
      }

      const result = updateUserApiKeys(userId, body.apiKeys || {});
      if (!result.success || !result.user) {
        return NextResponse.json({ success: false, error: result.error || "Failed to update keys" }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        user: {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
          apiKeys: result.user.role === "admin" ? result.user.apiKeys : { ...result.user.apiKeys, binanceSecret: "••••", bitgetSecret: "••••" },
        },
      });
    }

    // Default: Login
    const { email, password } = body;
    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and security password required" },
        { status: 400 }
      );
    }

    const authResult = authenticateUser(email, password);
    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        { success: false, error: authResult.error || "Authentication failed" },
        { status: 401 }
      );
    }

    const user = authResult.user;
    const safeUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      apiKeys: user.role === "admin"
        ? user.apiKeys
        : {
            binanceKey: user.apiKeys?.binanceKey || "",
            binanceSecret: user.apiKeys?.binanceSecret || "",
            binanceEndpoint: user.apiKeys?.binanceEndpoint || "https://demo-fapi.binance.com",
            bitgetKey: user.apiKeys?.bitgetKey || "",
            bitgetSecret: user.apiKeys?.bitgetSecret || "",
            bitgetPassphrase: user.apiKeys?.bitgetPassphrase || "",
            bitgetEnv: user.apiKeys?.bitgetEnv || "demo",
          },
    };

    const res = NextResponse.json({
      success: true,
      action: "login",
      user: safeUser,
    });

    res.cookies.set("auth_session", user.id, {
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      httpOnly: false,
      sameSite: "lax",
    });
    res.cookies.set("auth_role", user.role, { path: "/", maxAge: 60 * 60 * 24 * 7 });
    res.cookies.set("auth_email", user.email, { path: "/", maxAge: 60 * 60 * 24 * 7 });

    return res;
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
