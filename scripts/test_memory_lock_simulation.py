import asyncio
import os
from playwright.async_api import async_playwright

SCREENSHOT_DIR = r"c:\Users\Asus\Downloads\prj\funding-rate-bot\test_screenshots\memory_lock_inspection"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 1100})
        page = await context.new_page()

        print("1. Navigating to login...")
        await page.goto("https://ai-hedge-1.onrender.com/login", wait_until="networkidle")

        fill_admin_btn = page.locator('button:has-text("Fill Admin")')
        if await fill_admin_btn.count() > 0:
            await fill_admin_btn.click()
        await page.click('button[type="submit"]')

        print("2. Waiting for terminal...")
        await page.wait_for_url("**/terminal**", timeout=30000)
        await page.wait_for_timeout(3000)

        autobot_el = page.locator('#auto-bot-panel-section')
        await autobot_el.scroll_into_view_if_needed()
        await page.wait_for_timeout(2000)

        # 1. Test manual coin lock: Lock XRPUSDT
        lock_input = autobot_el.locator('input[placeholder*="SYMBOL"]')
        if await lock_input.count() > 0:
            print("Entering XRPUSDT into manual lock input...")
            await lock_input.fill("XRPUSDT")
            await page.click('button:has-text("+ LOCK COIN")')
            await page.wait_for_timeout(2000)

        # Also lock ADAUSDT
        if await lock_input.count() > 0:
            print("Entering ADAUSDT into manual lock input...")
            await lock_input.fill("ADAUSDT")
            await page.click('button:has-text("+ LOCK COIN")')
            await page.wait_for_timeout(2000)

        # Screenshot with locked coins pills
        path1 = os.path.join(SCREENSHOT_DIR, "01_memory_lock_with_locked_coins.png")
        await autobot_el.screenshot(path=path1)
        print(f"Captured: {path1}")

        # 2. Click FORCE RESET BOT MEMORY
        reset_btn = autobot_el.locator('button:has-text("FORCE RESET BOT MEMORY")')
        if await reset_btn.count() > 0:
            print("Clicking FORCE RESET BOT MEMORY...")
            await reset_btn.click()
            await page.wait_for_timeout(2500)

            # Screenshot after reset
            path2 = os.path.join(SCREENSHOT_DIR, "02_memory_lock_after_force_reset.png")
            await autobot_el.screenshot(path=path2)
            print(f"Captured: {path2}")

        await browser.close()
        print("Memory lock simulation complete!")

if __name__ == "__main__":
    asyncio.run(main())
