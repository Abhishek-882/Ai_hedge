import os
import time
from playwright.sync_api import sync_playwright

SCREENSHOT_DIR = r"c:\Users\Asus\Downloads\prj\funding-rate-bot\test_screenshots\elite_ui_upgrade"
BASE_URL = "https://ai-hedge-1.onrender.com"

os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def run():
    print(f"Starting Elite UI/UX and Motion Playwright manual verification on {BASE_URL}...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        # ---------------------------------------------------------
        # 1. LANDING PAGE & CASH FLOW SIMULATOR
        # ---------------------------------------------------------
        print("\n[Step 1] Visiting Landing Page (/)...\n")
        page.goto(BASE_URL, wait_until="networkidle", timeout=60000)
        time.sleep(2)

        # Click $25k capital button
        btn_25k = page.locator("button:has-text('$25k')").first
        if btn_25k.is_visible():
            btn_25k.click()
            time.sleep(0.5)

        # Click 35 bps spread button
        btn_35bps = page.locator("button:has-text('35 bps')").first
        if btn_35bps.is_visible():
            btn_35bps.click()
            time.sleep(0.5)

        screenshot_path_1 = os.path.join(SCREENSHOT_DIR, "01_landing_3d_and_cash_flow_simulator.png")
        page.screenshot(path=screenshot_path_1, full_page=True)
        print(f"  Saved: {screenshot_path_1}")

        # ---------------------------------------------------------
        # 2. AUTHENTICATE VIA LOGIN PAGE FIRST
        # ---------------------------------------------------------
        print("\n[Step 2] Visiting /login and authenticating as Admin...\n")
        page.goto(f"{BASE_URL}/login", wait_until="networkidle", timeout=60000)
        time.sleep(2)

        fill_admin_btn = page.locator("button:has-text('Fill Admin')").first
        if fill_admin_btn.is_visible():
            fill_admin_btn.click()
            time.sleep(1)
            print("  Autofilled Admin credentials.")

        screenshot_path_4 = os.path.join(SCREENSHOT_DIR, "04_login_cyber_vault.png")
        page.screenshot(path=screenshot_path_4, full_page=True)
        print(f"  Saved: {screenshot_path_4}")

        # Submit Login
        submit_btn = page.locator("button[type='submit']:has-text('Sign In to Terminal')").first
        if submit_btn.is_visible():
            submit_btn.click()
            print("  Submitted Admin login form. Waiting for session and redirect...")
            page.wait_for_url("**/terminal", timeout=15000)
            time.sleep(4)
        else:
            print("  Submit button not found!")

        # ---------------------------------------------------------
        # 3. TRADING COCKPIT (/terminal) WITH ACTIVE SESSION
        # ---------------------------------------------------------
        print("\n[Step 3] Verifying Trading Cockpit (/terminal) with active session...\n")
        page.goto(f"{BASE_URL}/terminal", wait_until="networkidle", timeout=60000)
        time.sleep(5)

        # Check Opportunity Corridor Meter
        corridor = page.locator("text=ARBITRAGE OPPORTUNITY CORRIDOR").first
        print(f"  Opportunity Corridor Meter visible: {corridor.is_visible()}")

        # Check Quick Notional Sizing Chips
        chip_50 = page.locator("button:has-text('$50')").first
        print(f"  $50 Quick Notional Chip visible: {chip_50.is_visible()}")
        if chip_50.is_visible():
            chip_50.click()
            time.sleep(1)
            print("  Clicked $50 Quick Notional Chip in Cockpit.")

        screenshot_path_2 = os.path.join(SCREENSHOT_DIR, "02_terminal_corridor_meter_and_sizing_chips.png")
        page.screenshot(path=screenshot_path_2, full_page=True)
        print(f"  Saved: {screenshot_path_2}")

        # ---------------------------------------------------------
        # 4. AUDIT LEDGER & HISTORY (/history) WITH ACTIVE SESSION
        # ---------------------------------------------------------
        print("\n[Step 4] Verifying Audit Ledger (/history) with active session...\n")
        page.goto(f"{BASE_URL}/history", wait_until="networkidle", timeout=60000)
        time.sleep(3)

        # Check KPI summary cards
        kpi_notional = page.locator("text=Total Traded Notional").first
        print(f"  Total Traded Notional KPI tile visible: {kpi_notional.is_visible()}")

        # Check Filter Chips
        filter_all = page.locator("button:has-text('All Hedges')").first
        print(f"  Filter Chips visible: {filter_all.is_visible()}")
        if filter_all.is_visible():
            filter_all.click()
            time.sleep(1)

        screenshot_path_3 = os.path.join(SCREENSHOT_DIR, "03_history_kpi_tiles_and_filters.png")
        page.screenshot(path=screenshot_path_3, full_page=True)
        print(f"  Saved: {screenshot_path_3}")

        # ---------------------------------------------------------
        # 5. PROFILE & FOOTER ATTRIBUTION (/profile)
        # ---------------------------------------------------------
        print("\n[Step 5] Visiting Profile (/profile)...\n")
        page.goto(f"{BASE_URL}/profile", wait_until="networkidle", timeout=60000)
        time.sleep(2)

        dev_attr = page.locator("text=Developer: Abhishek").first
        company_attr = page.locator("text=Company: MMT").first
        print(f"  Developer Attribution visible: {dev_attr.is_visible()}")
        print(f"  Company Attribution visible: {company_attr.is_visible()}")

        screenshot_path_5 = os.path.join(SCREENSHOT_DIR, "05_profile_and_footer_attribution.png")
        page.screenshot(path=screenshot_path_5, full_page=True)
        print(f"  Saved: {screenshot_path_5}")

        browser.close()
        print("\nAll authenticated verification screenshots captured successfully!\n")

if __name__ == "__main__":
    run()
