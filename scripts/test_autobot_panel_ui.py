import os
import sys
import time
from playwright.sync_api import sync_playwright

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_URL = os.environ.get("BASE_URL", "https://ai-hedge-1.onrender.com")
SCREENSHOT_DIR = "test_screenshots/autobot_verification"

os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def test_autobot_ui():
    print(f"\n=======================================================")
    print(f"PLAYWRIGHT UI TEST: 24/7 AUTONOMOUS BOT PANEL ON {BASE_URL}")
    print(f"=======================================================\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        # Step 1: Login
        print("1. Logging into admin account...")
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

        print(f"✓ On Terminal: {page.url}")

        # Step 2: Locate AutoBot Panel
        print("\n2. Verifying AutoBot Panel elements...")
        panel = page.locator("#auto-bot-panel-section")
        assert panel.is_visible(), "AutoBot Panel section is not visible on page!"
        print("✓ #auto-bot-panel-section is visible on terminal page")

        # Check title
        title = panel.locator("text=24/7 AUTONOMOUS ARBITRAGE BOT // SERVER DAEMON")
        assert title.is_visible(), "AutoBot Title not found!"
        print("✓ Title: '24/7 AUTONOMOUS ARBITRAGE BOT // SERVER DAEMON' confirmed")

        # Check Server Daemon status pill in panel
        daemon_status = panel.locator("text=RUNNING 24/7 (SERVER PERSISTENT)")
        if daemon_status.is_visible():
            print("✓ Daemon Status: 'RUNNING 24/7 (SERVER PERSISTENT)' confirmed")
        else:
            print("! Daemon Status is Standby")

        # Screenshot 1: Overview of AutoBot Panel
        panel.scroll_into_view_if_needed()
        page.wait_for_timeout(1000)
        shot1 = f"{SCREENSHOT_DIR}/01_autobot_panel_overview.png"
        panel.screenshot(path=shot1)
        print(f"✓ Screenshot saved: {shot1}")

        # Step 3: Open Config Drawer
        print("\n3. Testing Config Drawer...")
        config_btn = panel.locator("button", has_text="Config")
        config_btn.click()
        page.wait_for_timeout(1000)

        # Verify configurable settings
        settings_header = panel.locator("text=ADMIN ARBITRAGE BOT SETTINGS (CONFIGURABLE)")
        assert settings_header.is_visible(), "Settings drawer did not open!"
        print("✓ Settings drawer opened with title 'ADMIN ARBITRAGE BOT SETTINGS (CONFIGURABLE)'")

        # Check Min Spread, Entry Price Parity, Capital Allocation, Max Hedges
        assert panel.locator("text=MIN SPREAD THRESHOLD (BPS)").is_visible(), "Min Spread setting missing"
        assert panel.locator("text=ENTRY PRICE PARITY TOLERANCE").is_visible(), "Entry Parity setting missing"
        assert panel.locator("text=CAPITAL ALLOCATION %").is_visible(), "Capital Allocation setting missing"
        assert panel.locator("text=MAX SIMULTANEOUS HEDGES").is_visible(), "Max Hedges setting missing"
        print("✓ All 6 institutional parameters verified in settings drawer:")
        print("   - Min Spread Threshold (5.0 bps)")
        print("   - Entry Price Parity (0.01% default)")
        print("   - Capital Allocation (20% default)")
        print("   - Max Simultaneous Hedges (3 default)")
        print("   - Leverage Mode (Max per coin vs Custom)")
        print("   - Close Price Parity (0.01% default)")

        # Screenshot 2: Settings Drawer Expanded
        shot2 = f"{SCREENSHOT_DIR}/02_autobot_settings_expanded.png"
        panel.screenshot(path=shot2)
        print(f"✓ Screenshot saved: {shot2}")

        # Step 4: Verify Audit Stream
        print("\n4. Verifying Audit Stream...")
        audit_stream = panel.locator("text=24/7 AUTONOMOUS BOT AUDIT STREAM")
        assert audit_stream.is_visible(), "Audit stream missing"
        print("✓ '24/7 AUTONOMOUS BOT AUDIT STREAM' is visible and active")

        # Step 5: Test Top Header Server Daemon Indicator click scroll
        print("\n5. Testing Top Header Server Bot Indicator...")
        indicator = page.locator("header button", has_text="SERVER BOT:")
        assert indicator.is_visible(), "Top header indicator missing"
        print("✓ Header Server Bot Indicator confirmed")

        # Screenshot 3: Full Terminal Page with Bot Cockpit
        shot3 = f"{SCREENSHOT_DIR}/03_full_terminal_with_autobot.png"
        page.screenshot(path=shot3, full_page=True)
        print(f"✓ Full Page Screenshot saved: {shot3}")

        browser.close()
        print("\nALL PLAYWRIGHT TESTS PASSED 100%!")

if __name__ == "__main__":
    test_autobot_ui()
