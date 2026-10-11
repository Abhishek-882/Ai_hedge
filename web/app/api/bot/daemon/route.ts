import { NextRequest, NextResponse } from "next/server";
import {
  loadBotState,
  saveBotState,
  appendBotLog,
  ensureBotWorker,
  runAutonomousBotCycle,
  createBot,
  editBot,
  deleteBot,
  saveSetFile,
  applySetFileToBot,
  deleteSetFile,
  resetBotMemory,
  unlockSingleCoin,
  lockFlattenedCoinForBot,
  loadSetFiles,
  restoreBotsAndSetFiles,
  BotConfig,
} from "@/lib/botEngine";
import { getAuthenticatedUser, getAllActiveUsers } from "@/lib/userStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = getAuthenticatedUser(req);
  const userId = user?.id || "usr_admin_varsha";

  ensureBotWorker();
  const state = loadBotState(userId);

  const searchParams = req.nextUrl.searchParams;
  const action = searchParams.get("action");

  // Handle external or internal keep-alive cron heartbeat
  if (action === "cron_tick" || action === "heartbeat") {
    ensureBotWorker();
    runAutonomousBotCycle().catch(() => {});
    const allUsers = getAllActiveUsers();
    return NextResponse.json({
      success: true,
      heartbeat: true,
      timestamp: Date.now(),
      isRunning: state.isRunning,
      activeUsersCount: allUsers.length,
      activeBotsCount: state.bots.filter((b) => b.enabled).length,
      uptimeSeconds: state.isRunning ? Math.floor((Date.now() - state.startedAt) / 1000) : 0,
      message: "24/7 Multi-Tenant Daemon heartbeat acknowledged. Bot cycle triggered.",
    });
  }

  // Handle direct download of .set file
  if (action === "download_set_file") {
    const fileName = searchParams.get("fileName") || "";
    const setFiles = loadSetFiles(userId);
    const setFile = setFiles.find((s) => s.fileName.toLowerCase() === fileName.toLowerCase());

    if (!setFile) {
      return NextResponse.json({ success: false, error: "Set file not found" }, { status: 404 });
    }

    return new NextResponse(setFile.contentText, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${setFile.fileName}"`,
      },
    });
  }

  const uptimeSeconds = state.isRunning
    ? Math.floor((Date.now() - state.startedAt) / 1000)
    : 0;

  const activeBot = state.bots.find((b) => b.id === state.activeBotId) || state.bots[0];

  return NextResponse.json({
    success: true,
    daemon: {
      ...state,
      uptimeSeconds,
      serverTime: Date.now(),
      userId,
      userEmail: user?.email || "admin",
      statusText: state.isRunning
        ? activeBot?.enabled
          ? activeBot?.statusText || "RUNNING_24_7"
          : "PAUSED_BY_USER"
        : "STOPPED",
    },
  });
}

