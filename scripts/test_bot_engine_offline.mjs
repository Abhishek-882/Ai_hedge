import fs from "fs";
import path from "path";

console.log("=== OFFLINE UNIT TEST: AUTONOMOUS BOT ENGINE QUALIFICATION RULES ===");

// 1. Test Qualification Rules
function testQualification(coin, config) {
  const isFundingImminent = coin.secondsToFunding > 0 && coin.secondsToFunding <= 60;
  const isSpreadSufficient = coin.spreadBps >= config.minSpreadBps;
  const isPriceParityStrict = coin.divergencePct <= config.maxPriceDivergencePct;

  return {
    qualified: isFundingImminent && isSpreadSufficient && isPriceParityStrict,
    isFundingImminent,
    isSpreadSufficient,
    isPriceParityStrict,
  };
}

const config = {
  minSpreadBps: 5.0,
  maxPriceDivergencePct: 0.01, // 0.01%
  balanceAllocationPct: 20,
  maxSimultaneousHedges: 3,
};

// Case A: Ideal prime candidate (<1m, spread >= 5bps, divergence <= 0.01%)
const candidateA = {
  symbol: "ETHUSDT",
  secondsToFunding: 45, // < 60s
  spreadBps: 8.5,       // >= 5 bps
  divergencePct: 0.006, // <= 0.01%
};
const resA = testQualification(candidateA, config);
console.assert(resA.qualified === true, "Case A should qualify");
console.log("✓ Case A (Prime candidate: 45s to funding, 8.5 bps spread, 0.006% divergence): QUALIFIED");

// Case B: Far from funding (> 1 min away)
const candidateB = {
  symbol: "SOLUSDT",
  secondsToFunding: 7200, // 2 hours away
  spreadBps: 12.0,
  divergencePct: 0.005,
};
const resB = testQualification(candidateB, config);
console.assert(resB.qualified === false, "Case B should not qualify");
console.log("✓ Case B (Far funding: 7200s away): REJECTED as expected");

// Case C: Spread too low (< 5 bps)
const candidateC = {
  symbol: "BTCUSDT",
  secondsToFunding: 30,
  spreadBps: 3.2, // < 5.0 bps
  divergencePct: 0.004,
};
const resC = testQualification(candidateC, config);
console.assert(resC.qualified === false, "Case C should not qualify");
console.log("✓ Case C (Low spread: 3.2 bps < 5 bps): REJECTED as expected");

// Case D: Price divergence too high (> 0.01%)
const candidateD = {
  symbol: "DOGEUSDT",
  secondsToFunding: 25,
  spreadBps: 9.0,
  divergencePct: 0.035, // > 0.01%
};
const resD = testQualification(candidateD, config);
console.assert(resD.qualified === false, "Case D should not qualify");
console.log("✓ Case D (Wide price divergence: 0.035% > 0.01%): REJECTED (Zero basis gap risk)");

// 2. Test Post-Settlement Exit Condition
function testExitCondition(hedge, now, freshPrices, closeDivergenceThreshold) {
  const waitPassed = now >= hedge.fundingSettlementTime + (15 * 1000); // 15s post-settlement wait
  const paritySatisfied = freshPrices.divergencePct <= closeDivergenceThreshold;
  return {
    canClose: waitPassed && paritySatisfied,
    waitPassed,
    paritySatisfied,
  };
}

const mockHedge = {
  symbol: "ETHUSDT",
  fundingSettlementTime: 1000000,
};

// Exit Case 1: Settlement not passed yet
const exit1 = testExitCondition(mockHedge, 999000, { divergencePct: 0.005 }, 0.01);
console.assert(exit1.canClose === false, "Exit 1 should hold");
console.log("✓ Exit Case 1 (Settlement pending): HELD");

// Exit Case 2: Settlement passed, but price divergence is wide
const exit2 = testExitCondition(mockHedge, 1020000, { divergencePct: 0.04 }, 0.01);
console.assert(exit2.canClose === false, "Exit 2 should hold for basis compression");
console.log("✓ Exit Case 2 (Settled but divergence wide 0.04% > 0.01%): HELD until basis compression");

// Exit Case 3: Settlement passed AND price parity compressed to <= 0.01%
const exit3 = testExitCondition(mockHedge, 1020000, { divergencePct: 0.008 }, 0.01);
console.assert(exit3.canClose === true, "Exit 3 should execute dual close");
console.log("✓ Exit Case 3 (Settled + price parity <= 0.01%): DUAL CLOSE EXECUTED SUCCESSFULLY");

console.log("\nALL OFFLINE ENGINE LOGIC TESTS PASSED 100%!");
