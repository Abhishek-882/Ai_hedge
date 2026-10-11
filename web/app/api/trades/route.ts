import { NextRequest, NextResponse } from "next/server";
import { loadTrades, saveTrades, recordServerTrade } from "@/lib/serverTradeStore";
import { getAuthenticatedUser } from "@/lib/userStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = getAuthenticatedUser(req);
  const userId = user?.id || "usr_admin_varsha";
  const trades = loadTrades(userId);

  return NextResponse.json(
    {
      success: true,
      count: trades.length,
      trades,
      userId,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}

export async function POST(req: NextRequest) {
  try {
    const user = getAuthenticatedUser(req);
    const userId = user?.id || "usr_admin_varsha";
    const body = await req.json();

    if (body.action === "clear") {
      saveTrades([], userId);
      return NextResponse.json({ success: true, count: 0, trades: [], userId });
    }

    const trade = recordServerTrade(body, userId);

    return NextResponse.json({
      success: true,
      trade,
      userId,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
