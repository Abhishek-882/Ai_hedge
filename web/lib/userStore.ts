import fs from "fs";
import path from "path";
import { readDataFile, saveDataFile } from "./storagePath";
import {
  encryptVaultSecret,
  decryptVaultSecret,
  maskVaultKey,
  isMaskedSecret,
} from "./cryptoVault";

export interface UserApiKeys {
  binanceKey: string;
  binanceSecret: string;
  binanceEndpoint?: string;
  bitgetKey: string;
  bitgetSecret: string;
  bitgetPassphrase?: string;
  bitgetEnv?: string;
}

export interface UserAccount {
  id: string;
  email: string;
  username: string;
  password: string;
  role: "admin" | "user";
  createdAt: string;
  lastLogin: string;
  apiKeys: UserApiKeys;
}

const USERS_FILE_NAME = "user_accounts_store.json";

// System Admin Default Credentials
export const ADMIN_EMAIL_PRIMARY = "varsha633@gmailcom";
export const ADMIN_EMAIL_ALIAS = "varsha633@gmail.com";
export const ADMIN_DEFAULT_PASSWORD = "99129838aA@";

export const SYSTEM_DEFAULT_BINANCE_KEY =
  process.env.BINANCE_TESTNET_API_KEY || "RkqI5SmWN3z6DxKcAirPx48BmHpkA21FHPaeWFPsiJ4NbIvMAt4yTM3TsoLbHVAU";
export const SYSTEM_DEFAULT_BINANCE_SECRET =
  process.env.BINANCE_TESTNET_API_SECRET || "dpMSrQ1GDCPhNPnRRsIC0rCjzlDK9VfbC9fKXwptUGtqn2WdTKLZWekZqXykY00h";
export const SYSTEM_DEFAULT_BITGET_KEY =
  process.env.BITGET_API_KEY || "bg_2c493eb64032f2b0aea68c1c18d56e05";
export const SYSTEM_DEFAULT_BITGET_SECRET =
  process.env.BITGET_API_SECRET || "c77d2baac5b1fb84e9d900e15dfcac783b962d1da1837b50ff05daf68ac2f5f6";
export const SYSTEM_DEFAULT_BITGET_PASSPHRASE =
  process.env.BITGET_PASSPHRASE || "ArbitrageBot2027";

const globalForUsers = global as unknown as {
  userAccounts?: UserAccount[];
};

function getSeedAdminUser(): UserAccount {
  return {
    id: "usr_admin_varsha",
    email: ADMIN_EMAIL_PRIMARY,
    username: "Varsha (Admin)",
    password: ADMIN_DEFAULT_PASSWORD,
    role: "admin",
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
    apiKeys: {
      binanceKey: SYSTEM_DEFAULT_BINANCE_KEY,
      binanceSecret: encryptVaultSecret(SYSTEM_DEFAULT_BINANCE_SECRET),
      binanceEndpoint: "https://demo-fapi.binance.com",
      bitgetKey: SYSTEM_DEFAULT_BITGET_KEY,
      bitgetSecret: encryptVaultSecret(SYSTEM_DEFAULT_BITGET_SECRET),
      bitgetPassphrase: encryptVaultSecret(SYSTEM_DEFAULT_BITGET_PASSPHRASE),
      bitgetEnv: "demo",
    },
  };
}

export function loadUsers(): UserAccount[] {
  if (globalForUsers.userAccounts && globalForUsers.userAccounts.length > 0) {
    return globalForUsers.userAccounts;
  }

  try {
    const parsed = readDataFile<any[]>(USERS_FILE_NAME, []);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Ensure admin user exists with current credentials
      const hasAdmin = parsed.some(
        (u) => u.email?.toLowerCase() === ADMIN_EMAIL_PRIMARY || u.email?.toLowerCase() === ADMIN_EMAIL_ALIAS
      );
      if (!hasAdmin) {
        parsed.unshift(getSeedAdminUser());
      } else {
        // Always ensure admin password and role match required credentials
        const adminIdx = parsed.findIndex(
          (u) => u.email?.toLowerCase() === ADMIN_EMAIL_PRIMARY || u.email?.toLowerCase() === ADMIN_EMAIL_ALIAS
        );
        if (adminIdx >= 0) {
          parsed[adminIdx].password = ADMIN_DEFAULT_PASSWORD;
          parsed[adminIdx].role = "admin";
          if (!parsed[adminIdx].apiKeys?.binanceKey) {
            parsed[adminIdx].apiKeys = getSeedAdminUser().apiKeys;
          }
        }
      }

      // Lazy in-place re-encryption of legacy plaintext secrets
      for (const u of parsed) {
        if (u.apiKeys) {
          if (u.apiKeys.binanceSecret) u.apiKeys.binanceSecret = encryptVaultSecret(u.apiKeys.binanceSecret);
          if (u.apiKeys.bitgetSecret) u.apiKeys.bitgetSecret = encryptVaultSecret(u.apiKeys.bitgetSecret);
          if (u.apiKeys.bitgetPassphrase) u.apiKeys.bitgetPassphrase = encryptVaultSecret(u.apiKeys.bitgetPassphrase);
        }
      }

      globalForUsers.userAccounts = parsed;
      saveUsers(parsed);
      return parsed;
    }
  } catch {}

  const initial = [getSeedAdminUser()];
  globalForUsers.userAccounts = initial;
  saveUsers(initial);
  return initial;
}

