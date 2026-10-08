import sys
import os
import time
from playwright.sync_api import sync_playwright

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

SCREENSHOT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "test_screenshots", "safety_and_price_divergence")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

BASE_URL = "https://ai-hedge-1.onrender.com"

def run_test():
    print("=== STARTING SAFETY, PRICE DIVERGENCE & UI HARDENING TEST ===")
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

        print(f"2. Successfully on Terminal: {page.url}")

        # 2. Inspect Top-Left Clean Two-Row Status Header
        print("3. Capturing Clean Two-Row Status Header...")
        header_el = page.locator("header").first
        header_shot = os.path.join(SCREENSHOT_DIR, "01_clean_two_row_header.png")
        header_el.screenshot(path=header_shot)
        print(f"[✓] Captured {header_shot}")

        # 3. Inspect SpreadTracker with Live Price Divergence
        print("4. Capturing Live Price Divergence in SpreadTracker...")
        spread_header = page.locator("h2:has-text('CROSS-EXCHANGE FUNDING SPREAD')").first
        spread_card = spread_header.locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]")
        spread_card.scroll_into_view_if_needed()
        page.wait_for_timeout(1500)
        spread_shot = os.path.join(SCREENSHOT_DIR, "02_live_price_divergence_tracker.png")
        spread_card.screenshot(path=spread_shot)
        print(f"[✓] Captured {spread_shot}")

        # 4. Inspect Execution Cockpit: Dynamic Leverage Engine
        print("5. Testing Dynamic Leverage Engine...")
        cockpit_el = page.locator("#execution-cockpit-section").first
        cockpit_el.scroll_into_view_if_needed()
        page.wait_for_timeout(1000)

        btn_10x = page.locator("button:has-text('10x')").first
        if btn_10x.count() > 0:
            btn_10x.click()
            page.wait_for_timeout(500)
        btn_max = page.locator("button:has-text('MAX LEV')").first
        if btn_max.count() > 0:
            btn_max.click()
            page.wait_for_timeout(500)

        lev_shot = os.path.join(SCREENSHOT_DIR, "03_dynamic_leverage_engine.png")
        cockpit_el.screenshot(path=lev_shot)
        print(f"[✓] Captured {lev_shot}")

        # 5. Inspect Auto-Wait Basis Sniper Controls
        print("6. Testing Auto-Wait Basis Sniper controls & presets...")
        preset_tight = page.locator("button:has-text('Tight 0.10%')").first
        if preset_tight.count() > 0:
            preset_tight.click()
            page.wait_for_timeout(500)

        sniper_shot = os.path.join(SCREENSHOT_DIR, "04_auto_wait_sniper_controls.png")
        cockpit_el.screenshot(path=sniper_shot)
        print(f"[✓] Captured {sniper_shot}")

        # 6. Inspect Dedicated Emergency Risk Controls & Kill Switch Arming
        print("7. Testing Kill Switch Safety Arming Checkbox...")
        emergency_header = page.locator("span:has-text('EMERGENCY RISK CONTROLS')").first
        emergency_panel = emergency_header.locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]")
        emergency_panel.scroll_into_view_if_needed()
        page.wait_for_timeout(1000)

        locked_btn = page.locator("button:has-text('KILL SWITCH (LOCKED)')")
        print(f"[*] Kill switch disabled by default: {locked_btn.is_disabled()}")

        checkbox = page.locator("input[type='checkbox']").first
        checkbox.check()
        page.wait_for_timeout(1000)

        unlocked_btn = page.locator("button:has-text('EXECUTE KILL SWITCH')")
        print(f"[*] Kill switch enabled after arming: {unlocked_btn.is_enabled()}")

        emergency_shot = os.path.join(SCREENSHOT_DIR, "05_kill_switch_armed_safety.png")
        emergency_panel.screenshot(path=emergency_shot)
        print(f"[✓] Captured {emergency_shot}")

        # 7. Full page overview
        page.wait_for_timeout(1000)
        full_shot = os.path.join(SCREENSHOT_DIR, "06_terminal_full_overview.png")
        page.screenshot(path=full_shot, full_page=True)
        print(f"[✓] Captured {full_shot}")

        print(f"Total alert popups: {len(alerts)} (Target: 0)")
        assert len(alerts) == 0, f"Unexpected alert popups: {alerts}"

        browser.close()
        print("=== TEST COMPLETED SUCCESSFULLY WITH 0 ERRORS ===")

if __name__ == "__main__":
    run_test()
