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
OUTPUT_DIR = "test_screenshots/world_class_ui_inspection"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def inspect_ui():
    print(f"\n=======================================================")
    print(f"CAPTURING SCREENSHOTS FOR WORLD-CLASS UI INSPECTION")
    print(f"=======================================================\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 950})
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
        page.wait_for_timeout(2000)

        # Shot 1: Navbar & Header Bar
        print("\n2. Capturing Navbar & Top Header Bar...")
        navbar = page.locator("nav")
        shot1 = f"{OUTPUT_DIR}/01_navbar_and_header.png"
        page.screenshot(path=shot1, clip={"x": 0, "y": 0, "width": 1440, "height": 220})
        print(f"✓ Captured: {shot1}")

        # Shot 2: Telemetry HUD
        print("\n3. Capturing Elevated Telemetry HUD...")
        hud = page.locator("div.grid-cols-2.md\\:grid-cols-4").first
        hud.scroll_into_view_if_needed()
        page.wait_for_timeout(500)
        shot2 = f"{OUTPUT_DIR}/02_telemetry_hud.png"
        hud.screenshot(path=shot2)
        print(f"✓ Captured: {shot2}")

        # Shot 3: Spread Tracker & Opportunity Corridor
        print("\n4. Capturing Spread Tracker & Opportunity Corridor...")
        spread_tracker = page.locator("text=CROSS-EXCHANGE FUNDING SPREAD").locator("xpath=ancestor::div[contains(@class, 'rounded-2xl')][1]")
        spread_tracker.scroll_into_view_if_needed()
        page.wait_for_timeout(500)
        shot3 = f"{OUTPUT_DIR}/03_spread_tracker_corridor.png"
        spread_tracker.screenshot(path=shot3)
        print(f"✓ Captured: {shot3}")

        # Shot 4: AutoBot Panel with Opportunity Radar
        print("\n5. Capturing AutoBot Panel with Live Radar...")
        autobot_panel = page.locator("#auto-bot-panel-section")
        autobot_panel.scroll_into_view_if_needed()
        page.wait_for_timeout(500)
        shot4 = f"{OUTPUT_DIR}/04_autobot_panel_with_radar.png"
        autobot_panel.screenshot(path=shot4)
        print(f"✓ Captured: {shot4}")

        # Shot 5: AutoBot Config Drawer Expanded
        print("\n6. Opening AutoBot Config Drawer & Capturing...")
        config_btn = autobot_panel.locator("button", has_text="Config")
        config_btn.click()
        page.wait_for_timeout(1000)
        shot5 = f"{OUTPUT_DIR}/05_autobot_config_drawer.png"
        autobot_panel.screenshot(path=shot5)
        print(f"✓ Captured: {shot5}")

        # Shot 6: Execution Cockpit Tactile Sizing & Split
        print("\n7. Capturing Execution Cockpit Sizing Chips...")
        cockpit = page.locator("#execution-cockpit-section")
        cockpit.scroll_into_view_if_needed()
        page.wait_for_timeout(500)
        shot6 = f"{OUTPUT_DIR}/06_cockpit_tactile_sizing.png"
        cockpit.screenshot(path=shot6)
        print(f"✓ Captured: {shot6}")

        # Shot 7: Full Page Overview
        print("\n8. Capturing Full Page Overview...")
        shot7 = f"{OUTPUT_DIR}/07_full_terminal_world_class.png"
        page.screenshot(path=shot7, full_page=True)
        print(f"✓ Captured: {shot7}")

        browser.close()
        print("\nALL SCREENSHOTS CAPTURED AND READY FOR INSPECTION!")

if __name__ == "__main__":
    inspect_ui()