export function saveUsers(users: UserAccount[]): void {
  globalForUsers.userAccounts = users;
  saveDataFile(USERS_FILE_NAME, users);
}

export function getAllActiveUsers(): UserAccount[] {
  return loadUsers();
}

/**
 * Returns plain-text decrypted keys for execution in trading engine
 */
export function getDecryptedUserApiKeys(user: UserAccount | null | undefined): UserApiKeys {
  if (!user || !user.apiKeys) {
    return {
      binanceKey: "",
      binanceSecret: "",
      binanceEndpoint: "https://demo-fapi.binance.com",
      bitgetKey: "",
      bitgetSecret: "",
      bitgetPassphrase: "",
      bitgetEnv: "demo",
    };
  }

  // Admin account fallback to system default if keys not explicitly populated
  if (user.role === "admin") {
    const bKey = user.apiKeys.binanceKey || SYSTEM_DEFAULT_BINANCE_KEY;
    const bSec = user.apiKeys.binanceSecret
      ? decryptVaultSecret(user.apiKeys.binanceSecret)
      : SYSTEM_DEFAULT_BINANCE_SECRET;
    const bgKey = user.apiKeys.bitgetKey || SYSTEM_DEFAULT_BITGET_KEY;
    const bgSec = user.apiKeys.bitgetSecret
      ? decryptVaultSecret(user.apiKeys.bitgetSecret)
      : SYSTEM_DEFAULT_BITGET_SECRET;
    const bgPass = user.apiKeys.bitgetPassphrase
      ? decryptVaultSecret(user.apiKeys.bitgetPassphrase)
      : SYSTEM_DEFAULT_BITGET_PASSPHRASE;

    return {
      binanceKey: bKey,
      binanceSecret: bSec,
      binanceEndpoint: user.apiKeys.binanceEndpoint || "https://demo-fapi.binance.com",
      bitgetKey: bgKey,
      bitgetSecret: bgSec,
      bitgetPassphrase: bgPass,
      bitgetEnv: user.apiKeys.bitgetEnv || "demo",
    };
  }

  return {
    binanceKey: user.apiKeys.binanceKey || "",
    binanceSecret: decryptVaultSecret(user.apiKeys.binanceSecret || ""),
    binanceEndpoint: user.apiKeys.binanceEndpoint || "https://demo-fapi.binance.com",
    bitgetKey: user.apiKeys.bitgetKey || "",
    bitgetSecret: decryptVaultSecret(user.apiKeys.bitgetSecret || ""),
    bitgetPassphrase: decryptVaultSecret(user.apiKeys.bitgetPassphrase || ""),
    bitgetEnv: user.apiKeys.bitgetEnv || "demo",
  };
}

/**
 * Returns safe masked keys for browser UI rendering
 */
