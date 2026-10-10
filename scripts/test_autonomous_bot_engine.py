import os
import sys
import json
import time
import requests

BASE_URL = os.environ.get("BASE_URL", "https://ai-hedge-1.onrender.com")

def test_daemon_api():
    print(f"\n=======================================================")
    print(f"TESTING 24/7 AUTONOMOUS BOT DAEMON ON {BASE_URL}")
    print(f"=======================================================\n")

    # 1. GET /api/bot/daemon
    print("1. Testing GET /api/bot/daemon status...")
    try:
      res = requests.get(f"{BASE_URL}/api/bot/daemon", timeout=15)
      print(f"Status Code: {res.status_code}")
      data = res.json()
      assert data.get("success") == True, "GET /api/bot/daemon failed"
      daemon = data.get("daemon", {})
      print(f"[OK] Daemon isRunning: {daemon.get('isRunning')}")
      print(f"[OK] Daemon statusText: {daemon.get('statusText')}")
      print(f"[OK] Config Min Spread: {daemon.get('config', {}).get('minSpreadBps')} bps")
      print(f"[OK] Config Max Divergence: {daemon.get('config', {}).get('maxPriceDivergencePct')}%")
      print(f"[OK] Config Allocation: {daemon.get('config', {}).get('balanceAllocationPct')}%")
      print(f"[OK] Config Max Hedges: {daemon.get('config', {}).get('maxSimultaneousHedges')}")
      print(f"[OK] Active Hedges Count: {len(daemon.get('activeHedges', []))}")
      print(f"[OK] Logs Count: {len(daemon.get('logs', []))}")
    except Exception as e:
      print(f"GET error: {e}")

    # 2. POST /api/bot/daemon update_config
    print("\n2. Testing POST /api/bot/daemon action='update_config'...")
    try:
      config_payload = {
          "action": "update_config",
          "config": {
              "minSpreadBps": 5.0,
              "maxPriceDivergencePct": 0.01,
              "balanceAllocationPct": 20,
              "leverageMode": "MAX_PER_COIN",
              "maxSimultaneousHedges": 3,
              "closeMaxPriceDivergencePct": 0.01
          }
      }
      res = requests.post(f"{BASE_URL}/api/bot/daemon", json=config_payload, timeout=15)
      print(f"Status Code: {res.status_code}")
      data = res.json()
      assert data.get("success") == True, "Config update failed"
      updated_config = data.get("daemon", {}).get("config", {})
      assert updated_config.get("minSpreadBps") == 5.0, "minSpreadBps mismatch"
      assert updated_config.get("maxPriceDivergencePct") == 0.01, "maxPriceDivergencePct mismatch"
      assert updated_config.get("balanceAllocationPct") == 20, "balanceAllocationPct mismatch"
      print("[OK] Configuration successfully updated and confirmed by server.")
    except Exception as e:
      print(f"Config update error: {e}")

    # 3. POST /api/bot/daemon force_scan
    print("\n3. Testing POST /api/bot/daemon action='force_scan'...")
    try:
      res = requests.post(f"{BASE_URL}/api/bot/daemon", json={"action": "force_scan"}, timeout=20)
      print(f"Status Code: {res.status_code}")
      data = res.json()
      assert data.get("success") == True, "Force scan failed"
      daemon = data.get("daemon", {})
      print(f"[OK] Cycles Completed: #{daemon.get('cyclesCompleted')}")
      print(f"[OK] Current Status: {daemon.get('statusText')}")
      candidate = daemon.get("lastEvaluatedCandidate")
      if candidate:
          print(f"[OK] Last Evaluated Candidate: {candidate.get('symbol')} | Spread: {candidate.get('spreadBps')} bps | Countdown: {candidate.get('secondsToFunding')}s | Qualified: {candidate.get('qualified')}")
      else:
          print("[OK] Scan completed. No coin currently in imminent <1m funding window.")
    except Exception as e:
      print(f"Force scan error: {e}")

if __name__ == "__main__":
    test_daemon_api()
