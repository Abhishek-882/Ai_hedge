import asyncio
import os
from playwright.async_api import async_playwright

SCREENSHOT_DIR = r"c:\Users\Asus\Downloads\prj\funding-rate-bot\test_screenshots\autobot_and_positions_inspection"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 1080})
        page = await context.new_page()

        print("Navigating to login page...")
        await page.goto("https://ai-hedge-1.onrender.com/login", wait_until="networkidle")

        # Click 1-Click "Fill Admin" button
        fill_admin_btn = page.locator('button:has-text("Fill Admin")')
        if await fill_admin_btn.count() > 0:
            await fill_admin_btn.click()
            print("Clicked Fill Admin button")
        else:
            await page.fill('input[placeholder*="name@fund.com"]', "varsha633@gmailcom")
            await page.fill('input[type="password"]', "99129838aA@")

        await page.wait_for_timeout(500)
        await page.click('button[type="submit"]')

        print("Waiting for terminal to load...")
        await page.wait_for_url("**/terminal**", timeout=30000)
        await page.wait_for_timeout(6000)

        # 1. Capture Full Terminal
        path1 = os.path.join(SCREENSHOT_DIR, "01_terminal_overview.png")
        await page.screenshot(path=path1, full_page=True)
        print(f"Captured: {path1}")

        # 2. Capture Auto Bot Panel
        autobot_el = page.locator('#auto-bot-panel-section')
        if await autobot_el.count() > 0:
            await autobot_el.scroll_into_view_if_needed()
            await page.wait_for_timeout(1000)
            path2 = os.path.join(SCREENSHOT_DIR, "02_autobot_panel.png")
            await autobot_el.screenshot(path=path2)
            print(f"Captured: {path2}")

            # Open settings drawer
            settings_btn = autobot_el.locator('button:has-text("SETTINGS")')
            if await settings_btn.count() > 0:
                await settings_btn.click()
                await page.wait_for_timeout(1000)
                path3 = os.path.join(SCREENSHOT_DIR, "03_autobot_settings_expanded.png")
                await autobot_el.screenshot(path=path3)
                print(f"Captured: {path3}")

        # 3. Capture Positions Table
        positions_el = page.locator('div:has-text("LIVE OPEN POSITIONS")').first
        if await positions_el.count() > 0:
            await positions_el.scroll_into_view_if_needed()
            await page.wait_for_timeout(1000)
            path4 = os.path.join(SCREENSHOT_DIR, "04_positions_table.png")
            await positions_el.screenshot(path=path4)
            print(f"Captured: {path4}")

        await browser.close()
        print("Inspection completed successfully!")

if __name__ == "__main__":
    asyncio.run(main())
