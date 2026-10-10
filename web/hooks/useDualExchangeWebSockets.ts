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
  fundingIntervalHours?: number;
  clockOffsetMs: number;
  binanceWsConnected: boolean;
  bitgetWsConnected: boolean;
  lastUpdated: number;
}

// Module-level persistent cache per symbol
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

  const currentSymbolRef = useRef<string>(symUpper);
  currentSymbolRef.current = symUpper;

  // Retrieve cached data or seed data strictly for THIS symbol
  const getInitialSnapshot = (targetSym = symUpper): DualStreamData => {
    const cached = SESSION_PRICE_CACHE.get(targetSym);
    const isMatchingSeed = seedData?.symbol === targetSym;
    const intervalHours = (isMatchingSeed ? seedData?.fundingIntervalHours : undefined) ?? cached?.fundingIntervalHours ?? 8;
    const payoutsPerDay = 24 / intervalHours;
    const bPrice = (isMatchingSeed ? seedData?.binancePrice : 0) || cached?.binancePrice || 0;
    const gPrice = (isMatchingSeed ? seedData?.bitgetPrice : 0) || cached?.bitgetPrice || bPrice;
    const bRate = normalizeFundingRate((isMatchingSeed ? seedData?.binanceFundingRate : undefined) ?? cached?.binanceFundingRate ?? 0.0001);
    const gRate = normalizeFundingRate((isMatchingSeed ? seedData?.bitgetFundingRate : undefined) ?? cached?.bitgetFundingRate ?? 0.0002);
    const spread = (isMatchingSeed ? seedData?.spreadBps : undefined) ?? cached?.spreadBps ?? parseFloat(((gRate - bRate) * 10000).toFixed(2));
    const apy = (isMatchingSeed ? seedData?.annualizedYieldPct : undefined) ?? cached?.annualizedYieldPct ?? parseFloat(((Math.abs(spread) * payoutsPerDay * 365) / 100).toFixed(2));
    const nextFunding = (isMatchingSeed ? seedData?.nextFundingTime : undefined) || cached?.nextFundingTime || getDeterministicNextFundingTime(Date.now(), intervalHours);

    return {
      symbol: targetSym,
      binancePrice: bPrice,
      binanceFundingRate: bRate,
      bitgetPrice: gPrice,
      bitgetFundingRate: gRate,
      spreadBps: spread,
      annualizedYieldPct: apy,
      nextFundingTime: nextFunding,
      fundingIntervalHours: intervalHours,
      clockOffsetMs: cached?.clockOffsetMs ?? 24,
      binanceWsConnected: cached?.binanceWsConnected ?? false,
      bitgetWsConnected: cached?.bitgetWsConnected ?? false,
      lastUpdated: Date.now(),
    };
  };

  const [data, setData] = useState<DualStreamData>(() => getInitialSnapshot(symUpper));

  const binanceWsRef = useRef<WebSocket | null>(null);
  const bitgetWsRef = useRef<WebSocket | null>(null);

  // Throttling buffer to synchronize dual feeds
  const pendingUpdatesRef = useRef<Partial<DualStreamData>>({});
  const throttleTimerRef = useRef<any>(null);

  // Seed data sync on change - strictly guarded by symbol
  useEffect(() => {
    if (seedData && seedData.symbol === symUpper && seedData.binancePrice) {
      setData((prev) => {
        // If prev was from a different symbol, discard prev entirely!
        const base = prev.symbol === symUpper ? prev : getInitialSnapshot(symUpper);
        const next: DualStreamData = {
          ...base,
          symbol: symUpper,
          binancePrice: seedData.binancePrice || base.binancePrice,
          bitgetPrice: seedData.bitgetPrice || base.bitgetPrice || seedData.binancePrice || 0,
          binanceFundingRate: normalizeFundingRate(seedData.binanceFundingRate ?? base.binanceFundingRate),
          bitgetFundingRate: normalizeFundingRate(seedData.bitgetFundingRate ?? base.bitgetFundingRate),
          spreadBps: seedData.spreadBps ?? base.spreadBps,
          annualizedYieldPct: seedData.annualizedYieldPct ?? base.annualizedYieldPct,
          nextFundingTime: seedData.nextFundingTime || base.nextFundingTime,
          lastUpdated: Date.now(),
        };
        SESSION_PRICE_CACHE.set(symUpper, next);
        return next;
      });
    }
  }, [symUpper, seedData]);

  useEffect(() => {
    let isCurrentEffect = true;
    const abortController = new AbortController();

    // On symbol switch, immediately reset state to the new symbol snapshot (NEVER reuse previous symbol data)
    pendingUpdatesRef.current = {};
    if (throttleTimerRef.current) {
      clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }

    const snapshot = getInitialSnapshot(symUpper);
    setData(snapshot);

    // Helper to queue throttled state updates
    const queueThrottledUpdate = (partial: Partial<DualStreamData>, sourceSymbol?: string) => {
      if (!isCurrentEffect || currentSymbolRef.current !== symUpper) return;
      if (sourceSymbol && sourceSymbol.toUpperCase() !== symUpper) return;

      pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...partial };
      if (!throttleTimerRef.current) {
        throttleTimerRef.current = setTimeout(() => {
          throttleTimerRef.current = null;
          if (!isCurrentEffect || currentSymbolRef.current !== symUpper) return;

          if (Object.keys(pendingUpdatesRef.current).length > 0) {
            setData((prev) => {
              // Crucial guard: If prev belongs to an old symbol, discard it completely
              const base = prev.symbol === symUpper ? prev : getInitialSnapshot(symUpper);
              const merged = { ...base, ...pendingUpdatesRef.current, symbol: symUpper, lastUpdated: Date.now() };

              const bRate = normalizeFundingRate(merged.binanceFundingRate ?? base.binanceFundingRate);
              const gRate = normalizeFundingRate(merged.bitgetFundingRate ?? base.bitgetFundingRate);
              merged.binanceFundingRate = bRate;
              merged.bitgetFundingRate = gRate;

              const spread = parseFloat(((gRate - bRate) * 10000).toFixed(2));
              merged.spreadBps = spread;
              merged.annualizedYieldPct = parseFloat(((Math.abs(spread) * 3 * 365) / 100).toFixed(2));

              SESSION_PRICE_CACHE.set(symUpper, merged);
              pendingUpdatesRef.current = {};
              return merged;
            });
          }
        }, 150);
      }
    };

    // 1. Initial REST Ticker Fetch with cancellation
    const fetchInitialTicker = () => {
      fetch(`/api/ticker?symbol=${symUpper}`, {
        cache: "no-store",
        signal: abortController.signal,
      })
        .then((res) => res.json())
        .then((t) => {
          if (!isCurrentEffect || currentSymbolRef.current !== symUpper) return;
          if (t.success && t.symbol === symUpper && t.binancePrice) {
            queueThrottledUpdate(
              {
                symbol: symUpper,
                binancePrice: t.binancePrice,
                binanceFundingRate: normalizeFundingRate(t.binanceFundingRate),
                bitgetPrice: t.bitgetPrice || t.binancePrice,
                bitgetFundingRate: normalizeFundingRate(t.bitgetFundingRate),
                nextFundingTime: t.nextFundingTime || getDeterministicNextFundingTime(Date.now(), t.fundingIntervalHours || 8),
                fundingIntervalHours: t.fundingIntervalHours || 8,
                annualizedYieldPct: t.annualizedYieldPct,
              },
              symUpper
            );
          }
        })
        .catch(() => {});
    };

    fetchInitialTicker();
    const fallbackTickerInterval = setInterval(fetchInitialTicker, 3000);

    // 2. BINANCE FUTURES WEBSOCKET
    let binanceReconnectTimer: any;
    const connectBinance = () => {
      if (!isCurrentEffect) return;
      try {
        const ws = new WebSocket(`wss://fstream.binance.com/ws/${symLower}@markPrice@1s`);
        binanceWsRef.current = ws;

        ws.onopen = () => {
          if (!isCurrentEffect || currentSymbolRef.current !== symUpper) return;
          queueThrottledUpdate({ binanceWsConnected: true }, symUpper);
        };

        ws.onmessage = (event) => {
          if (!isCurrentEffect || currentSymbolRef.current !== symUpper) return;
          try {
            const msg = JSON.parse(event.data);
            // Strict symbol check: drop any frame from previous symbol
            if (msg.s && msg.s.toUpperCase() !== symUpper) return;

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
                queueThrottledUpdate(updatePayload, symUpper);
              }
            }
          } catch {}
        };

        ws.onerror = () => {
          if (isCurrentEffect) queueThrottledUpdate({ binanceWsConnected: false }, symUpper);
        };

        ws.onclose = () => {
          if (isCurrentEffect) {
            queueThrottledUpdate({ binanceWsConnected: false }, symUpper);
            binanceReconnectTimer = setTimeout(connectBinance, 3000);
          }
        };
      } catch {
        if (isCurrentEffect) binanceReconnectTimer = setTimeout(connectBinance, 5000);
      }
    };

    connectBinance();

    // 3. BITGET FUTURES WEBSOCKET
    let bitgetReconnectTimer: any;
    let bitgetPingInterval: any;

    const connectBitget = () => {
      if (!isCurrentEffect) return;
      try {
        const ws = new WebSocket("wss://ws.bitget.com/v2/ws/public");
        bitgetWsRef.current = ws;

        ws.onopen = () => {
          if (!isCurrentEffect || currentSymbolRef.current !== symUpper) return;
          queueThrottledUpdate({ bitgetWsConnected: true }, symUpper);
          ws.send(
            JSON.stringify({
              op: "subscribe",
              args: [{ instType: "USDT-FUTURES", channel: "ticker", instId: symUpper }],
            })
          );

          bitgetPingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send("ping");
            }
          }, 25000);
        };

        ws.onmessage = (event) => {
          if (event.data === "pong" || !isCurrentEffect || currentSymbolRef.current !== symUpper) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.action === "snapshot" || msg.action === "update") {
              const ticker = msg.data?.[0];
              // Strict symbol check for Bitget instId
              if (ticker?.instId && ticker.instId.toUpperCase() !== symUpper) return;

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
                  queueThrottledUpdate(updatePayload, symUpper);
                }
              }
            }
          } catch {}
        };

        ws.onerror = () => {
          if (isCurrentEffect) queueThrottledUpdate({ bitgetWsConnected: false }, symUpper);
        };

        ws.onclose = () => {
          clearInterval(bitgetPingInterval);
          if (isCurrentEffect) {
            queueThrottledUpdate({ bitgetWsConnected: false }, symUpper);
            bitgetReconnectTimer = setTimeout(connectBitget, 3000);
          }
        };
      } catch {
        if (isCurrentEffect) bitgetReconnectTimer = setTimeout(connectBitget, 5000);
      }
    };

    connectBitget();

    return () => {
      isCurrentEffect = false;
      abortController.abort();
      clearTimeout(binanceReconnectTimer);
      clearTimeout(bitgetReconnectTimer);
      clearInterval(bitgetPingInterval);
      clearInterval(fallbackTickerInterval);
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      pendingUpdatesRef.current = {};
      if (binanceWsRef.current) binanceWsRef.current.close();
      if (bitgetWsRef.current) bitgetWsRef.current.close();
    };
  }, [symUpper, symLower]);

  return data;
}
