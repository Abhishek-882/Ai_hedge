import { NextRequest, NextResponse } from "next/server";
import { signAndFetchBinance } from "@/lib/binanceSigner";
import { getBitgetAccount, BitgetCredentials } from "@/lib/bitgetSigner";

export const dynamic = "force-dynamic";

const noCacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

export async function GET(req: NextRequest) {
  const DEFAULT_BINANCE_KEY = "RkqI5SmWN3z6DxKcAirPx48BmHpkA21FHPaeWFPsiJ4NbIvMAt4yTM3TsoLbHVAU";
  const DEFAULT_BINANCE_SECRET = "dpMSrQ1GDCPhNPnRRsIC0rCjzlDK9VfbC9fKXwptUGtqn2WdTKLZWekZqXykY00h";
  const DEFAULT_BITGET_KEY = "bg_2c493eb64032f2b0aea68c1c18d56e05";
  const DEFAULT_BITGET_SECRET = "c77d2baac5b1fb84e9d900e15dfcac783b962d1da1837b50ff05daf68ac2f5f6";
  const DEFAULT_BITGET_PASSPHRASE = process.env.BITGET_PASSPHRASE || "ArbitrageBot2027";

  const binanceKey = req.headers.get("x-binance-key") || process.env.BINANCE_TESTNET_API_KEY || DEFAULT_BINANCE_KEY;
  const binanceSecret = req.headers.get("x-binance-secret") || process.env.BINANCE_TESTNET_API_SECRET || DEFAULT_BINANCE_SECRET;
  const binanceEndpoint = req.headers.get("x-binance-endpoint") || undefined;

  const bitgetKey = req.headers.get("x-bitget-key") || process.env.BITGET_API_KEY || DEFAULT_BITGET_KEY;
  const bitgetSecret = req.headers.get("x-bitget-secret") || process.env.BITGET_API_SECRET || DEFAULT_BITGET_SECRET;
  const bitgetPassphrase = req.headers.get("x-bitget-passphrase") || DEFAULT_BITGET_PASSPHRASE;
  const bitgetEnv = req.headers.get("x-bitget-env") || process.env.BITGET_ENV || "demo";

  let binancePositions: any[] = [];
  let bitgetPositions: any[] = [];

  // 1. Fetch ALL open positions across all coins from Binance (omit symbol parameter)
  try {
    if (binanceKey && binanceSecret) {
      const { data } = await signAndFetchBinance(
        binanceKey,
        binanceSecret,
        "GET",
        "/fapi/v2/positionRisk",
        {}, // Omit symbol to return all open positions across all pairs
        true,
        binanceEndpoint
      );
      binancePositions = (Array.isArray(data) ? data : [])
        .filter((p: any) => parseFloat(p.positionAmt || "0") !== 0)
        .map((p: any) => ({
          venue: "Binance",
          symbol: p.symbol,
          amount: parseFloat(p.positionAmt),
          entryPrice: parseFloat(p.entryPrice),
          markPrice: parseFloat(p.markPrice),
          unrealizedPnl: parseFloat(p.unRealizedProfit || p.unrealizedProfit || "0"),
          liquidationPrice: parseFloat(p.liquidationPrice || "0"),
          leverage: parseInt(p.leverage, 10),
        }));
    }
  } catch (err: any) {
    console.error("Error fetching Binance positions:", err.message);
  }

  // 2. Fetch ALL open positions across all coins from Bitget
  try {
    const creds: BitgetCredentials | undefined = bitgetKey && bitgetSecret && bitgetPassphrase
      ? { apiKey: bitgetKey, apiSecret: bitgetSecret, passphrase: bitgetPassphrase, isDemo: bitgetEnv === "demo" }
      : undefined;

    const bitgetAcc = await getBitgetAccount(creds);
    if (bitgetAcc.success && Array.isArray(bitgetAcc.positions)) {
      bitgetPositions = bitgetAcc.positions.map((p: any) => ({
        ...p,
        venue: "Bitget",
      }));
    }
  } catch (err: any) {
    console.error("Error fetching Bitget positions:", err.message);
  }

  const positions = [...binancePositions, ...bitgetPositions];

  return NextResponse.json(
    {
      success: true,
      count: positions.length,
      positions,
    },
    { headers: noCacheHeaders }
  );
}
