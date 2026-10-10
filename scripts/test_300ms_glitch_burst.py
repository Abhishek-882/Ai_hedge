import sys
import os
import time
from playwright.sync_api import sync_playwright

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BURST_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "test_screenshots", "glitch_burst_verification")
os.makedirs(BURST_DIR, exist_ok=True)

BASE_URL = "https://ai-hedge-1.onrender.com"

def run_burst_test():
    print("=== STARTING 5 RAPID SCREENSHOTS (300ms GAP) GLITCH VERIFICATION ===")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 950})
        page = context.new_page()

        # 1. Login as Admin
        print("1. Logging in as Admin...")
        page.goto(f"{BASE_URL}/login", wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(2000)
        fill_btn = page.locator("button:has-text('Fill Admin')")
        if fill_btn.count() > 0:
            fill_btn.first.click()
            page.wait_for_timeout(500)
        page.click("button[type='submit']")
        page.wait_for_timeout(4000)

        if "/terminal" not in page.url:
            page.goto(f"{BASE_URL}/terminal", wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(3000)

        print(f"2. On Terminal: {page.url}")
        page.wait_for_timeout(3000)

        # Baseline: Ensure BTC is loaded
        print("3. Baselining BTC state...")
        cockpit_header = page.locator("h2:has-text('EXECUTION COCKPIT')").first
        cockpit_card = cockpit_header.locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]")
        cockpit_card.scroll_into_view_if_needed()
        page.wait_for_timeout(1000)

        selector_grid = cockpit_card.locator("div.grid-cols-6").first
        eth_btn = selector_grid.locator("button:has-text('ETH')").first

        print("\n--- INITIATING ASSET SWITCH BTC -> ETH WITH 5 SCREENSHOTS AT 300ms GAPS ---")
        
        # Click ETH
        eth_btn.click()
        t_start = time.time()

        burst_results = []
        for i in range(1, 6):
            shot_path = os.path.join(BURST_DIR, f"shot_{i}_300ms_gap.png")
            page.screenshot(path=shot_path)
            
            # Read visible prices from Cockpit and SpreadTracker
            spread_header = page.locator("h2:has-text('CROSS-EXCHANGE FUNDING SPREAD')").first
            spread_card = spread_header.locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]")
            spread_text = spread_card.inner_text().replace("\n", " | ")
            cockpit_text = cockpit_card.inner_text().replace("\n", " | ")

            elapsed_ms = int((time.time() - t_start) * 1000)
            
            # Check for glitch signals
            has_btc_80k_in_spread = "80," in spread_text or "81," in spread_text or "86,400" in spread_text
            has_btc_in_loaded_label = "LOADED: BTC" in cockpit_text
            
            burst_results.append({
                "index": i,
                "elapsed_ms": elapsed_ms,
                "path": shot_path,
                "has_btc_leak": has_btc_80k_in_spread,
                "cockpit_loaded": "LOADED: ETHUSDT" if "LOADED: ETHUSDT" in cockpit_text else "OTHER",
                "spread_snippet": spread_text[:120]
            })

            print(f"  [Shot {i}] +{elapsed_ms}ms -> Saved {os.path.basename(shot_path)} | BTC Leak: {has_btc_80k_in_spread} | Status: {burst_results[-1]['cockpit_loaded']}")
            
            if i < 5:
                page.wait_for_timeout(300)

        print("\n--- BURST TEST SUMMARY ---")
        any_glitch = False
        for res in burst_results:
            print(f"Shot {res['index']} (+{res['elapsed_ms']}ms): BTC 80k Leak={res['has_btc_leak']}, Snippet={res['spread_snippet']}")
            if res['has_btc_leak']:
                any_glitch = True

        if not any_glitch:
            print("\n[SUCCESS] ALL 5 RAPID 300ms SHOTS CONFIRMED ZERO PRICE/SPREAD GLITCH!")
        else:
            print("\n[FAILURE] GLITCH DETECTED IN BURST SEQUENCE!")

        browser.close()

if __name__ == "__main__":
    run_burst_test()
