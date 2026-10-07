import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

interface DaemonLog {
  timestamp: string;
  message: string;
  level: "info" | "success" | "warn";
}

interface BotDaemonState {
  isRunning: boolean;
  runInBackgroundWhenClosed: boolean;
  mode: string;
  targetSpreadBps: number;
  startedAt: number;
  lastCycleAt: number;
  cyclesCompleted: number;
  activeHedges: number;
  logs: DaemonLog[];
}

const STATE_FILE_PATH = path.join(process.cwd(), "bot_daemon_state.json");

// Node.js global singleton so interval survives across API calls
const globalForDaemon = global as unknown as {
  botDaemonState?: BotDaemonState;
  botDaemonInterval?: NodeJS.Timeout | null;
};

function loadState(): BotDaemonState {
  if (globalForDaemon.botDaemonState) {
    return globalForDaemon.botDaemonState;
  }

  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const raw = fs.readFileSync(STATE_FILE_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      globalForDaemon.botDaemonState = parsed;
      return parsed;
    }
  } catch {}

  const defaultState: BotDaemonState = {
    isRunning: true, // Default to running 24/7 server-side
    runInBackgroundWhenClosed: true,
    mode: "AUTONOMOUS_SERVER_24_7",
    targetSpreadBps: 2.0,
    startedAt: Date.now(),
    lastCycleAt: Date.now(),
    cyclesCompleted: 1,
    activeHedges: 0,
    logs: [
      {
        timestamp: new Date().toISOString(),
        message: "Server background daemon initialized. Configured to run 24/7 even when browser is closed.",
        level: "info",
      },
    ],
  };

  globalForDaemon.botDaemonState = defaultState;
  saveState(defaultState);
  return defaultState;
}

function saveState(state: BotDaemonState) {
  globalForDaemon.botDaemonState = state;
  try {
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), "utf-8");
  } catch {}
}

function appendLog(state: BotDaemonState, message: string, level: "info" | "success" | "warn" = "info") {
  const log: DaemonLog = {
    timestamp: new Date().toISOString(),
    message,
    level,
  };
  state.logs.unshift(log);
  if (state.logs.length > 50) {
    state.logs = state.logs.slice(0, 50);
  }
}

function ensureBackgroundWorker() {
  const state = loadState();
  if (state.isRunning && !globalForDaemon.botDaemonInterval) {
    globalForDaemon.botDaemonInterval = setInterval(() => {
      const currentState = loadState();
      if (!currentState.isRunning) {
        if (globalForDaemon.botDaemonInterval) {
          clearInterval(globalForDaemon.botDaemonInterval);
          globalForDaemon.botDaemonInterval = null;
        }
        return;
      }

      currentState.lastCycleAt = Date.now();
      currentState.cyclesCompleted += 1;

      if (currentState.cyclesCompleted % 6 === 0) {
        appendLog(
          currentState,
          `Server 24/7 Background Heartbeat: Cycle #${currentState.cyclesCompleted} executed autonomously (Browser independent).`,
          "info"
        );
      }

      saveState(currentState);
    }, 5000);
  }
}

// Auto-boot background loop on server startup
ensureBackgroundWorker();

export async function GET() {
  ensureBackgroundWorker();
  const state = loadState();

  const uptimeSeconds = state.isRunning
    ? Math.floor((Date.now() - state.startedAt) / 1000)
    : 0;

  return NextResponse.json({
    success: true,
    daemon: {
      ...state,
      uptimeSeconds,
      serverTime: Date.now(),
      statusText: state.isRunning ? "RUNNING_24_7" : "STOPPED",
    },
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = body.action || "status";
  const state = loadState();

  if (action === "start") {
    state.isRunning = true;
    state.runInBackgroundWhenClosed = true;
    state.startedAt = Date.now();
    state.lastCycleAt = Date.now();
    appendLog(state, "User activated 24/7 Server Autonomous Bot. Running in background even if browser closes.", "success");
    saveState(state);
    ensureBackgroundWorker();
  } else if (action === "stop") {
    state.isRunning = false;
    appendLog(state, "Server background daemon paused by user command.", "warn");
    saveState(state);
    if (globalForDaemon.botDaemonInterval) {
      clearInterval(globalForDaemon.botDaemonInterval);
      globalForDaemon.botDaemonInterval = null;
    }
  } else if (action === "toggle_background") {
    state.runInBackgroundWhenClosed = !state.runInBackgroundWhenClosed;
    appendLog(
      state,
      `Run in background when closed set to: ${state.runInBackgroundWhenClosed}`,
      "info"
    );
    saveState(state);
  } else if (action === "record_hedge") {
    state.activeHedges = (state.activeHedges || 0) + 1;
    appendLog(
      state,
      `Autonomous hedge pair recorded for ${body.symbol || "PAIR"}: Long Bitget / Short Binance.`,
      "success"
    );
    saveState(state);
  }

  return NextResponse.json({
    success: true,
    action,
    daemon: {
      ...state,
      serverTime: Date.now(),
      statusText: state.isRunning ? "RUNNING_24_7" : "STOPPED",
    },
  });
}
