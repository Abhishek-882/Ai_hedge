import { NextResponse } from "next/server";
import {
  loadBotState,
  saveBotState,
  appendBotLog,
  ensureBotWorker,
  runAutonomousBotCycle,
  BotEngineState,
  BotConfig,
} from "@/lib/botEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  ensureBotWorker();
  const state = loadBotState();

  const uptimeSeconds = state.isRunning
    ? Math.floor((Date.now() - state.startedAt) / 1000)
    : 0;

  return NextResponse.json({
    success: true,
    daemon: {
      ...state,
      uptimeSeconds,
      serverTime: Date.now(),
      statusText: state.isRunning ? (state.config.enabled ? state.statusText || "RUNNING_24_7" : "PAUSED_BY_USER") : "STOPPED",
    },
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = body.action || "status";
  const state = loadBotState();

  if (action === "start") {
    state.isRunning = true;
    state.config.enabled = true;
    state.runInBackgroundWhenClosed = true;
    state.startedAt = Date.now();
    state.lastCycleAt = Date.now();
    appendBotLog(
      state,
      "Admin activated 24/7 Autonomous Server Bot. Engine scanning funding countdowns, spread and price parity continuously.",
      "success"
    );
    saveBotState(state);
    ensureBotWorker();
    // Fire an immediate cycle
    runAutonomousBotCycle().catch(() => {});
  } else if (action === "stop") {
    state.isRunning = false;
    state.config.enabled = false;
    appendBotLog(state, "Autonomous Server Bot paused by admin.", "warn");
    saveBotState(state);
  } else if (action === "toggle_background") {
    state.runInBackgroundWhenClosed = !state.runInBackgroundWhenClosed;
    appendBotLog(
      state,
      `Run in background when closed set to: ${state.runInBackgroundWhenClosed}`,
      "info"
    );
    saveBotState(state);
  } else if (action === "update_config") {
    const newConfig: Partial<BotConfig> = body.config || {};
    state.config = {
      ...state.config,
      ...newConfig,
    };
    appendBotLog(
      state,
      `Bot parameters updated: Min Spread=${state.config.minSpreadBps}bps, Max Div=${state.config.maxPriceDivergencePct}%, Alloc=${state.config.balanceAllocationPct}%, Max Hedges=${state.config.maxSimultaneousHedges}`,
      "info"
    );
    saveBotState(state);
  } else if (action === "force_scan") {
    appendBotLog(state, "Manual scan cycle triggered by admin.", "info");
    saveBotState(state);
    await runAutonomousBotCycle().catch(() => {});
  } else if (action === "close_hedge") {
    const hedgeId = body.hedgeId;
    const targetSymbol = body.symbol;
    const idx = state.activeHedges.findIndex((h) => h.id === hedgeId || h.symbol === targetSymbol);

    if (idx >= 0) {
      const hedgeToClose = state.activeHedges[idx];
      appendBotLog(state, `Admin requested manual force close for hedge ${hedgeToClose.symbol} (${hedgeToClose.id}).`, "warn");
      state.activeHedges.splice(idx, 1);
      hedgeToClose.status = "CLOSED";
      hedgeToClose.closeTime = Date.now();
      state.completedHedges.unshift(hedgeToClose);
      saveBotState(state);
    }
  } else if (action === "clear_logs") {
    state.logs = [];
    saveBotState(state);
  }

  const uptimeSeconds = state.isRunning
    ? Math.floor((Date.now() - state.startedAt) / 1000)
    : 0;

  return NextResponse.json({
    success: true,
    action,
    daemon: {
      ...state,
      uptimeSeconds,
      serverTime: Date.now(),
      statusText: state.isRunning ? (state.config.enabled ? state.statusText || "RUNNING_24_7" : "PAUSED_BY_USER") : "STOPPED",
    },
  });
}