export async function POST(req: Request) {
  const user = getAuthenticatedUser(req);
  const userId = user?.id || "usr_admin_varsha";

  const body = await req.json().catch(() => ({}));
  const action = body.action || "status";
  const state = loadBotState(userId);

  if (action === "start") {
    state.isRunning = true;
    const activeBot = state.bots.find((b) => b.id === state.activeBotId) || state.bots[0];
    if (activeBot) {
      activeBot.enabled = true;
      activeBot.config.enabled = true;
    }
    state.runInBackgroundWhenClosed = true;
    state.startedAt = Date.now();
    state.lastCycleAt = Date.now();
    appendBotLog(
      state,
      `User ${user?.email || "Admin"} activated 24/7 Autonomous Multi-Bot Server Engine. Scanning funding countdowns, spread and price parity continuously across all active bots.`,
      "success",
      userId
    );
    saveBotState(state, userId);
    ensureBotWorker();
    runAutonomousBotCycle().catch(() => {});
  } else if (action === "stop") {
    state.isRunning = false;
    appendBotLog(state, `Autonomous Server Daemon paused by user ${user?.email || "Admin"}.`, "warn", userId);
    saveBotState(state, userId);
  } else if (action === "toggle_daemon") {
    state.isRunning = !state.isRunning;
    appendBotLog(
      state,
      `Autonomous Master Daemon toggled: ${state.isRunning ? "RUNNING 24/7" : "PAUSED"}`,
      state.isRunning ? "success" : "warn",
      userId
    );
    saveBotState(state, userId);
    if (state.isRunning) {
      ensureBotWorker();
      runAutonomousBotCycle().catch(() => {});
    }
  } else if (action === "select_active_bot") {
    const targetBotId = body.botId;
    if (targetBotId && state.bots.some((b) => b.id === targetBotId)) {
      state.activeBotId = targetBotId;
      saveBotState(state, userId);
    }
  } else if (action === "toggle_bot") {
    const targetBotId = body.botId || state.activeBotId;
    const bot = state.bots.find((b) => b.id === targetBotId);
    if (bot) {
      const nextEnabled = body.enabled !== undefined ? Boolean(body.enabled) : !bot.enabled;
      bot.enabled = nextEnabled;
      bot.config.enabled = nextEnabled;
      appendBotLog(
        state,
        `Bot "${bot.name}" toggled: ${nextEnabled ? "ACTIVE (Scanning)" : "PAUSED"}`,
        nextEnabled ? "info" : "warn",
        userId
      );
      saveBotState(state, userId);
      if (nextEnabled && state.isRunning) {
        ensureBotWorker();
        runAutonomousBotCycle().catch(() => {});
      }
    }
  } else if (action === "create_bot") {
    const botName = body.name || `Bot ${state.bots.length + 1}`;
    const setFileName = body.setFileName || "conservative_5bps_sniper.set";
    const maxMarginCapUsdt = parseFloat(body.maxMarginCapUsdt) || 500;
    createBot(botName, setFileName, maxMarginCapUsdt, userId);
  } else if (action === "edit_bot") {
    const botId = body.botId || state.activeBotId;
    editBot(botId, body.updates || {}, userId);
  } else if (action === "delete_bot") {
    const botId = body.botId;
    if (botId) {
      deleteBot(botId, userId);
    }
  } else if (action === "update_config") {
    const botId = body.botId || state.activeBotId;
    const bot = state.bots.find((b) => b.id === botId);
    if (bot) {
      const newConfig: Partial<BotConfig> = body.config || {};
      bot.config = {
        ...bot.config,
        ...newConfig,
      };
      if (newConfig.maxMarginCapUsdt) {
        bot.maxMarginCapUsdt = newConfig.maxMarginCapUsdt;
      }
      bot.updatedAt = Date.now();
      appendBotLog(
        state,
        `Parameters updated for "${bot.name}": Min Spread=${bot.config.minSpreadBps}bps, Parity Div=${bot.config.maxPriceDivergencePct}%, Alloc=${bot.config.balanceAllocationPct}%, Cap=$${bot.maxMarginCapUsdt}`,
        "info",
        userId
      );
      saveBotState(state, userId);
    }
  } else if (action === "save_set_file") {
    const fileName = body.fileName || `strategy_${Date.now()}.set`;
    const name = body.name || fileName;
    const description = body.description || "Custom quantitative configuration preset";
    const bot = state.bots.find((b) => b.id === (body.botId || state.activeBotId)) || state.bots[0];
    const configToSave = body.config || bot.config;
    saveSetFile(fileName, name, description, configToSave, userId);
  } else if (action === "apply_set_file") {
    const botId = body.botId || state.activeBotId;
    const fileName = body.fileName;
    if (fileName) {
      applySetFileToBot(botId, fileName, userId);
    }
  } else if (action === "delete_set_file") {
    const fileName = body.fileName;
    if (fileName) {
      deleteSetFile(fileName, userId);
    }
  } else if (action === "reset_bot_memory") {
    const botId = body.botId;
    resetBotMemory(botId, userId);
  } else if (action === "unlock_coin") {
    const symbol = body.symbol;
    const botId = body.botId || state.activeBotId;
    if (symbol) {
      unlockSingleCoin(symbol, botId, userId);
    }
  } else if (action === "lock_coin") {
    const symbol = body.symbol;
    const botId = body.botId || state.activeBotId;
    if (symbol) {
      lockFlattenedCoinForBot(symbol, botId, userId);
    }
  } else if (action === "toggle_background") {
    state.runInBackgroundWhenClosed = !state.runInBackgroundWhenClosed;
    appendBotLog(
      state,
      `Run in background when closed set to: ${state.runInBackgroundWhenClosed}`,
      "info",
      userId
    );
    saveBotState(state, userId);
  } else if (action === "force_scan") {
    appendBotLog(state, `Manual scan cycle triggered by ${user?.email || "User"}.`, "info", userId);
    saveBotState(state, userId);
    await runAutonomousBotCycle().catch(() => {});
  } else if (action === "close_hedge") {
    const hedgeId = body.hedgeId;
    const targetSymbol = body.symbol;
    const botId = body.botId || state.activeBotId;
    const bot = state.bots.find((b) => b.id === botId);

    if (bot) {
      const idx = bot.activeHedges.findIndex((h) => h.id === hedgeId || h.symbol === targetSymbol);
      if (idx >= 0) {
        const hedgeToClose = bot.activeHedges[idx];
        appendBotLog(state, `Manual force close for hedge ${hedgeToClose.symbol} (${hedgeToClose.id}) in bot "${bot.name}".`, "warn", userId);
        bot.activeHedges.splice(idx, 1);
        hedgeToClose.status = "CLOSED";
        hedgeToClose.closeTime = Date.now();
        bot.completedHedges.unshift(hedgeToClose);
        // Also engage memory lock for this coin
        if (!bot.flattenedCoinsBlacklist.includes(hedgeToClose.symbol)) {
          bot.flattenedCoinsBlacklist.push(hedgeToClose.symbol);
        }
        saveBotState(state, userId);
      }
    }
  } else if (action === "clear_logs") {
    state.logs = [];
    saveBotState(state, userId);
  } else if (action === "sync_restore_vault") {
    const clientBots = body.bots;
    const clientSetFiles = body.setFiles;
    const preferredActiveBotId = body.activeBotId;
    if (Array.isArray(clientBots) || Array.isArray(clientSetFiles)) {
      restoreBotsAndSetFiles(clientBots || [], clientSetFiles || [], preferredActiveBotId, userId);
    }
  }

  const uptimeSeconds = state.isRunning
    ? Math.floor((Date.now() - state.startedAt) / 1000)
    : 0;

  const activeBot = state.bots.find((b) => b.id === state.activeBotId) || state.bots[0];

  return NextResponse.json({
    success: true,
    action,
    daemon: {
      ...state,
      uptimeSeconds,
      serverTime: Date.now(),
      userId,
      userEmail: user?.email || "admin",
      statusText: state.isRunning
        ? activeBot?.enabled
          ? activeBot?.statusText || "RUNNING_24_7"
          : "PAUSED_BY_USER"
        : "STOPPED",
    },
  });
}