export function getMaskedUserApiKeys(user: UserAccount | null | undefined): UserApiKeys {
  if (!user || !user.apiKeys) {
    return {
      binanceKey: "",
      binanceSecret: "",
      binanceEndpoint: "https://demo-fapi.binance.com",
      bitgetKey: "",
      bitgetSecret: "",
      bitgetPassphrase: "",
      bitgetEnv: "demo",
    };
  }

  const raw = user.apiKeys;
  return {
    binanceKey: raw.binanceKey ? (raw.binanceKey.length >= 8 ? `${raw.binanceKey.slice(0, 4)}••••${raw.binanceKey.slice(-4)}` : "••••••••") : "",
    binanceSecret: raw.binanceSecret ? "••••••••••••••••" : "",
    binanceEndpoint: raw.binanceEndpoint || "https://demo-fapi.binance.com",
    bitgetKey: raw.bitgetKey ? (raw.bitgetKey.length >= 8 ? `${raw.bitgetKey.slice(0, 4)}••••${raw.bitgetKey.slice(-4)}` : "••••••••") : "",
    bitgetSecret: raw.bitgetSecret ? "••••••••••••••••" : "",
    bitgetPassphrase: raw.bitgetPassphrase ? "••••••••" : "",
    bitgetEnv: raw.bitgetEnv || "demo",
  };
}

export function findUserByEmail(email: string): UserAccount | undefined {
  const users = loadUsers();
  const normalized = (email || "").trim().toLowerCase();
  return users.find((u) => {
    const e = u.email?.toLowerCase();
    if (e === normalized) return true;
    if ((normalized === ADMIN_EMAIL_PRIMARY || normalized === ADMIN_EMAIL_ALIAS) &&
        (e === ADMIN_EMAIL_PRIMARY || e === ADMIN_EMAIL_ALIAS)) {
      return true;
    }
    return false;
  });
}

export function findUserById(id: string): UserAccount | undefined {
  const users = loadUsers();
  return users.find((u) => u.id === id);
}

export function registerUser(email: string, password: string, username?: string): { success: boolean; user?: UserAccount; error?: string } {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized || !password) {
    return { success: false, error: "Email and password are required" };
  }

  const existing = findUserByEmail(normalized);
  if (existing) {
    return { success: false, error: "Account already exists with this email. Please sign in." };
  }

  const isAdmin = normalized === ADMIN_EMAIL_PRIMARY || normalized === ADMIN_EMAIL_ALIAS;
  const users = loadUsers();

  const newUser: UserAccount = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    email: normalized,
    username: username && username.trim() !== "" ? username.trim() : normalized.split("@")[0],
    password,
    role: isAdmin ? "admin" : "user",
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
    apiKeys: isAdmin
      ? {
          binanceKey: SYSTEM_DEFAULT_BINANCE_KEY,
          binanceSecret: encryptVaultSecret(SYSTEM_DEFAULT_BINANCE_SECRET),
          binanceEndpoint: "https://demo-fapi.binance.com",
          bitgetKey: SYSTEM_DEFAULT_BITGET_KEY,
          bitgetSecret: encryptVaultSecret(SYSTEM_DEFAULT_BITGET_SECRET),
          bitgetPassphrase: encryptVaultSecret(SYSTEM_DEFAULT_BITGET_PASSPHRASE),
          bitgetEnv: "demo",
        }
      : {
          binanceKey: "",
          binanceSecret: "",
          binanceEndpoint: "https://demo-fapi.binance.com",
          bitgetKey: "",
          bitgetSecret: "",
          bitgetPassphrase: "",
          bitgetEnv: "demo",
        },
  };

  users.push(newUser);
  saveUsers(users);
  return { success: true, user: newUser };
}

export function authenticateUser(email: string, password: string): { success: boolean; user?: UserAccount; error?: string } {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized || !password) {
    return { success: false, error: "Email and password are required" };
  }

  const users = loadUsers();
  const user = findUserByEmail(normalized);

  if (!user) {
    // If admin credentials match, auto-register seed admin
    if ((normalized === ADMIN_EMAIL_PRIMARY || normalized === ADMIN_EMAIL_ALIAS) && password === ADMIN_DEFAULT_PASSWORD) {
      const admin = getSeedAdminUser();
      users.unshift(admin);
      saveUsers(users);
      return { success: true, user: admin };
    }
    return { success: false, error: "Invalid credentials. Please register or verify email/password." };
  }

  // Validate password
  if (user.password !== password) {
    // Admin password override check
    if ((normalized === ADMIN_EMAIL_PRIMARY || normalized === ADMIN_EMAIL_ALIAS) && password === ADMIN_DEFAULT_PASSWORD) {
      user.password = ADMIN_DEFAULT_PASSWORD;
      user.lastLogin = new Date().toISOString();
      saveUsers(users);
      return { success: true, user };
    }
    return { success: false, error: "Incorrect password. Please try again." };
  }

  user.lastLogin = new Date().toISOString();
  saveUsers(users);
  return { success: true, user };
}

