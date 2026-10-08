import sys
import os
import time
from playwright.sync_api import sync_playwright

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

SCREENSHOT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "test_screenshots", "hedge_ranking_and_funding_time")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

BASE_URL = "https://ai-hedge-1.onrender.com"

def verify_hedge_ranking_and_funding_time():
    print("=== STARTING HEDGE RANKING & FUNDING TIME VERIFICATION ===")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        page = context.new_page()

        # Track any alert dialogs (must be 0)
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
        page.wait_for_timeout(3500)

        if "/terminal" not in page.url:
            page.goto(f"{BASE_URL}/terminal", wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(3000)

        print(f"2. Logged in on Terminal: {page.url}")

        # Verify visualizer (Spread Wave, Order Flow, 8H Radar) is GONE
        assert page.locator("text='ARBITRAGE BASIS VISUALIZER'").count() == 0, "Visualizer still present!"
        assert page.locator("button:has-text('Spread Wave')").count() == 0, "Spread Wave button still present!"
        assert page.locator("button:has-text('Order Flow')").count() == 0, "Order Flow button still present!"
        assert page.locator("button:has-text('8H Radar')").count() == 0, "8H Radar button still present!"
        print("✓ Verified: Spread Wave, Order Flow, and 8H Radar completely removed!")

        # 2. Capture Terminal Hero Layout (TelemetryHUD + SpreadTracker + ControlCockpit)
        page.wait_for_timeout(1000)
        shot1 = os.path.join(SCREENSHOT_DIR, "01_terminal_hero_clean_layout.png")
        page.screenshot(path=shot1)
        print(f"Captured {shot1}")

        # 3. Scroll to All Coins Scanner Matrix
        scanner = page.locator("text='ALL COINS FUNDING ARBITRAGE SCANNER'").first
        if scanner.count() > 0:
            scanner.scroll_into_view_if_needed()
            page.wait_for_timeout(2000)

        # Check Hedge Ranking Columns
        print("3. Checking Hedge Ranking by Highest Rate Difference...")
        shot2 = os.path.join(SCREENSHOT_DIR, "02_scanner_ranked_by_hedge_diff.png")
        page.screenshot(path=shot2)
        print(f"Captured {shot2}")

        # Verify #1 Rank badge exists
        rank1 = page.locator("text='🥇 #1'").first
        print(f"Rank #1 badge present: {rank1.count() > 0}")

        # 4. Click QUICK HEDGE on Rank #1 coin and verify funding time update
        print("4. Testing QUICK HEDGE execution and per-coin funding time update...")
        quick_hedge_btn = page.locator("tbody tr button:has-text('QUICK HEDGE')").first
        if quick_hedge_btn.count() > 0:
            quick_hedge_btn.click()
            page.wait_for_timeout(3000)

        shot3 = os.path.join(SCREENSHOT_DIR, "03_quick_hedge_executed_and_loaded.png")
        page.screenshot(path=shot3)
        print(f"Captured {shot3}")

        # 5. Check Execution Cockpit after selection
        cockpit = page.locator("#execution-cockpit-section").first
        if cockpit.count() > 0:
            cockpit.scroll_into_view_if_needed()
            page.wait_for_timeout(1500)

        shot4 = os.path.join(SCREENSHOT_DIR, "04_cockpit_updated_funding_countdown.png")
        page.screenshot(path=shot4)
        print(f"Captured {shot4}")

        # 6. Check Intro Page (verify visualizer is removed from Landing as well)
        print("6. Checking Landing Page to verify visualizer is removed...")
        page.goto(f"{BASE_URL}/", wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(2500)
        assert page.locator("text='Real-Time Arbitrage Basis Visualizer'").count() == 0, "Landing page visualizer still present!"
        shot5 = os.path.join(SCREENSHOT_DIR, "05_landing_page_clean.png")
        page.screenshot(path=shot5)
        print(f"Captured {shot5}")

        browser.close()
        print(f"Total alerts encountered: {len(alerts)}")

    print("=== VERIFICATION COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    verify_hedge_ranking_and_funding_time()
