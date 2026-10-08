import os
import sys
import time

# Force UTF-8 on Windows stdout
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright

SCREENSHOT_DIR = r"c:\Users\Asus\Downloads\prj\funding-rate-bot\test_screenshots\perfect_exploration"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def test_exploration():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()

        print("[1] Navigating to login page...")
        page.goto("https://ai-hedge-1.onrender.com/login", wait_until="networkidle", timeout=60000)
        time.sleep(2)

        # Log in using Fill Admin button
        print("[2] Logging in as admin...")
        fill_admin_btn = page.locator("button:has-text('Fill Admin')")
        if fill_admin_btn.is_visible():
            fill_admin_btn.click()
            time.sleep(1)
            page.locator("button:has-text('Sign In to Terminal')").click()
            page.wait_for_url("**/terminal", timeout=20000)
            time.sleep(4)
        else:
            page.goto("https://ai-hedge-1.onrender.com/terminal", wait_until="networkidle", timeout=60000)
            time.sleep(4)

        # Verify we are on terminal
        print("[3] Arrived at terminal, capturing overview...")
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "01_terminal_overview.png"), full_page=False)
        print("[OK] Captured 01_terminal_overview.png")

        # Test Quick Explore Bar
        print("[4] Testing Quick Explore Bar (clicking SOL)...")
        sol_btn = page.locator("button:has-text('SOL')").first
        if sol_btn.is_visible():
            sol_btn.click()
            time.sleep(2)
            page.screenshot(path=os.path.join(SCREENSHOT_DIR, "02_quick_explore_sol_clicked.png"), full_page=False)
            print("[OK] Captured 02_quick_explore_sol_clicked.png")

        # Test Sizing Chips & 8H Harvest Calculator
        print("[5] Testing Sizing Chips ($100 notional) and 8H Harvest Calculator...")
        chip_100 = page.locator("button:has-text('$100')").first
        if chip_100.is_visible():
            chip_100.click()
            time.sleep(1)
        
        cockpit_el = page.locator("#execution-cockpit-section")
        if cockpit_el.is_visible():
            cockpit_el.screenshot(path=os.path.join(SCREENSHOT_DIR, "03_cockpit_harvest_calculator.png"))
            print("[OK] Captured 03_cockpit_harvest_calculator.png")

        # Test Spread Tracker Corridor Needle
        print("[6] Capturing Spread Tracker Corridor Needle...")
        tracker_el = page.locator("text=CROSS-EXCHANGE FUNDING SPREAD").locator("..").locator("..")
        if tracker_el.is_visible():
            tracker_el.screenshot(path=os.path.join(SCREENSHOT_DIR, "04_spread_tracker_corridor.png"))
            print("[OK] Captured 04_spread_tracker_corridor.png")

        # Test All Coins Scanner Row Click-to-Load
        print("[7] Scrolling to Scanner and testing row click...")
        scanner_el = page.locator("text=ALL COINS FUNDING ARBITRAGE SCANNER").locator("..").locator("..")
        if scanner_el.is_visible():
            scanner_el.scroll_into_view_if_needed()
            time.sleep(2)
            page.screenshot(path=os.path.join(SCREENSHOT_DIR, "05_all_coins_scanner.png"), full_page=False)
            print("[OK] Captured 05_all_coins_scanner.png")

            # Test search filter
            search_input = page.locator("input[placeholder*='Search coin']")
            if search_input.is_visible():
                search_input.fill("DOGE")
                time.sleep(1)
                page.screenshot(path=os.path.join(SCREENSHOT_DIR, "06_search_doge_filtered.png"), full_page=False)
                print("[OK] Captured 06_search_doge_filtered.png")

                # Click row
                doge_row = page.locator("tr:has-text('DOGE')").first
                if doge_row.is_visible():
                    doge_row.click()
                    time.sleep(2)
                    # Scroll up to Cockpit to show DOGE loaded with harvest preview
                    cockpit_el = page.locator("#execution-cockpit-section")
                    if cockpit_el.is_visible():
                        cockpit_el.scroll_into_view_if_needed()
                        time.sleep(1)
                        cockpit_el.screenshot(path=os.path.join(SCREENSHOT_DIR, "07_doge_row_loaded.png"))
                        print("[OK] Captured 07_doge_row_loaded.png")

        print("[8] Test sequence complete. Closing browser.")
        browser.close()

if __name__ == "__main__":
    test_exploration()
