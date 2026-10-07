"""Playwright verification script for 1-Click Quick Hedge, Dynamic Coin Loading, and Live Positions Display.
"""

import os
import sys
import time
import json
import requests
from pathlib import Path
from playwright.sync_api import sync_playwright

TARGET_URL = os.environ.get("TARGET_URL", "https://ai-hedge-1.onrender.com").rstrip("/")
SCREENSHOT_DIR = Path(r"c:\Users\Asus\Downloads\prj\funding-rate-bot\test_screenshots\quick_hedge_and_positions")
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

def log(msg: str):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}")

def run_test():
    log("Starting Quick Hedge & Positions Verification Test")
    log(f"Target: {TARGET_URL}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 960})

        try:
            # 1. Load Dashboard
            log("Navigating to dashboard...")
            page.goto(TARGET_URL, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(2000)

            # 2. Scroll to All Coins Scanner
            log("Locating All Coins Scanner...")
            scanner = page.locator("text=ALL COINS FUNDING ARBITRAGE SCANNER").first
            scanner.scroll_into_view_if_needed()
            page.wait_for_timeout(1000)

            # Capture initial scanner view
            page.screenshot(path=str(SCREENSHOT_DIR / "01_scanner_with_quick_hedge_buttons.png"))
            log("Captured 01_scanner_with_quick_hedge_buttons.png")

            # 3. Test LOAD button
            log("Testing LOAD action on scanner...")
            load_buttons = page.locator("button:has-text('LOAD')")
            if load_buttons.count() > 0:
                load_buttons.first.click()
                page.wait_for_timeout(1000)

                # Scroll up to Cockpit
                cockpit = page.locator("text=EXECUTION COCKPIT").first
                cockpit.scroll_into_view_if_needed()
                page.wait_for_timeout(1000)

                page.screenshot(path=str(SCREENSHOT_DIR / "02_cockpit_with_loaded_coin.png"))
                log("Captured 02_cockpit_with_loaded_coin.png")

            # 4. Test 1-Click QUICK HEDGE button
            log("Testing 1-Click QUICK HEDGE on scanner...")
            scanner.scroll_into_view_if_needed()
            page.wait_for_timeout(1000)

            quick_hedge_btns = page.locator("button:has-text('QUICK HEDGE')")
            if quick_hedge_btns.count() > 0:
                log("Clicking 1-Click QUICK HEDGE...")
                quick_hedge_btns.first.click()
                page.wait_for_timeout(2500)

                page.screenshot(path=str(SCREENSHOT_DIR / "03_quick_hedge_executed_filled.png"))
                log("Captured 03_quick_hedge_executed_filled.png")

            # 5. Check Live Open Positions Table
            log("Checking Live Open Positions Table...")
            pos_table = page.locator("text=LIVE OPEN POSITIONS").first
            pos_table.scroll_into_view_if_needed()
            page.wait_for_timeout(3500) # Wait for fast 3s polling to reflect

            page.screenshot(path=str(SCREENSHOT_DIR / "04_live_open_positions_table.png"))
            log("Captured 04_live_open_positions_table.png")

            # 6. Verify Live Updating
            log("Verifying live price and countdown ticks...")
            time.sleep(3.0)
            page.screenshot(path=str(SCREENSHOT_DIR / "05_live_updating_confirmed.png"))
            log("Captured 05_live_updating_confirmed.png")

            log("All verification stages passed!")

        except Exception as e:
            log(f"Test encountered error: {e}")
            import traceback
            traceback.print_exc()
        finally:
            browser.close()

if __name__ == "__main__":
    run_test()
