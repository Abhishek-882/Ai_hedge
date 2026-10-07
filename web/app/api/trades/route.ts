import { NextRequest, NextResponse } from "next/server";
import { loadTrades, saveTrades, recordServerTrade } from "@/lib/serverTradeStore";

export const dynamic = "force-dynamic";

export async function GET() {
  const trades = loadTrades();
  return NextResponse.json(
    {
      success: true,
      count: trades.length,
      trades,
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
    const body = await req.json();

    if (body.action === "clear") {
      saveTrades([]);
      return NextResponse.json({ success: true, count: 0, trades: [] });
    }

    const trade = recordServerTrade(body);

    return NextResponse.json({
      success: true,
      trade,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
