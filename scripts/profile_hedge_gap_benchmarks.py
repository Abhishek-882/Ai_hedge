"""Profile Cross-Exchange Dual Hedging Latency Gap Across Multiple Trials."""

import urllib.request
import json
import time

URL = "http://localhost:3000/api/hedge"

def run_benchmarks(num_trials=5):
    results = []
    print(f"--- Running {num_trials} Live Cross-Exchange Dual Hedge Benchmarks ---")
    for i in range(1, num_trials + 1):
        payload = {
            "action": "benchmark",
            "quantity": "0.005",
            "leg1Side": "SELL"
        }
        req = urllib.request.Request(
            URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        try:
            t0 = time.time()
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            elapsed = time.time() - t0
            
            entry = data.get("entry", {})
            exit_data = data.get("exit", {})
            pnl = data.get("pnl", {})
            
            leg1 = entry.get("leg1", {})
            leg2 = entry.get("leg2", {})
            
            gap = entry.get("interLegDeltaMs")
            stagger = entry.get("leadStaggerAppliedMs")
            total_entry = entry.get("totalEntryMs")
            dual_close = exit_data.get("dualCloseLatencyMs")
            net_pnl = pnl.get("netPnl")
            
            record = {
                "trial": i,
                "bn_order_id": leg1.get("orderId"),
                "bn_dispatch_ms": round(leg1.get("dispatchMs", 0), 2),
                "bg_order_id": leg2.get("orderId"),
                "bg_dispatch_ms": round(leg2.get("dispatchMs", 0), 2),
                "lead_stagger_ms": stagger,
                "inter_leg_gap_ms": gap,
                "total_entry_ms": total_entry,
                "dual_close_ms": dual_close,
                "net_pnl_usdt": net_pnl,
                "delta_neutral": pnl.get("deltaNeutralSuccess")
            }
            results.append(record)
            print(f"Trial {i}: Inter-Leg Gap = {gap} ms | Lead Stagger = {stagger} ms | Total Entry = {total_entry} ms | Dual Close = {dual_close} ms | Net PnL = ${net_pnl} | Gap < 1ms: {gap < 1.0}")
            time.sleep(2)
        except Exception as e:
            print(f"Trial {i} error: {e}")

    print("\n--- Summary of Dual Hedge Latency Benchmark ---")
    gaps = [r["inter_leg_gap_ms"] for r in results if r["inter_leg_gap_ms"] is not None]
    if gaps:
        print(f"Min Inter-Leg Gap: {min(gaps)} ms")
        print(f"Avg Inter-Leg Gap: {round(sum(gaps)/len(gaps), 2)} ms")
        print(f"Max Inter-Leg Gap: {max(gaps)} ms")
        print(f"Sub-Millisecond Trials (<1.0 ms): {sum(1 for g in gaps if g < 1.0)} / {len(gaps)}")

    with open("c:/Users/Asus/Downloads/prj/funding-rate-bot/scripts/benchmark_results.json", "w") as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    run_benchmarks(5)
