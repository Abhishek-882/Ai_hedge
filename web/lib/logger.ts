export interface ServerLogEntry {
  id: string;
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR";
  service: "BINANCE" | "BITGET" | "SYSTEM";
  message: string;
  details?: any;
}

const MAX_LOGS = 200;

// Global log storage across serverless invocations in Node runtime
const globalLogs: ServerLogEntry[] = (global as any).__APP_LOGS__ || [];
(global as any).__APP_LOGS__ = globalLogs;

export function logServerEvent(
  level: "INFO" | "WARN" | "ERROR",
  service: "BINANCE" | "BITGET" | "SYSTEM",
  message: string,
  details?: any
) {
  const entry: ServerLogEntry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    level,
    service,
    message,
    details,
  };

  globalLogs.push(entry);
  if (globalLogs.length > MAX_LOGS) {
    globalLogs.shift();
  }

  // Also print to standard out for Render's native log viewer
  const line = `[${entry.timestamp}] [${level}] [${service}] ${message}`;
  if (level === "ERROR") {
    console.error(line, details ? JSON.stringify(details) : "");
  } else if (level === "WARN") {
    console.warn(line, details ? JSON.stringify(details) : "");
  } else {
    console.log(line, details ? JSON.stringify(details) : "");
  }
}

export function getServerLogs(): ServerLogEntry[] {
  return [...globalLogs];
}
