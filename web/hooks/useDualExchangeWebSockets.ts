"use client";

import { useEffect, useState, useRef } from "react";
import { getDeterministicNextFundingTime } from "@/lib/settlementTime";

export interface DualStreamData {
  symbol: string;
  binancePrice: number;
  binanceFundingRate: number;
  bitgetPrice: number;
  bitgetFundingRate: number;
  spreadBps: number;
  annualizedYieldPct: number;
  nextFundingTime: number;
  clockOffsetMs: number;
  binanceWsConnected: boolean;
  bitgetWsConnected: boolean;
  lastUpdated: number;
}

// Module-level persistent cache across component re-renders and symbol switches
const SESSION_PRICE_CACHE = new Map<string, DualStreamData>();

function normalizeFundingRate(rate: number): number {
  if (isNaN(rate) || rate === 0) return 0;
  // If rate was passed as pre-multiplied percentage (e.g. 0.01 for 0.01%), convert to decimal fraction (0.0001)
  if (Math.abs(rate) > 0.05) {
    return rate / 100;
  }
  return rate;
}

export function useDualExchangeWebSockets(
  symbol: string = "BTCUSDT",
  seedData?: Partial<DualStreamData>
): DualStreamData {
  const symUpper = symbol.toUpperCase();
  const symLower = symbol.toLowerCase();

  // Retrieve cached data or seed data for instant, non-zero rendering
  const getInitialSnapshot = (): DualStreamData => {
    const cached = SESSION_PRICE_CACHE.get(symUpper);
    const bPrice = seedData?.binancePrice || cached?.binancePrice || 0;
    const gPrice = seedData?.bitgetPrice || cached?.bitgetPrice || bPrice;
    const bRate = normalizeFundingRate(seedData?.binanceFundingRate ?? cached?.binanceFundingRate ?? 0.0001);
    const gRate = normalizeFundingRate(seedData?.bitgetFundingRate ?? cached?.bitgetFundingRate ?? 0.0002);
    const spread = seedData?.spreadBps ?? cached?.spreadBps ?? parseFloat(((gRate - bRate) * 10000).toFixed(2));
    const apy = seedData?.annualizedYieldPct ?? cached?.annualizedYieldPct ?? parseFloat(((Math.abs(spread) * 3 * 365) / 100).toFixed(2));
    const nextFunding = seedData?.nextFundingTime || cached?.nextFundingTime || getDeterministicNextFundingTime();

    return {
      symbol: symUpper,
      binancePrice: bPrice,
      binanceFundingRate: bRate,
      bitgetPrice: gPrice,
      bitgetFundingRate: gRate,
      spreadBps: spread,
      annualizedYieldPct: apy,
      nextFundingTime: nextFunding,
      clockOffsetMs: cached?.clockOffsetMs ?? 24,
      binanceWsConnected: cached?.binanceWsConnected ?? false,
      bitgetWsConnected: cached?.bitgetWsConnected ?? false,
      lastUpdated: Date.now(),
    };
  };

  const [data, setData] = useState<DualStreamData>(getInitialSnapshot);

  const binanceWsRef = useRef<WebSocket | null>(null);
  const bitgetWsRef = useRef<WebSocket | null>(null);

  // Throttling buffer to synchronize dual feeds and prevent high-frequency UI jitter
  const pendingUpdatesRef = useRef<Partial<DualStreamData>>({});
  const throttleTimerRef = useRef<any>(null);

  // Seed data sync on change
  useEffect(() => {
    if (seedData && seedData.symbol === symUpper && seedData.binancePrice) {
      setData((prev) => {
        const next: DualStreamData = {
          ...prev,
          symbol: symUpper,
          binancePrice: seedData.binancePrice || prev.binancePrice,
          bitgetPrice: seedData.bitgetPrice || prev.bitgetPrice || seedData.binancePrice || 0,
          binanceFundingRate: normalizeFundingRate(seedData.binanceFundingRate ?? prev.binanceFundingRate),
          bitgetFundingRate: normalizeFundingRate(seedData.bitgetFundingRate ?? prev.bitgetFundingRate),
          spreadBps: seedData.spreadBps ?? prev.spreadBps,
          annualizedYieldPct: seedData.annualizedYieldPct ?? prev.annualizedYieldPct,
          nextFundingTime: seedData.nextFundingTime || prev.nextFundingTime,
          lastUpdated: Date.now(),
        };
        SESSION_PRICE_CACHE.set(symUpper, next);
        return next;
      });
    }
  }, [symUpper, seedData]);

  useEffect(() => {
    // On symbol switch, immediately hydrate from cache if available
    const snapshot = getInitialSnapshot();
    setData(snapshot);
    pendingUpdatesRef.current = {};

    // Helper to queue throttled state updates (max 5 updates/sec = 200ms interval)
    const queueThrottledUpdate = (partial: Partial<DualStreamData>) => {
      pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...partial };
      if (!throttleTimerRef.current) {
        throttleTimerRef.current = setTimeout(() => {
          throttleTimerRef.current = null;
          if (Object.keys(pendingUpdatesRef.current).length > 0) {
            setData((prev) => {
              const merged = { ...prev, ...pendingUpdatesRef.current, lastUpdated: Date.now() };
              
              // Normalize rates and compute synchronized basis spread and APY
              const bRate = normalizeFundingRate(merged.binanceFundingRate ?? prev.binanceFundingRate);
              const gRate = normalizeFundingRate(merged.bitgetFundingRate ?? prev.bitgetFundingRate);
              merged.binanceFundingRate = bRate;
              merged.bitgetFundingRate = gRate;

              const spread = parseFloat(((gRate - bRate) * 10000).toFixed(2));
              merged.spreadBps = spread;
              merged.annualizedYieldPct = parseFloat(((Math.abs(spread) * 3 * 365) / 100).toFixed(2));

              // Store in module cache
              SESSION_PRICE_CACHE.set(symUpper, merged);
              pendingUpdatesRef.current = {};
              return merged;
            });
          }
        }, 200);
      }
    };

    // 1. Initial REST Ticker Fetch for immediate calibration
    const fetchInitialTicker = () => {
      fetch(`/api/ticker?symbol=${symUpper}`, { cache: "no-store" })
        .then((res) => res.json())
        .then((t) => {
          if (t.success && t.binancePrice) {
            queueThrottledUpdate({
              symbol: symUpper,
              binancePrice: t.binancePrice,
              binanceFundingRate: normalizeFundingRate(t.binanceFundingRate),
              bitgetPrice: t.bitgetPrice || t.binancePrice,
              bitgetFundingRate: normalizeFundingRate(t.bitgetFundingRate),
              nextFundingTime: t.nextFundingTime || getDeterministicNextFundingTime(),
            });
          }
        })
        .catch(() => {});
    };

    fetchInitialTicker();
    const fallbackTickerInterval = setInterval(fetchInitialTicker, 3000); // 3s periodic REST calibration

    // 2. BINANCE FUTURES WEBSOCKET
    let binanceReconnectTimer: any;
    const connectBinance = () => {
      try {
        const ws = new WebSocket(`wss://fstream.binance.com/ws/${symLower}@markPrice@1s`);
        binanceWsRef.current = ws;

        ws.onopen = () => {
          queueThrottledUpdate({ binanceWsConnected: true });
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.e === "markPriceUpdate") {
              const markPrice = parseFloat(msg.p || "0");
              const nextFunding = parseInt(msg.T || "0", 10);

              if (markPrice > 0) {
                const updatePayload: Partial<DualStreamData> = {
                  binancePrice: markPrice,
                  nextFundingTime: nextFunding > 0 ? nextFunding : undefined,
                  binanceWsConnected: true,
                };
                if (msg.r !== undefined && msg.r !== "") {
                  const rawR = parseFloat(msg.r);
                  if (!isNaN(rawR)) updatePayload.binanceFundingRate = normalizeFundingRate(rawR);
                }
                queueThrottledUpdate(updatePayload);
              }
            }
          } catch {}
        };

        ws.onerror = () => {
          queueThrottledUpdate({ binanceWsConnected: false });
        };

        ws.onclose = () => {
          queueThrottledUpdate({ binanceWsConnected: false });
          binanceReconnectTimer = setTimeout(connectBinance, 3000);
        };
      } catch {
        binanceReconnectTimer = setTimeout(connectBinance, 5000);
      }
    };

    connectBinance();

    // 3. BITGET FUTURES WEBSOCKET (V2 Public Stream)
    let bitgetReconnectTimer: any;
    let bitgetPingInterval: any;

    const connectBitget = () => {
      try {
        const ws = new WebSocket("wss://ws.bitget.com/v2/ws/public");
        bitgetWsRef.current = ws;

        ws.onopen = () => {
          queueThrottledUpdate({ bitgetWsConnected: true });
          ws.send(
            JSON.stringify({
              op: "subscribe",
              args: [{ instType: "USDT-FUTURES", channel: "ticker", instId: symUpper }],
            })
          );

          // Bitget ping keep-alive every 25s
          bitgetPingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send("ping");
            }
          }, 25000);
        };

        ws.onmessage = (event) => {
          if (event.data === "pong") return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.action === "snapshot" || msg.action === "update") {
              const ticker = msg.data?.[0];
              if (ticker) {
                const lastPrice = parseFloat(ticker.lastPr || ticker.markPrice || "0");

                if (lastPrice > 0) {
                  const updatePayload: Partial<DualStreamData> = {
                    bitgetPrice: lastPrice,
                    bitgetWsConnected: true,
                  };
                  if (ticker.fundingRate !== undefined && ticker.fundingRate !== "") {
                    const rawBgRate = parseFloat(ticker.fundingRate);
                    if (!isNaN(rawBgRate)) updatePayload.bitgetFundingRate = normalizeFundingRate(rawBgRate);
                  }
                  queueThrottledUpdate(updatePayload);
                }
              }
            }
          } catch {}
        };

        ws.onerror = () => {
          queueThrottledUpdate({ bitgetWsConnected: false });
        };

        ws.onclose = () => {
          clearInterval(bitgetPingInterval);
          queueThrottledUpdate({ bitgetWsConnected: false });
          bitgetReconnectTimer = setTimeout(connectBitget, 3000);
        };
      } catch {
        bitgetReconnectTimer = setTimeout(connectBitget, 5000);
      }
    };

    connectBitget();

    return () => {
      clearTimeout(binanceReconnectTimer);
      clearTimeout(bitgetReconnectTimer);
      clearInterval(bitgetPingInterval);
      clearInterval(fallbackTickerInterval);
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      if (binanceWsRef.current) binanceWsRef.current.close();
      if (bitgetWsRef.current) bitgetWsRef.current.close();
    };
  }, [symUpper, symLower]);

  return data;
}
