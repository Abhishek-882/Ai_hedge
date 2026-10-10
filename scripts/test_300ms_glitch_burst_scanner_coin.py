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

def run_scanner_burst_test():
    print("=== STARTING SCANNER COIN SELECTION 5 RAPID SCREENSHOTS (300ms GAP) ===")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 950})
        page = context.new_page()

        # Login as Admin
        page.goto(f"{BASE_URL}/login", wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(1500)
        fill_btn = page.locator("button:has-text('Fill Admin')")
        if fill_btn.count() > 0:
            fill_btn.first.click()
            page.wait_for_timeout(500)
        page.click("button[type='submit']")
        page.wait_for_timeout(4000)

        if "/terminal" not in page.url:
            page.goto(f"{BASE_URL}/terminal", wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(3000)

        # Scroll to Scanner
        scanner_card = page.locator("h2:has-text('ALL COINS FUNDING ARBITRAGE SCANNER')").first.locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]")
        scanner_card.scroll_into_view_if_needed()
        page.wait_for_timeout(2000)

        # Find row 1 or row 2 LOAD button
        load_btns = scanner_card.locator("button:has-text('LOAD')")
        assert load_btns.count() > 0, "No LOAD buttons found in scanner"
        
        target_load = load_btns.first
        row = target_load.locator("xpath=ancestor::tr")
        target_sym = row.locator("td").nth(1).inner_text().replace("\n", " ").strip()
        print(f"Targeting ranked scanner coin: {target_sym}")

        # Click LOAD
        target_load.click()
        t_start = time.time()

        cockpit_header = page.locator("h2:has-text('EXECUTION COCKPIT')").first
        cockpit_card = cockpit_header.locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]")
        spread_header = page.locator("h2:has-text('CROSS-EXCHANGE FUNDING SPREAD')").first
        spread_card = spread_header.locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]")

        burst_results = []
        for i in range(1, 6):
            shot_path = os.path.join(BURST_DIR, f"scanner_coin_shot_{i}_300ms_gap.png")
            page.screenshot(path=shot_path)
            
            elapsed_ms = int((time.time() - t_start) * 1000)
            spread_text = spread_card.inner_text().replace("\n", " | ")
            cockpit_text = cockpit_card.inner_text().replace("\n", " | ")

            has_btc_80k_leak = "80," in spread_text or "81," in spread_text or "86,400" in spread_text
            
            burst_results.append({
                "index": i,
                "elapsed_ms": elapsed_ms,
                "path": shot_path,
                "has_btc_leak": has_btc_80k_leak,
                "spread_snippet": spread_text[:120]
            })

            print(f"  [Scanner Shot {i}] +{elapsed_ms}ms -> Saved {os.path.basename(shot_path)} | BTC Leak: {has_btc_80k_leak}")
            
            if i < 5:
                page.wait_for_timeout(300)

        print("\n--- SCANNER COIN BURST SUMMARY ---")
        any_glitch = False
        for res in burst_results:
            print(f"Shot {res['index']} (+{res['elapsed_ms']}ms): BTC Leak={res['has_btc_leak']}, Text={res['spread_snippet']}")
            if res['has_btc_leak']:
                any_glitch = True

        if not any_glitch:
            print(f"\n[SUCCESS] ALL 5 RAPID 300ms SHOTS FOR {target_sym} CONFIRMED ZERO PRICE/SPREAD GLITCH!")
        else:
            print(f"\n[FAILURE] GLITCH DETECTED IN SCANNER COIN BURST SEQUENCE!")

        browser.close()

if __name__ == "__main__":
    run_scanner_burst_test()
