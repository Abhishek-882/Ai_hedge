/**
 * High-Precision Dynamic EWMA Network Latency Tracker & Lead Stagger Controller 2.0
 * Features:
 *  - Outlier-Resistant Filtering (Spike Rejection)
 *  - Stagger Policy Engine (Auto EWMA, Pure Parallel 0ms, Manual Offset)
 *  - Inter-leg matching engine arrival skew minimization (<0.5ms target)
 */

export interface LatencyMetrics {
  ewmaBinanceRtt: number;
  ewmaBitgetRtt: number;
  rttDiffMs: number;
  recommendedStaggerMs: number;
  staggerVenue: "Binance" | "Bitget" | "None";
  lastDeltaMs: number;
  sampleCount: number;
  rejectedSpikes: number;
}

export type StaggerPolicy = "auto_ewma" | "simultaneous" | "manual";

// Initial empirical baseline measured from live server environment
let ewmaBinanceRtt = 640.0;
let ewmaBitgetRtt = 460.0;
const EWMA_ALPHA = 0.25; // Smoother tracking
let lastDeltaMs = 0.0;
let lastStaggerMs = 0.0;
let lastStaggerVenue: "Binance" | "Bitget" | "None" = "Bitget";
let totalSamples = 0;
let rejectedSpikes = 0;

/**
 * Calculate dynamic lead stagger delay according to selected policy
 */
export function getLeadStaggerDelays(
  policy: StaggerPolicy = "auto_ewma",
  manualDelayMs: number = 0,
  manualVenue: "Binance" | "Bitget" | "None" = "None"
) {
  if (policy === "simultaneous") {
    return {
      binanceDelayMs: 0,
      bitgetDelayMs: 0,
      staggerVenue: "None" as const,
      leadStaggerAppliedMs: 0,
      policy,
    };
  }

  if (policy === "manual" && manualVenue !== "None" && manualDelayMs > 0) {
    const clampedDelay = Math.min(Math.max(Math.round(manualDelayMs), 0), 600);
    return {
      binanceDelayMs: manualVenue === "Binance" ? clampedDelay : 0,
      bitgetDelayMs: manualVenue === "Bitget" ? clampedDelay : 0,
      staggerVenue: manualVenue,
      leadStaggerAppliedMs: clampedDelay,
      policy,
    };
  }

  // Default: Auto EWMA
  const rttDiff = ewmaBitgetRtt - ewmaBinanceRtt;
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
    policy: "auto_ewma" as const,
  };
}

/**
 * Record completed leg roundtrip durations with statistical spike rejection
 */
export function recordExecutionRTT(
  binanceDurationMs: number,
  bitgetDurationMs: number,
  arrivalDeltaMs: number,
  staggerAppliedMs: number,
  venue: "Binance" | "Bitget" | "None"
) {
  totalSamples++;

  // Outlier filter: ignore transient network hiccups (> 2.5x current EWMA or > 2500ms)
  const isBinanceOutlier = binanceDurationMs > Math.max(ewmaBinanceRtt * 2.5, 2500) || binanceDurationMs < 40;
  const isBitgetOutlier = bitgetDurationMs > Math.max(ewmaBitgetRtt * 2.5, 2500) || bitgetDurationMs < 40;

  if (isBinanceOutlier || isBitgetOutlier) {
    rejectedSpikes++;
  }

  if (!isBinanceOutlier) {
    ewmaBinanceRtt = (1 - EWMA_ALPHA) * ewmaBinanceRtt + EWMA_ALPHA * binanceDurationMs;
  }
  if (!isBitgetOutlier) {
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
    sampleCount: totalSamples,
    rejectedSpikes,
  };
}
