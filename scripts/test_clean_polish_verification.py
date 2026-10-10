import asyncio
import os
from playwright.async_api import async_playwright

SCREENSHOT_DIR = r"c:\Users\Asus\Downloads\prj\funding-rate-bot\test_screenshots\clean_polish_verification"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

async def run_tests():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 960})
        page = await context.new_page()

        print("[STEP 1] Navigating to Clean Landing Page https://ai-hedge-1.onrender.com/ ...")
        await page.goto("https://ai-hedge-1.onrender.com/", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(3000)

        # 1. Clean Hero (no 3D, no simulator, no fake claims)
        shot1 = os.path.join(SCREENSHOT_DIR, "01_landing_clean_hero.png")
        await page.screenshot(path=shot1, full_page=False)
        print(f"Captured: {shot1}")

        # 2. Opportunity Corridor Matrix
        corridor_heading = page.locator("text=Live Opportunity Corridor Matrix")
        if await corridor_heading.count() > 0:
            await corridor_heading.scroll_into_view_if_needed()
            await page.wait_for_timeout(800)
            shot2 = os.path.join(SCREENSHOT_DIR, "02_landing_opportunity_corridors.png")
            await page.screenshot(path=shot2, full_page=False)
            print(f"Captured: {shot2}")

        # 3. Bento Grid Infrastructure
        bento_heading = page.locator("text=Institutional Core Infrastructure")
        if await bento_heading.count() > 0:
            await bento_heading.scroll_into_view_if_needed()
            await page.wait_for_timeout(800)
            shot3 = os.path.join(SCREENSHOT_DIR, "03_landing_bento_infrastructure.png")
            await page.screenshot(path=shot3, full_page=False)
            print(f"Captured: {shot3}")

        # 4. Login as Admin and Navigate to Terminal
        print("[STEP 4] Logging in as Admin to inspect Terminal...")
        await page.goto("https://ai-hedge-1.onrender.com/login", wait_until="networkidle")
        await page.click('button:has-text("Fill Admin")')
        await page.click('button[type="submit"]')
        await page.wait_for_url("**/terminal**", timeout=30000)
        await page.wait_for_timeout(4000)

        # 5. Clean Terminal Header & Clean Telemetry HUD (no // COCKPIT, no fake RTT, no fake clock, no fake delta)
        shot4 = os.path.join(SCREENSHOT_DIR, "04_terminal_clean_header_and_telemetry.png")
        await page.screenshot(path=shot4, full_page=False)
        print(f"Captured: {shot4}")

        # 6. Order Execution Panel (renamed from Execution Cockpit)
        exec_panel = page.locator("text=ORDER EXECUTION PANEL")
        if await exec_panel.count() > 0:
            await exec_panel.scroll_into_view_if_needed()
            await page.wait_for_timeout(800)
            shot5 = os.path.join(SCREENSHOT_DIR, "05_order_execution_panel.png")
            await page.screenshot(path=shot5, full_page=False)
            print(f"Captured: {shot5}")

        # 7. Open Strategy Presets (.set) Modal
        print("[STEP 7] Opening Strategy Presets (.set) modal...")
        presets_btn = page.locator('button:has-text("Presets")')
        if await presets_btn.count() > 0:
            await presets_btn.first.click()
            await page.wait_for_timeout(1000)
            shot6 = os.path.join(SCREENSHOT_DIR, "06_strategy_presets_modal_sleek.png")
            await page.screenshot(path=shot6, full_page=False)
            print(f"Captured: {shot6}")
            # Close modal
            close_btn = page.locator('button:has-text("Close")')
            if await close_btn.count() > 0:
                await close_btn.first.click()
                await page.wait_for_timeout(500)

        # 8. History Page (verify Back to Terminal)
        print("[STEP 8] Navigating to History page...")
        await page.goto("https://ai-hedge-1.onrender.com/history", wait_until="networkidle")
        await page.wait_for_timeout(2000)
        shot7 = os.path.join(SCREENSHOT_DIR, "07_history_back_to_terminal.png")
        await page.screenshot(path=shot7, full_page=False)
        print(f"Captured: {shot7}")

        await browser.close()
        print("\n[SUCCESS] Clean verification screenshots captured successfully!")

if __name__ == "__main__":
    asyncio.run(run_tests())
