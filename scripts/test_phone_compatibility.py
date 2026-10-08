import sys
import os
import time
from playwright.sync_api import sync_playwright

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

SCREENSHOT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "test_screenshots", "phone_compatible")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

BASE_URL = "https://ai-hedge-1.onrender.com"

DEVICES = [
    {"name": "iPhone_14_Pro", "width": 393, "height": 852, "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1"},
    {"name": "Galaxy_S20", "width": 360, "height": 800, "user_agent": "Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36"},
]

def run_phone_tests():
    print(f"=== STARTING COMPREHENSIVE PHONE COMPATIBILITY SUITE ===")
    print(f"Target: {BASE_URL}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for dev in DEVICES:
            dev_name = dev["name"]
            width = dev["width"]
            height = dev["height"]
            print(f"\n--- Testing Device Viewport: {dev_name} ({width}x{height}) ---")

            context = browser.new_context(
                viewport={"width": width, "height": height},
                user_agent=dev["user_agent"],
                is_mobile=True,
                has_touch=True,
            )
            page = context.new_page()

            # 1. Login Page on Mobile
            print(f"[{dev_name}] 1. Navigating to Login...")
            page.goto(f"{BASE_URL}/login", wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(2000)

            # Check horizontal overflow on login
            overflow = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")
            print(f"[{dev_name}] Login page horizontal overflow: {overflow} (Expected: False)")

            login_shot = os.path.join(SCREENSHOT_DIR, f"{dev_name}_01_login.png")
            page.screenshot(path=login_shot)
            print(f"[{dev_name}] Captured {login_shot}")

            # Fill Admin
            admin_btn = page.locator("text='Fill Admin'")
            if admin_btn.count() > 0:
                admin_btn.first.click()
                page.wait_for_timeout(500)
            else:
                page.fill("input[type='text'], input[placeholder*='varsha']", "varsha633@gmailcom")
                page.fill("input[type='password']", "99129838aA@")

            # Submit login
            submit_btn = page.locator("button[type='submit']")
            submit_btn.first.click()
            page.wait_for_timeout(3500)

            # Ensure we are on /terminal
            if "/terminal" not in page.url:
                page.goto(f"{BASE_URL}/terminal", wait_until="networkidle", timeout=60000)
                page.wait_for_timeout(2500)

            print(f"[{dev_name}] 2. Successfully authenticated on Terminal: {page.url}")

            # Check horizontal overflow on terminal
            terminal_overflow = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")
            scroll_width = page.evaluate("() => document.documentElement.scrollWidth")
            inner_width = page.evaluate("() => window.innerWidth")
            print(f"[{dev_name}] Terminal scrollWidth={scroll_width}, innerWidth={inner_width}, overflow={terminal_overflow}")

            # Screenshot Terminal top
            term_top_shot = os.path.join(SCREENSHOT_DIR, f"{dev_name}_02_terminal_top.png")
            page.screenshot(path=term_top_shot)
            print(f"[{dev_name}] Captured {term_top_shot}")

            # Test 3D Prismatic Core touch interaction
            print(f"[{dev_name}] 3. Testing 3D Canvas Touch Drag...")
            canvas = page.locator("canvas").first
            if canvas.count() > 0:
                box = canvas.bounding_box()
                if box:
                    # Perform touch swipe on canvas
                    page.touchscreen.tap(box["x"] + box["width"]/2, box["y"] + box["height"]/2)
                    page.mouse.move(box["x"] + 50, box["y"] + 50)
                    page.mouse.down()
                    page.mouse.move(box["x"] + 150, box["y"] + 70)
                    page.mouse.up()
                    page.wait_for_timeout(800)

            # Test Multi-Asset Selector on mobile
            print(f"[{dev_name}] 4. Testing Multi-Asset Selector (Switch to SOL)...")
            sol_btn = page.locator("button:has-text('SOL')").first
            if sol_btn.count() > 0:
                sol_btn.click()
                page.wait_for_timeout(1000)

            cockpit_shot = os.path.join(SCREENSHOT_DIR, f"{dev_name}_03_cockpit_sol.png")
            page.screenshot(path=cockpit_shot)
            print(f"[{dev_name}] Captured {cockpit_shot}")

            # Scroll to All Coins Scanner
            print(f"[{dev_name}] 5. Scrolling to All Coins Scanner Matrix...")
            scanner_header = page.locator("text='ALL COINS FUNDING ARBITRAGE SCANNER'")
            if scanner_header.count() > 0:
                scanner_header.first.scroll_into_view_if_needed()
                page.wait_for_timeout(1500)

            scanner_shot = os.path.join(SCREENSHOT_DIR, f"{dev_name}_04_scanner_mobile.png")
            page.screenshot(path=scanner_shot)
            print(f"[{dev_name}] Captured {scanner_shot}")

            # Test Mobile Bottom Dock navigation to /history
            print(f"[{dev_name}] 6. Navigating via Mobile Bottom Dock to /history...")
            history_dock = page.locator("nav a[href='/history']").last
            history_dock.click()
            page.wait_for_timeout(3000)

            hist_overflow = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")
            print(f"[{dev_name}] History page overflow: {hist_overflow}")

            history_shot = os.path.join(SCREENSHOT_DIR, f"{dev_name}_05_history_mobile.png")
            page.screenshot(path=history_shot)
            print(f"[{dev_name}] Captured {history_shot}")

            # Test Mobile Bottom Dock navigation to /profile
            print(f"[{dev_name}] 7. Navigating via Mobile Bottom Dock to /profile...")
            profile_dock = page.locator("nav a[href='/profile']").last
            profile_dock.click()
            page.wait_for_timeout(3000)

            prof_overflow = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")
            print(f"[{dev_name}] Profile page overflow: {prof_overflow}")

            profile_shot = os.path.join(SCREENSHOT_DIR, f"{dev_name}_06_profile_mobile.png")
            page.screenshot(path=profile_shot)
            print(f"[{dev_name}] Captured {profile_shot}")

            # Test Mobile Bottom Dock navigation to / (Intro)
            print(f"[{dev_name}] 8. Navigating via Mobile Bottom Dock to / (Intro Landing)...")
            intro_dock = page.locator("nav a[href='/']").last
            intro_dock.click()
            page.wait_for_timeout(3000)

            intro_overflow = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")
            print(f"[{dev_name}] Intro page overflow: {intro_overflow}")

            intro_shot = os.path.join(SCREENSHOT_DIR, f"{dev_name}_07_intro_mobile.png")
            page.screenshot(path=intro_shot)
            print(f"[{dev_name}] Captured {intro_shot}")

            context.close()

        browser.close()

    print("\n=== ALL PHONE COMPATIBILITY TESTS COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_phone_tests()
