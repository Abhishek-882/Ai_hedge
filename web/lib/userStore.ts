import fs from "fs";
import path from "path";

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

const USERS_FILE_PATH = path.join(process.cwd(), "user_accounts_store.json");

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
      binanceSecret: SYSTEM_DEFAULT_BINANCE_SECRET,
      binanceEndpoint: "https://demo-fapi.binance.com",
      bitgetKey: SYSTEM_DEFAULT_BITGET_KEY,
      bitgetSecret: SYSTEM_DEFAULT_BITGET_SECRET,
      bitgetPassphrase: SYSTEM_DEFAULT_BITGET_PASSPHRASE,
      bitgetEnv: "demo",
    },
  };
}

export function loadUsers(): UserAccount[] {
  if (globalForUsers.userAccounts && globalForUsers.userAccounts.length > 0) {
    return globalForUsers.userAccounts;
  }

  try {
    if (fs.existsSync(USERS_FILE_PATH)) {
      const raw = fs.readFileSync(USERS_FILE_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure admin user exists with current credentials
        const hasAdmin = parsed.some(
          (u) => u.email.toLowerCase() === ADMIN_EMAIL_PRIMARY || u.email.toLowerCase() === ADMIN_EMAIL_ALIAS
        );
        if (!hasAdmin) {
          parsed.unshift(getSeedAdminUser());
        } else {
          // Always ensure admin password and role match required credentials
          const adminIdx = parsed.findIndex(
            (u) => u.email.toLowerCase() === ADMIN_EMAIL_PRIMARY || u.email.toLowerCase() === ADMIN_EMAIL_ALIAS
          );
          if (adminIdx >= 0) {
            parsed[adminIdx].password = ADMIN_DEFAULT_PASSWORD;
            parsed[adminIdx].role = "admin";
            if (!parsed[adminIdx].apiKeys?.binanceKey) {
              parsed[adminIdx].apiKeys = getSeedAdminUser().apiKeys;
            }
          }
        }
        globalForUsers.userAccounts = parsed;
        saveUsers(parsed);
        return parsed;
      }
    }
  } catch {}

  const initial = [getSeedAdminUser()];
  globalForUsers.userAccounts = initial;
  saveUsers(initial);
  return initial;
}

export function saveUsers(users: UserAccount[]): void {
  globalForUsers.userAccounts = users;
  try {
    fs.writeFileSync(USERS_FILE_PATH, JSON.stringify(users, null, 2), "utf-8");
  } catch {}
}

export function findUserByEmail(email: string): UserAccount | undefined {
  const users = loadUsers();
  const normalized = (email || "").trim().toLowerCase();
  return users.find((u) => {
    const e = u.email.toLowerCase();
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

  const newUser: UserAccount = {
    id: `usr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    email: normalized,
    username: username?.trim() || normalized.split("@")[0] || "Trader",
    password,
    role: isAdmin ? "admin" : "user",
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
    // Standard users start with BLANK keys!
    apiKeys: isAdmin
      ? getSeedAdminUser().apiKeys
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

  const users = loadUsers();
  users.push(newUser);
  saveUsers(users);

  return { success: true, user: newUser };
}

export function authenticateUser(email: string, password: string): { success: boolean; user?: UserAccount; error?: string } {
  const user = findUserByEmail(email);
  if (!user) {
    return { success: false, error: "No account found with this email. Please sign up first." };
  }

  if (user.password !== password) {
    return { success: false, error: "Invalid password. Please check your credentials." };
  }

  user.lastLogin = new Date().toISOString();
  saveUsers(loadUsers());

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

  const isMaskedOrEmpty = (val: string | undefined): boolean => {
    if (!val) return true;
    const trimmed = val.trim();
    return trimmed === "" || trimmed.startsWith("•••") || trimmed.includes("••••");
  };

  user.apiKeys = {
    ...existing,
    ...(apiKeys.binanceKey !== undefined ? { binanceKey: apiKeys.binanceKey.trim() } : {}),
    ...(apiKeys.binanceSecret !== undefined && !isMaskedOrEmpty(apiKeys.binanceSecret)
      ? { binanceSecret: apiKeys.binanceSecret.trim() }
      : {}),
    ...(apiKeys.binanceEndpoint ? { binanceEndpoint: apiKeys.binanceEndpoint.trim() } : {}),
    ...(apiKeys.bitgetKey !== undefined ? { bitgetKey: apiKeys.bitgetKey.trim() } : {}),
    ...(apiKeys.bitgetSecret !== undefined && !isMaskedOrEmpty(apiKeys.bitgetSecret)
      ? { bitgetSecret: apiKeys.bitgetSecret.trim() }
      : {}),
    ...(apiKeys.bitgetPassphrase !== undefined && !isMaskedOrEmpty(apiKeys.bitgetPassphrase)
      ? { bitgetPassphrase: apiKeys.bitgetPassphrase.trim() }
      : {}),
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
