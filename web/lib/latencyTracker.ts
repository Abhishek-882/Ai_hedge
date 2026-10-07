/**
 * High-Precision Dynamic EWMA Network Latency Tracker & Lead Stagger Controller
 * Equalizes cross-exchange matching engine arrival time and compresses
 * inter-leg execution delta between Binance and Bitget.
 */

export interface LatencyMetrics {
  ewmaBinanceRtt: number;
  ewmaBitgetRtt: number;
  rttDiffMs: number;
  recommendedStaggerMs: number;
  staggerVenue: "Binance" | "Bitget" | "None";
  lastDeltaMs: number;
}

// Initial empirical baseline measured from live server environment
// Binance typically ~640ms, Bitget typically ~460ms from this location
let ewmaBinanceRtt = 640.0;
let ewmaBitgetRtt = 460.0;
const EWMA_ALPHA = 0.30;
let lastDeltaMs = 0.0;
let lastStaggerMs = 0.0;
let lastStaggerVenue: "Binance" | "Bitget" | "None" = "Bitget";

/**
 * Calculate dynamic lead stagger delay for simultaneous matching engine arrival
 */
export function getLeadStaggerDelays() {
  const rttDiff = ewmaBitgetRtt - ewmaBinanceRtt; // e.g. 460 - 640 = -180ms
  let binanceDelayMs = 0;
  let bitgetDelayMs = 0;
  let staggerVenue: "Binance" | "Bitget" | "None" = "None";

  if (rttDiff > 0) {
    // Bitget is slower: dispatch Bitget immediately, stagger Binance
    binanceDelayMs = Math.round(Math.min(Math.max(rttDiff, 0), 450));
    staggerVenue = "Binance";
  } else if (rttDiff < 0) {
    // Binance is slower: dispatch Binance immediately, stagger Bitget
    bitgetDelayMs = Math.round(Math.min(Math.max(-rttDiff, 0), 450));
    staggerVenue = "Bitget";
  }

  const leadStaggerAppliedMs = Math.max(binanceDelayMs, bitgetDelayMs);

  return {
    binanceDelayMs,
    bitgetDelayMs,
    staggerVenue,
    leadStaggerAppliedMs,
  };
}

/**
 * Record completed leg roundtrip durations and update EWMA filters
 */
export function recordExecutionRTT(
  binanceDurationMs: number,
  bitgetDurationMs: number,
  arrivalDeltaMs: number,
  staggerAppliedMs: number,
  venue: "Binance" | "Bitget" | "None"
) {
  if (binanceDurationMs > 50 && binanceDurationMs < 4000) {
    ewmaBinanceRtt = (1 - EWMA_ALPHA) * ewmaBinanceRtt + EWMA_ALPHA * binanceDurationMs;
  }
  if (bitgetDurationMs > 50 && bitgetDurationMs < 4000) {
    ewmaBitgetRtt = (1 - EWMA_ALPHA) * ewmaBitgetRtt + EWMA_ALPHA * bitgetDurationMs;
  }
  lastDeltaMs = arrivalDeltaMs;
  lastStaggerMs = staggerAppliedMs;
  lastStaggerVenue = venue;
}

/**
 * Retrieve current latency diagnostics
 */
export function getLatencyMetrics(): LatencyMetrics {
  return {
    ewmaBinanceRtt: parseFloat(ewmaBinanceRtt.toFixed(1)),
    ewmaBitgetRtt: parseFloat(ewmaBitgetRtt.toFixed(1)),
    rttDiffMs: parseFloat((ewmaBitgetRtt - ewmaBinanceRtt).toFixed(1)),
    recommendedStaggerMs: Math.round(Math.abs(ewmaBitgetRtt - ewmaBinanceRtt)),
    staggerVenue: lastStaggerVenue,
    lastDeltaMs: parseFloat(lastDeltaMs.toFixed(2)),
  };
}
