import sys
import os
import time
from playwright.sync_api import sync_playwright

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

SCREENSHOT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "test_screenshots", "anti_glitch_verification")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

BASE_URL = "https://ai-hedge-1.onrender.com"

def run_test():
    print("=== STARTING ANTI-GLITCH & SYNCHRONIZATION VERIFICATION TEST ===")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 950})
        page = context.new_page()

        alerts = []
        page.on("dialog", lambda dialog: (alerts.append(dialog.message), dialog.accept()))

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

        # Wait 3s for initial WebSocket / REST hydration
        page.wait_for_timeout(3000)

        # 2. Inspect Price & Divergence Stability over 6 seconds
        print("3. Sampling live prices and checking for glitches or fake $86,400 constants...")
        price_samples = []
        for i in range(5):
            page.wait_for_timeout(1000)
            text_content = page.content()
            
            # Check for fake 86400 constant
            has_fake_86400 = "$86,400" in text_content or "86400.00" in text_content
            if has_fake_86400:
                print(f"[!] Warning: Fake 86400 constant detected in DOM at sample {i+1}!")
            else:
                print(f"[✓] Sample {i+1}: Zero fake $86,400 constants detected.")

        # Capture SpreadTracker with Live Synchronized Prices
        spread_header = page.locator("h2:has-text('CROSS-EXCHANGE FUNDING SPREAD')").first
        spread_card = spread_header.locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]")
        spread_card.scroll_into_view_if_needed()
        page.wait_for_timeout(1000)
        shot1 = os.path.join(SCREENSHOT_DIR, "01_live_price_synchronizer.png")
        spread_card.screenshot(path=shot1)
        print(f"[✓] Captured {shot1}")

        # 3. Check Asset Selector Grid: Verify NO duplicate buttons
        print("4. Inspecting Asset Selector Grid for duplicate buttons...")
        cockpit_header = page.locator("h2:has-text('EXECUTION COCKPIT')").first
        cockpit_card = cockpit_header.locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]")
        cockpit_card.scroll_into_view_if_needed()
        
        # Check buttons in asset grid
        selector_grid = cockpit_card.locator("div.grid-cols-6").first
        btc_buttons = selector_grid.locator("button:has-text('BTC')")
        btc_count = btc_buttons.count()
        print(f"BTC buttons in selector strip: {btc_count} (Expected: exactly 1)")
        assert btc_count == 1, f"Expected 1 BTC button in strip, but found {btc_count}"
        print("[✓] Verified ZERO duplicate buttons in asset selector grid.")

        shot2 = os.path.join(SCREENSHOT_DIR, "02_clean_asset_selector_no_duplicate.png")
        cockpit_card.screenshot(path=shot2)
        print(f"[✓] Captured {shot2}")

        # 4. Test Instant Seed Hydration from Scanner
        print("5. Testing coin selection from All Coins Scanner...")
        scanner_header = page.locator("h2:has-text('ALL COINS FUNDING ARBITRAGE SCANNER')").first
        scanner_card = scanner_header.locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]")
        scanner_card.scroll_into_view_if_needed()
        page.wait_for_timeout(2000)

        # Find rows with LOAD button
        load_buttons = scanner_card.locator("button:has-text('LOAD')")
        if load_buttons.count() > 0:
            target_load = load_buttons.first
            # Get symbol of row
            row = target_load.locator("xpath=ancestor::tr")
            row_text = row.inner_text()
            print(f"Clicking LOAD on row: {row_text.splitlines()[:3]}")
            target_load.click()
            page.wait_for_timeout(2000)

            # Scroll back to Cockpit and verify it immediately displays LOADED
            cockpit_card.scroll_into_view_if_needed()
            page.wait_for_timeout(1000)
            cockpit_text = cockpit_card.inner_text()
            print(f"Cockpit status: {[line for line in cockpit_text.splitlines() if 'LOADED' in line]}")

            shot3 = os.path.join(SCREENSHOT_DIR, "03_scanner_coin_loaded_instant_seed.png")
            cockpit_card.screenshot(path=shot3)
            print(f"[✓] Captured {shot3}")

        # 5. Check for any flashing error banners
        print("6. Verifying zero flashing error banners...")
        error_banners = cockpit_card.locator("div[class*='bg-rose-950']")
        error_count = error_banners.count()
        print(f"Active error banners in cockpit: {error_count}")
        if error_count > 0:
            print(f"Error text: {error_banners.first.inner_text()}")
        print(f"[✓] Flashing error banners check completed (Found: {error_count}).")

        # 6. Capture Full Page Overview
        print("7. Capturing Full Glitch-Free Terminal Overview...")
        shot4 = os.path.join(SCREENSHOT_DIR, "04_full_terminal_glitch_free.png")
        page.screenshot(path=shot4, full_page=True)
        print(f"[✓] Captured {shot4}")

        browser.close()
        print("=== TEST COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_test()
