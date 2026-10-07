/**
 * Deterministic UTC funding settlement calculator for Binance & Bitget Perpetual Futures.
 * Standard funding boundaries occur every 8 hours at:
 * 00:00:00 UTC, 08:00:00 UTC, and 16:00:00 UTC.
 */

export function getDeterministicNextFundingTime(nowMs: number = Date.now()): number {
  const d = new Date(nowMs);
  const curUtcHours = d.getUTCHours();

  let targetUtcHour = 0;
  let dayOffset = 0;

  if (curUtcHours < 8) {
    targetUtcHour = 8;
  } else if (curUtcHours < 16) {
    targetUtcHour = 16;
  } else {
    targetUtcHour = 0;
    dayOffset = 1;
  }

  const target = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() + dayOffset,
      targetUtcHour,
      0,
      0,
      0
    )
  );

  return target.getTime();
}

export function formatCountdown(targetMs: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, targetMs - nowMs);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
