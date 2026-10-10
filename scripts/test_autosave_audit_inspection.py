import asyncio
import os
from playwright.async_api import async_playwright

SCREENSHOT_DIR = r"c:\Users\Asus\Downloads\prj\funding-rate-bot\test_screenshots\autosave_audit_verification"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 1080})
        page = await context.new_page()

        print("Navigating to login page...")
        await page.goto("https://ai-hedge-1.onrender.com/login", wait_until="networkidle")

        fill_admin_btn = page.locator('button:has-text("Fill Admin")')
        if await fill_admin_btn.count() > 0:
            await fill_admin_btn.click()
        await page.click('button[type="submit"]')

        print("Waiting for terminal to load...")
        await page.wait_for_url("**/terminal**", timeout=30000)
        await page.wait_for_timeout(5000)

        # Scroll to Auto Bot Panel
        autobot_el = page.locator('#auto-bot-panel-section')
        await autobot_el.scroll_into_view_if_needed()
        await page.wait_for_timeout(2000)

        path1 = os.path.join(SCREENSHOT_DIR, "01_autobot_panel_with_autosave_badge.png")
        await autobot_el.screenshot(path=path1)
        print(f"Captured: {path1}")

        # Check the audit stream section specifically
        audit_stream_el = autobot_el.locator('div:has-text("24/7 AUTONOMOUS BOT AUDIT STREAM")').first
        if await audit_stream_el.count() > 0:
            path2 = os.path.join(SCREENSHOT_DIR, "02_audit_stream_autosaved.png")
            await audit_stream_el.screenshot(path=path2)
            print(f"Captured: {path2}")

        await browser.close()
        print("Inspection completed successfully!")

if __name__ == "__main__":
    asyncio.run(main())
