import sys
import os
import time
from playwright.sync_api import sync_playwright

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

SCREENSHOT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "test_screenshots", "visualizer_animation")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

BASE_URL = "https://ai-hedge-1.onrender.com"

def verify_visualizer():
    print("=== STARTING ARBITRAGE BASIS VISUALIZER VERIFICATION ===")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # 1. Desktop Test (1280x800)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        print("1. Logging into Terminal...")
        page.goto(f"{BASE_URL}/login", wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(2000)

        # Fill Admin and Submit
        fill_btn = page.locator("button:has-text('Fill Admin')")
        if fill_btn.count() > 0:
            fill_btn.first.click()
            page.wait_for_timeout(500)
        page.click("button[type='submit']")
        page.wait_for_timeout(3500)

        if "/terminal" not in page.url:
            page.goto(f"{BASE_URL}/terminal", wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(3000)

        print(f"2. On Terminal: {page.url}")

        # Locate Visualizer
        vis_header = page.locator("text='ARBITRAGE BASIS VISUALIZER'").first
        if vis_header.count() > 0:
            vis_header.scroll_into_view_if_needed()
            page.wait_for_timeout(1000)

        # Capture Mode 1: Spread Wave
        shot1 = os.path.join(SCREENSHOT_DIR, "01_desktop_mode_spread_wave.png")
        page.screenshot(path=shot1)
        print(f"Captured {shot1}")

        # Switch to Mode 2: Order Flow
        print("3. Switching to Order Flow Bridge mode...")
        order_flow_btn = page.locator("button:has-text('Order Flow')").first
        if order_flow_btn.count() > 0:
            order_flow_btn.click()
            page.wait_for_timeout(1500)

        shot2 = os.path.join(SCREENSHOT_DIR, "02_desktop_mode_order_flow.png")
        page.screenshot(path=shot2)
        print(f"Captured {shot2}")

        # Switch to Mode 3: 8H Radar
        print("4. Switching to 8H Settlement Radar mode...")
        radar_btn = page.locator("button:has-text('8H Radar')").first
        if radar_btn.count() > 0:
            radar_btn.click()
            page.wait_for_timeout(1500)

        shot3 = os.path.join(SCREENSHOT_DIR, "03_desktop_mode_8h_radar.png")
        page.screenshot(path=shot3)
        print(f"Captured {shot3}")

        # 5. Check Mobile (393x852)
        print("5. Testing on Mobile Viewport (iPhone 14 Pro)...")
        mobile_ctx = browser.new_context(viewport={"width": 393, "height": 852}, is_mobile=True, has_touch=True)
        mobile_page = mobile_ctx.new_page()

        mobile_page.goto(f"{BASE_URL}/login", wait_until="networkidle", timeout=60000)
        mobile_page.wait_for_timeout(1000)
        mobile_fill = mobile_page.locator("button:has-text('Fill Admin')")
        if mobile_fill.count() > 0:
            mobile_fill.first.click()
            mobile_page.wait_for_timeout(500)
        mobile_page.click("button[type='submit']")
        mobile_page.wait_for_timeout(3500)

        if "/terminal" not in mobile_page.url:
            mobile_page.goto(f"{BASE_URL}/terminal", wait_until="networkidle", timeout=60000)
            mobile_page.wait_for_timeout(3000)

        shot4 = os.path.join(SCREENSHOT_DIR, "04_mobile_terminal_visualizer.png")
        mobile_page.screenshot(path=shot4)
        print(f"Captured {shot4}")

        # Also capture Intro page
        print("6. Testing on Intro Landing page...")
        page.goto(f"{BASE_URL}/", wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(2500)

        intro_vis = page.locator("text='Real-Time Arbitrage Basis Visualizer'").first
        if intro_vis.count() > 0:
            intro_vis.scroll_into_view_if_needed()
            page.wait_for_timeout(1000)

        shot5 = os.path.join(SCREENSHOT_DIR, "05_intro_page_visualizer.png")
        page.screenshot(path=shot5)
        print(f"Captured {shot5}")

        browser.close()

    print("=== ARBITRAGE BASIS VISUALIZER VERIFICATION COMPLETED ===")

if __name__ == "__main__":
    verify_visualizer()