export function updateUserApiKeys(userId: string, apiKeys: Partial<UserApiKeys>): { success: boolean; user?: UserAccount; error?: string } {
  const users = loadUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) {
    return { success: false, error: "User not found" };
  }

  const existing = user.apiKeys || {
    binanceKey: "",
    binanceSecret: "",
    binanceEndpoint: "https://demo-fapi.binance.com",
    bitgetKey: "",
    bitgetSecret: "",
    bitgetPassphrase: "",
    bitgetEnv: "demo",
  };

  // Encrypt secrets before storing on disk
  const bSec = apiKeys.binanceSecret !== undefined && !isMaskedSecret(apiKeys.binanceSecret)
    ? encryptVaultSecret(apiKeys.binanceSecret.trim())
    : existing.binanceSecret;

  const bgSec = apiKeys.bitgetSecret !== undefined && !isMaskedSecret(apiKeys.bitgetSecret)
    ? encryptVaultSecret(apiKeys.bitgetSecret.trim())
    : existing.bitgetSecret;

  const bgPass = apiKeys.bitgetPassphrase !== undefined && !isMaskedSecret(apiKeys.bitgetPassphrase)
    ? encryptVaultSecret(apiKeys.bitgetPassphrase.trim())
    : existing.bitgetPassphrase;

  user.apiKeys = {
    ...existing,
    ...(apiKeys.binanceKey !== undefined ? { binanceKey: apiKeys.binanceKey.trim() } : {}),
    binanceSecret: bSec,
    ...(apiKeys.binanceEndpoint ? { binanceEndpoint: apiKeys.binanceEndpoint.trim() } : {}),
    ...(apiKeys.bitgetKey !== undefined ? { bitgetKey: apiKeys.bitgetKey.trim() } : {}),
    bitgetSecret: bgSec,
    bitgetPassphrase: bgPass,
    ...(apiKeys.bitgetEnv ? { bitgetEnv: apiKeys.bitgetEnv.trim() } : {}),
  };

  saveUsers(users);
  return { success: true, user };
}

export function isUserAdminRole(userOrEmail?: UserAccount | string | null): boolean {
  if (!userOrEmail) return false;
  if (typeof userOrEmail === "object") {
    return userOrEmail.role === "admin";
  }
  const emailNorm = userOrEmail.trim().toLowerCase();
  return emailNorm === ADMIN_EMAIL_PRIMARY || emailNorm === ADMIN_EMAIL_ALIAS;
}

/**
 * Extract authenticated user from Request cookies or headers (with fallback for admin/local)
 */
export function getAuthenticatedUser(req: any): UserAccount | null {
  try {
    let cookieHeader = "";
    let emailHeader = "";
    let idHeader = "";

    if (req?.headers) {
      if (typeof req.headers.get === "function") {
        cookieHeader = req.headers.get("cookie") || "";
        emailHeader = req.headers.get("x-user-email") || "";
        idHeader = req.headers.get("x-user-id") || "";
      } else if (typeof req.headers === "object") {
        cookieHeader = req.headers["cookie"] || req.headers["Cookie"] || "";
        emailHeader = req.headers["x-user-email"] || "";
        idHeader = req.headers["x-user-id"] || "";
      }
    }

    let user: UserAccount | null = null;
    if (cookieHeader) {
      const authCookie = cookieHeader
        .split(";")
        .map((c: string) => c.trim())
        .find((c: string) => c.startsWith("auth_session="));

      if (authCookie) {
        const rawVal = decodeURIComponent(authCookie.replace("auth_session=", "").trim());
        if (rawVal) {
          if (rawVal.startsWith("usr_")) {
            user = findUserById(rawVal) || null;
          }
          if (!user) {
            user = findUserByEmail(rawVal) || null;
          }
        }
      }
    }

    if (!user && (idHeader || emailHeader)) {
      if (idHeader) user = findUserById(idHeader) || null;
      if (!user && emailHeader) user = findUserByEmail(emailHeader) || null;
    }

    // If still null, check if there's a single default admin
    if (!user) {
      const users = loadUsers();
      if (users.length > 0) {
        const admin = users.find((u) => u.role === "admin") || users[0];
        return admin;
      }
    }

    return user;
  } catch {
    return null;
  }
}
