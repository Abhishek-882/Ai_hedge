import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { loadBotState } from "@/lib/botEngine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const AUDIT_LOG_FILE_PATH = path.join(process.cwd(), "bot_audit_log.json");
  const state = loadBotState();
  let logs: any[] = [];

  // 1. Try reading from dedicated persistent audit log file
  try {
    if (fs.existsSync(AUDIT_LOG_FILE_PATH)) {
      const raw = fs.readFileSync(AUDIT_LOG_FILE_PATH, "utf-8");
      logs = JSON.parse(raw);
    }
  } catch {}

  // 2. Fallback to state.logs if file was empty or missing
  if (!Array.isArray(logs) || logs.length === 0) {
    logs = state.logs || [];
  }

  const isDownload = req.nextUrl.searchParams.get("download") === "1" || req.nextUrl.searchParams.get("download") === "true";
  const format = req.nextUrl.searchParams.get("format") || "json";

  if (isDownload) {
    if (format === "text" || format === "txt") {
      const text = logs
        .map((l) => `[${l.timestamp}] [${(l.level || "INFO").toUpperCase()}] ${l.message}`)
        .join("\n");
      return new NextResponse(text || "No logs recorded yet.", {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="bot_audit_stream_${Date.now()}.txt"`,
        },
      });
    }

    return new NextResponse(JSON.stringify(logs, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="bot_audit_stream_${Date.now()}.json"`,
      },
    });
  }

  return NextResponse.json({
    success: true,
    count: logs.length,
    autoSavedToDisk: true,
    filePath: "bot_audit_log.json",
    logs,
  });
}
