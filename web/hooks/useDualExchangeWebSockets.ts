"use client";

import { useEffect, useState, useRef } from "react";

export interface DualStreamData {
  symbol: string;
  binancePrice: number;
  binanceFundingRate: number;
  bitgetPrice: number;
  bitgetFundingRate: number;
  spreadBps: number;
  annualizedYieldPct: number;
  nextFundingTime: number;
  binanceWsConnected: boolean;
  bitgetWsConnected: boolean;
  lastUpdated: number;
}

const DEFAULT_PRICES: Record<string, number> = {
  BTCUSDT: 86400,
  ETHUSDT: 3100,
  SOLUSDT: 185,
  DOGEUSDT: 0.165,
  XRPUSDT: 1.45,
};

export function useDualExchangeWebSockets(symbol: string = "BTCUSDT"): DualStreamData {
  const symUpper = symbol.toUpperCase();
  const symLower = symbol.toLowerCase();
  const defaultPrice = DEFAULT_PRICES[symUpper] || 86400;

  const [data, setData] = useState<DualStreamData>({
    symbol: symUpper,
    binancePrice: defaultPrice,
    binanceFundingRate: 0.0001,
    bitgetPrice: defaultPrice * 0.9998,
    bitgetFundingRate: 0.0002,
    spreadBps: 1.0,
    annualizedYieldPct: 10.95,
    nextFundingTime: Date.now() + 14400000,
    binanceWsConnected: false,
    bitgetWsConnected: false,
    lastUpdated: Date.now(),
  });

  const binanceWsRef = useRef<WebSocket | null>(null);
  const bitgetWsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // 1. BINANCE FUTURES WEBSOCKET
    let binanceReconnectTimer: any;
    const connectBinance = () => {
      try {
        const ws = new WebSocket(`wss://fstream.binance.com/ws/${symLower}@markPrice@1s`);
        binanceWsRef.current = ws;

        ws.onopen = () => {
          setData((prev) => ({ ...prev, binanceWsConnected: true }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.e === "markPriceUpdate") {
              const markPrice = parseFloat(msg.p || String(defaultPrice));
              const fundingRate = parseFloat(msg.r || "0.0001");
              const nextFunding = parseInt(msg.T || "0", 10);

              setData((prev) => {
                const spread = (fundingRate - prev.bitgetFundingRate) * 10000;
                const apy = (Math.abs(spread) * 3 * 365) / 100;
                return {
                  ...prev,
                  symbol: symUpper,
                  binancePrice: markPrice,
                  binanceFundingRate: fundingRate,
                  spreadBps: parseFloat(spread.toFixed(2)),
                  annualizedYieldPct: parseFloat(apy.toFixed(2)),
                  nextFundingTime: nextFunding || prev.nextFundingTime,
                  lastUpdated: Date.now(),
                };
              });
            }
          } catch {}
        };

        ws.onerror = () => {
          setData((prev) => ({ ...prev, binanceWsConnected: false }));
        };

        ws.onclose = () => {
          setData((prev) => ({ ...prev, binanceWsConnected: false }));
          binanceReconnectTimer = setTimeout(connectBinance, 3000);
        };
      } catch {
        binanceReconnectTimer = setTimeout(connectBinance, 5000);
      }
    };

    connectBinance();

    // 2. BITGET FUTURES WEBSOCKET (Supports V3 Demo wspap with automatic V2 fallback)
    let bitgetReconnectTimer: any;
    let bitgetPingInterval: any;
    let endpointIdx = 0;
    const bitgetEndpoints = [
      {
        url: "wss://wspap.bitget.com/v3/ws/public",
        sub: { op: "subscribe", args: [{ instType: "usdt-futures", topic: "ticker", symbol: symUpper }] },
      },
      {
        url: "wss://ws.bitget.com/v2/ws/public",
        sub: { op: "subscribe", args: [{ instType: "USDT-FUTURES", channel: "ticker", instId: symUpper }] },
      },
    ];

    const connectBitget = () => {
      try {
        const ep = bitgetEndpoints[endpointIdx % bitgetEndpoints.length];
        const ws = new WebSocket(ep.url);
        bitgetWsRef.current = ws;

        ws.onopen = () => {
          setData((prev) => ({ ...prev, bitgetWsConnected: true }));
          ws.send(JSON.stringify(ep.sub));

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
                const lastPrice = parseFloat(ticker.lastPrice || ticker.lastPr || ticker.markPrice || String(defaultPrice));
                const fundingRate = parseFloat(ticker.fundingRate || "0.0002");

                setData((prev) => {
                  const spread = (prev.binanceFundingRate - fundingRate) * 10000;
                  const apy = (Math.abs(spread) * 3 * 365) / 100;
                  return {
                    ...prev,
                    symbol: symUpper,
                    bitgetPrice: lastPrice,
                    bitgetFundingRate: fundingRate,
                    spreadBps: parseFloat(spread.toFixed(2)),
                    annualizedYieldPct: parseFloat(apy.toFixed(2)),
                    lastUpdated: Date.now(),
                  };
                });
              }
            }
          } catch {}
        };

        ws.onerror = () => {
          setData((prev) => ({ ...prev, bitgetWsConnected: false }));
        };

        ws.onclose = () => {
          clearInterval(bitgetPingInterval);
          setData((prev) => ({ ...prev, bitgetWsConnected: false }));
          endpointIdx++;
          bitgetReconnectTimer = setTimeout(connectBitget, 3000);
        };
      } catch {
        endpointIdx++;
        bitgetReconnectTimer = setTimeout(connectBitget, 5000);
      }
    };

    connectBitget();

    return () => {
      clearTimeout(binanceReconnectTimer);
      clearTimeout(bitgetReconnectTimer);
      clearInterval(bitgetPingInterval);
      if (binanceWsRef.current) binanceWsRef.current.close();
      if (bitgetWsRef.current) bitgetWsRef.current.close();
    };
  }, [symUpper, symLower, defaultPrice]);

  return data;
}
