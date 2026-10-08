import { NextRequest } from "next/server";
import {
  findUserById,
  findUserByEmail,
  isUserAdminRole,
  SYSTEM_DEFAULT_BINANCE_KEY,
  SYSTEM_DEFAULT_BINANCE_SECRET,
  SYSTEM_DEFAULT_BITGET_KEY,
  SYSTEM_DEFAULT_BITGET_SECRET,
  SYSTEM_DEFAULT_BITGET_PASSPHRASE,
  UserAccount,
} from "./userStore";

export interface ResolvedCredentials {
  authorized: boolean;
  isAdmin: boolean;
  user: UserAccount | null;
  binanceKey: string;
  binanceSecret: string;
  binanceEndpoint: string;
  bitgetKey: string;
  bitgetSecret: string;
  bitgetPassphrase: string;
  bitgetEnv: string;
  error?: string;
}

export function resolveCallerCredentials(req: NextRequest): ResolvedCredentials {
  const cookieHeader = req.headers.get("cookie") || "";
  const authCookie = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("auth_session="));
  const rawSession = authCookie ? decodeURIComponent(authCookie.replace("auth_session=", "").trim()) : "";

  const emailHeader = req.headers.get("x-user-email");
  const idHeader = req.headers.get("x-user-id");

  let user: UserAccount | null = null;
  if (rawSession) {
    if (rawSession.startsWith("usr_")) {
      user = findUserById(rawSession) || null;
    }
    if (!user) {
      user = findUserByEmail(rawSession) || null;
    }
  }

  if (!user && (idHeader || emailHeader)) {
    if (idHeader) user = findUserById(idHeader) || null;
    if (!user && emailHeader) user = findUserByEmail(emailHeader) || null;
  }

  const isAdmin = user ? isUserAdminRole(user) : false;

  // Header-provided keys (e.g. from user's vault settings in localStorage)
  const headerBinanceKey = req.headers.get("x-binance-key")?.trim() || "";
  const headerBinanceSecret = req.headers.get("x-binance-secret")?.trim() || "";
  const headerBinanceEndpoint = req.headers.get("x-binance-endpoint")?.trim() || "https://demo-fapi.binance.com";

  const headerBitgetKey = req.headers.get("x-bitget-key")?.trim() || "";
  const headerBitgetSecret = req.headers.get("x-bitget-secret")?.trim() || "";
  const headerBitgetPassphrase = req.headers.get("x-bitget-passphrase")?.trim() || "";
  const headerBitgetEnv = req.headers.get("x-bitget-env")?.trim() || "demo";

  // Case 1: Caller is Admin (or admin credentials explicitly used)
  if (isAdmin || (user && user.role === "admin")) {
    const binanceKey = headerBinanceKey || user?.apiKeys?.binanceKey || SYSTEM_DEFAULT_BINANCE_KEY;
    const binanceSecret = headerBinanceSecret || user?.apiKeys?.binanceSecret || SYSTEM_DEFAULT_BINANCE_SECRET;
    const binanceEndpoint = headerBinanceEndpoint || user?.apiKeys?.binanceEndpoint || "https://demo-fapi.binance.com";

    const bitgetKey = headerBitgetKey || user?.apiKeys?.bitgetKey || SYSTEM_DEFAULT_BITGET_KEY;
    const bitgetSecret = headerBitgetSecret || user?.apiKeys?.bitgetSecret || SYSTEM_DEFAULT_BITGET_SECRET;
    const bitgetPassphrase = headerBitgetPassphrase || user?.apiKeys?.bitgetPassphrase || SYSTEM_DEFAULT_BITGET_PASSPHRASE;
    const bitgetEnv = headerBitgetEnv || user?.apiKeys?.bitgetEnv || "demo";

    return {
      authorized: true,
      isAdmin: true,
      user,
      binanceKey,
      binanceSecret,
      binanceEndpoint,
      bitgetKey,
      bitgetSecret,
      bitgetPassphrase,
      bitgetEnv,
    };
  }

  // Case 2: Standard non-admin User
  if (user && user.role !== "admin") {
    // Must use their own keys! Keys must NOT fall back to system admin keys.
    const userBinanceKey = headerBinanceKey || user.apiKeys?.binanceKey || "";
    const userBinanceSecret = headerBinanceSecret || user.apiKeys?.binanceSecret || "";
    const binanceEndpoint = headerBinanceEndpoint || user.apiKeys?.binanceEndpoint || "https://demo-fapi.binance.com";

    const userBitgetKey = headerBitgetKey || user.apiKeys?.bitgetKey || "";
    const userBitgetSecret = headerBitgetSecret || user.apiKeys?.bitgetSecret || "";
    const userBitgetPassphrase = headerBitgetPassphrase || user.apiKeys?.bitgetPassphrase || "";
    const bitgetEnv = headerBitgetEnv || user.apiKeys?.bitgetEnv || "demo";

    return {
      authorized: true,
      isAdmin: false,
      user,
      binanceKey: userBinanceKey,
      binanceSecret: userBinanceSecret,
      binanceEndpoint,
      bitgetKey: userBitgetKey,
      bitgetSecret: userBitgetSecret,
      bitgetPassphrase: userBitgetPassphrase,
      bitgetEnv,
    };
  }

  // Case 3: No session found (e.g. CLI test scripts or initial unauthenticated request)
  // If request has explicit headers, treat as custom caller
  if (headerBinanceKey && headerBinanceSecret) {
    return {
      authorized: true,
      isAdmin: false,
      user: null,
      binanceKey: headerBinanceKey,
      binanceSecret: headerBinanceSecret,
      binanceEndpoint: headerBinanceEndpoint,
      bitgetKey: headerBitgetKey,
      bitgetSecret: headerBitgetSecret,
      bitgetPassphrase: headerBitgetPassphrase,
      bitgetEnv: headerBitgetEnv,
    };
  }

  // Unauthenticated without custom keys
  return {
    authorized: false,
    isAdmin: false,
    user: null,
    binanceKey: "",
    binanceSecret: "",
    binanceEndpoint: headerBinanceEndpoint,
    bitgetKey: "",
    bitgetSecret: "",
    bitgetPassphrase: "",
    bitgetEnv: headerBitgetEnv,
    error: "Authentication required. Please sign in or provide your exchange API keys in settings.",
  };
}
