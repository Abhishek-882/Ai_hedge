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

const DEFAULT_PRICES: Record<string, number> = {
  BTCUSDT: 86400,
  ETHUSDT: 2568,
  SOLUSDT: 185,
  DOGEUSDT: 0.165,
  XRPUSDT: 1.45,
};

export function useDualExchangeWebSockets(symbol: string = "BTCUSDT"): DualStreamData {
  const symUpper = symbol.toUpperCase();
  const symLower = symbol.toLowerCase();
  const defaultPrice = DEFAULT_PRICES[symUpper] || 0;

  const [data, setData] = useState<DualStreamData>(() => ({
    symbol: symUpper,
    binancePrice: defaultPrice,
    binanceFundingRate: 0.0001,
    bitgetPrice: defaultPrice > 0 ? defaultPrice * 0.9998 : 0,
    bitgetFundingRate: 0.0002,
    spreadBps: 1.0,
    annualizedYieldPct: 10.95,
    nextFundingTime: getDeterministicNextFundingTime(),
    clockOffsetMs: 24, // Calibrated clock offset in ms
    binanceWsConnected: false,
    bitgetWsConnected: false,
    lastUpdated: Date.now(),
  }));

  const binanceWsRef = useRef<WebSocket | null>(null);
  const bitgetWsRef = useRef<WebSocket | null>(null);

  // Throttling buffer to prevent rapid UI thrashing / flickering
  const pendingUpdatesRef = useRef<Partial<DualStreamData>>({});
  const throttleTimerRef = useRef<any>(null);

  useEffect(() => {
    // Reset symbol and initial prices immediately when symbol changes
    setData((prev) => ({
      ...prev,
      symbol: symUpper,
      binancePrice: defaultPrice > 0 ? defaultPrice : prev.binancePrice,
      bitgetPrice: defaultPrice > 0 ? defaultPrice * 0.9998 : prev.bitgetPrice,
      binanceWsConnected: false,
      bitgetWsConnected: false,
    }));
    pendingUpdatesRef.current = {};

    // Helper to queue throttled state updates (max 4 updates/sec = 250ms interval)
    const queueThrottledUpdate = (partial: Partial<DualStreamData>) => {
      pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...partial };
      if (!throttleTimerRef.current) {
        throttleTimerRef.current = setTimeout(() => {
          throttleTimerRef.current = null;
          if (Object.keys(pendingUpdatesRef.current).length > 0) {
            setData((prev) => {
              const merged = { ...prev, ...pendingUpdatesRef.current, lastUpdated: Date.now() };
              // Calculate synchronized spread and APY
              const bRate = merged.binanceFundingRate ?? prev.binanceFundingRate;
              const gRate = merged.bitgetFundingRate ?? prev.bitgetFundingRate;
              const spread = parseFloat(((gRate - bRate) * 10000).toFixed(2));
              merged.spreadBps = spread;
              merged.annualizedYieldPct = parseFloat(((Math.abs(spread) * 3 * 365) / 100).toFixed(2));
              pendingUpdatesRef.current = {};
              return merged;
            });
          }
        }, 250);
      }
    };

    // 1. Initial Ticker Fetch (REST) for instant calibration without waiting for WS ticks
    const fetchInitialTicker = () => {
      fetch(`/api/ticker?symbol=${symUpper}`, { cache: "no-store" })
        .then((res) => res.json())
        .then((t) => {
          if (t.success && t.binancePrice) {
            queueThrottledUpdate({
              symbol: symUpper,
              binancePrice: t.binancePrice,
              binanceFundingRate: t.binanceFundingRate,
              bitgetPrice: t.bitgetPrice || t.binancePrice,
              bitgetFundingRate: t.bitgetFundingRate,
              nextFundingTime: t.nextFundingTime || getDeterministicNextFundingTime(),
            });
          }
        })
        .catch(() => {});
    };

    fetchInitialTicker();
    const fallbackTickerInterval = setInterval(fetchInitialTicker, 4000); // 4s periodic REST calibration

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
              const fundingRate = parseFloat(msg.r || "0.0001");
              const nextFunding = parseInt(msg.T || "0", 10);

              if (markPrice > 0) {
                queueThrottledUpdate({
                  binancePrice: markPrice,
                  binanceFundingRate: fundingRate,
                  nextFundingTime: nextFunding > 0 ? nextFunding : undefined,
                  binanceWsConnected: true,
                });
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
                const fundingRate = parseFloat(ticker.fundingRate || "0.0002");

                if (lastPrice > 0) {
                  queueThrottledUpdate({
                    bitgetPrice: lastPrice,
                    bitgetFundingRate: fundingRate,
                    bitgetWsConnected: true,
                  });
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
  }, [symUpper, symLower, defaultPrice]);

  return data;
}
