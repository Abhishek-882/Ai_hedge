import asyncio
import os
from playwright.async_api import async_playwright

SCREENSHOT_DIR = r"c:\Users\Asus\Downloads\prj\funding-rate-bot\test_screenshots\autobot_and_positions_inspection"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 1080})
        page = await context.new_page()

        await page.goto("https://ai-hedge-1.onrender.com/login", wait_until="networkidle")
        await page.click('button:has-text("Fill Admin")')
        await page.click('button[type="submit"]')
        await page.wait_for_url("**/terminal**", timeout=30000)
        await page.wait_for_timeout(4000)

        autobot_el = page.locator('#auto-bot-panel-section')
        await autobot_el.scroll_into_view_if_needed()

        # Click Config dropdown button to expand
        config_btn = autobot_el.locator('button:has-text("Config")')
        if await config_btn.count() > 0:
            await config_btn.click()
            await page.wait_for_timeout(1000)
            path = os.path.join(SCREENSHOT_DIR, "05_config_drawer_with_timing_modes.png")
            await autobot_el.screenshot(path=path)
            print(f"Captured: {path}")

        # Activate the bot
        activate_btn = autobot_el.locator('button:has-text("ACTIVATE 24/7 AUTO-BOT")')
        if await activate_btn.count() > 0:
            await activate_btn.click()
            await page.wait_for_timeout(3000)
            path2 = os.path.join(SCREENSHOT_DIR, "06_bot_running_status.png")
            await autobot_el.screenshot(path=path2)
            print(f"Captured: {path2}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
