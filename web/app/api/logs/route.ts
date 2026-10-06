import { NextRequest, NextResponse } from "next/server";
import { getServerLogs } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const logs = getServerLogs();
  const format = req.nextUrl.searchParams.get("format");

  if (format === "text") {
    const textOutput = logs
      .map((l) => `[${l.timestamp}] [${l.level}] [${l.service}] ${l.message} ${l.details ? JSON.stringify(l.details) : ""}`)
      .join("\n");
    return new NextResponse(textOutput || "No logs recorded yet.", {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  }

  return NextResponse.json(
    {
      success: true,
      count: logs.length,
      logs: logs.reverse(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
