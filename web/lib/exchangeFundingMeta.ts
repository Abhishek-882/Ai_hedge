/**
 * Exchange Funding Metadata Indexer & Cache Service
 * Discovers and caches real settlement intervals (8h, 4h, 1h) and next funding times
 * across Binance Futures and Bitget USDT-Futures.
 */

import { getDeterministicNextFundingTime, getPayoutsPerDay, getSettlementCycleLabel } from "./settlementTime";

export interface SymbolFundingMeta {
  symbol: string;
  fundingIntervalHours: number; // effective interval (e.g. 4, 8, 1)
  binanceIntervalHours: number;
  bitgetIntervalHours: number;
  settlementCycleLabel: string;
  payoutsPerDay: number;
  bitgetNextUpdate?: number;
}

// In-memory cache structures
let cachedMetaMap: Map<string, SymbolFundingMeta> = new Map();
let lastCacheFetchTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache
let isFetchingPromise: Promise<Map<string, SymbolFundingMeta>> | null = null;

/**
 * Fetch and index funding interval definitions from both Binance and Bitget
 */
export async function fetchFundingMetaMap(): Promise<Map<string, SymbolFundingMeta>> {
  const now = Date.now();

  // Return existing fresh cache if valid
  if (cachedMetaMap.size > 0 && now - lastCacheFetchTime < CACHE_TTL_MS) {
    return cachedMetaMap;
  }

  // Deduplicate simultaneous requests
  if (isFetchingPromise) {
    return isFetchingPromise;
  }

  isFetchingPromise = (async () => {
    try {
      const [bnRes, bgRes] = await Promise.allSettled([
        fetch("https://fapi.binance.com/fapi/v1/fundingInfo", {
          headers: { "User-Agent": "FundingRateEngine/2.0" },
          cache: "no-store",
        }).then((r) => r.json()).catch(() => []),
        fetch("https://api.bitget.com/api/v2/mix/market/current-fund-rate?productType=USDT-FUTURES", {
          headers: { "User-Agent": "FundingRateEngine/2.0" },
          cache: "no-store",
        }).then((r) => r.json()).catch(() => ({ data: [] })),
      ]);

      const bnList = bnRes.status === "fulfilled" && Array.isArray(bnRes.value) ? bnRes.value : [];
      const bgData = bgRes.status === "fulfilled" && Array.isArray(bgRes.value?.data) ? bgRes.value.data : [];

      const bnIntervalMap = new Map<string, number>();
      for (const item of bnList) {
        if (item.symbol && typeof item.fundingIntervalHours === "number") {
          bnIntervalMap.set(item.symbol.toUpperCase(), item.fundingIntervalHours);
        }
      }

      const bgIntervalMap = new Map<string, { interval: number; nextUpdate: number }>();
      for (const item of bgData) {
        if (item.symbol) {
          const sym = item.symbol.toUpperCase();
          const parsedInt = parseInt(item.fundingRateInterval || "8", 10) || 8;
          const nextUpdate = parseInt(item.nextUpdate || "0", 10);
          bgIntervalMap.set(sym, { interval: parsedInt, nextUpdate });
        }
      }

      const newMetaMap = new Map<string, SymbolFundingMeta>();

      // Merge all known symbols from both exchanges
      const allSymbols = new Set<string>();
      bnIntervalMap.forEach((_, sym) => allSymbols.add(sym));
      bgIntervalMap.forEach((_, sym) => allSymbols.add(sym));

      allSymbols.forEach((sym) => {
        const bnH = bnIntervalMap.get(sym) || 8;
        const bgEntry = bgIntervalMap.get(sym);
        const bgH = bgEntry?.interval || bnH || 8;

        // Effective settlement interval: min of both venues or matching
        const effH = Math.min(bnH, bgH);
        const validEffH = effH > 0 && effH <= 24 ? effH : 8;

        newMetaMap.set(sym, {
          symbol: sym,
          fundingIntervalHours: validEffH,
          binanceIntervalHours: bnH,
          bitgetIntervalHours: bgH,
          settlementCycleLabel: getSettlementCycleLabel(validEffH),
          payoutsPerDay: getPayoutsPerDay(validEffH),
          bitgetNextUpdate: bgEntry?.nextUpdate && bgEntry.nextUpdate > 0 ? bgEntry.nextUpdate : undefined,
        });
      });

      if (newMetaMap.size > 0) {
        cachedMetaMap = newMetaMap;
        lastCacheFetchTime = Date.now();
      }

      return cachedMetaMap;
    } catch (err) {
      console.error("fetchFundingMetaMap error:", err);
      return cachedMetaMap;
    } finally {
      isFetchingPromise = null;
    }
  })();

  return isFetchingPromise;
}

/**
 * Get funding metadata for a specific symbol
 */
export async function getFundingMetaForSymbol(symbol: string): Promise<SymbolFundingMeta> {
  const sym = symbol.toUpperCase();
  const map = await fetchFundingMetaMap();
  const found = map.get(sym);
  if (found) return found;

  // Fallback defaults if symbol is not yet indexed
  return {
    symbol: sym,
    fundingIntervalHours: 8,
    binanceIntervalHours: 8,
    bitgetIntervalHours: 8,
    settlementCycleLabel: "8h Cycle",
    payoutsPerDay: 3,
  };
}

/**
 * Synchronous cached lookup (returns fallback if not yet fetched)
 */
export function getCachedFundingMeta(symbol: string): SymbolFundingMeta {
  const sym = symbol.toUpperCase();
  const found = cachedMetaMap.get(sym);
  if (found) return found;

  return {
    symbol: sym,
    fundingIntervalHours: 8,
    binanceIntervalHours: 8,
    bitgetIntervalHours: 8,
    settlementCycleLabel: "8h Cycle",
    payoutsPerDay: 3,
  };
}
