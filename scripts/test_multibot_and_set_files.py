import asyncio
import os
from playwright.async_api import async_playwright

SCREENSHOT_DIR = r"c:\Users\Asus\Downloads\prj\funding-rate-bot\test_screenshots\multibot_setfiles_verification"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 1100})
        page = await context.new_page()

        print("1. Navigating to login page...")
        await page.goto("https://ai-hedge-1.onrender.com/login", wait_until="networkidle")

        fill_admin_btn = page.locator('button:has-text("Fill Admin")')
        if await fill_admin_btn.count() > 0:
            await fill_admin_btn.click()
        await page.click('button[type="submit"]')

        print("2. Waiting for terminal to load...")
        await page.wait_for_url("**/terminal**", timeout=30000)
        await page.wait_for_timeout(4000)

        # Scroll to Auto Bot Panel
        autobot_el = page.locator('#auto-bot-panel-section')
        await autobot_el.scroll_into_view_if_needed()
        await page.wait_for_timeout(2000)

        # 1. Screenshot initial state with multi-bot tabs and active bot
        path1 = os.path.join(SCREENSHOT_DIR, "01_initial_multibot_cockpit.png")
        await autobot_el.screenshot(path=path1)
        print(f"Captured: {path1}")

        # 2. Open NEW BOT modal
        new_bot_btn = autobot_el.locator('button:has-text("NEW BOT")')
        if await new_bot_btn.count() > 0:
            print("Clicking NEW BOT button...")
            await new_bot_btn.click()
            await page.wait_for_timeout(1000)

            # Screenshot modal
            path2 = os.path.join(SCREENSHOT_DIR, "02_new_bot_modal.png")
            await page.screenshot(path=path2)
            print(f"Captured: {path2}")

            # Fill new bot details
            name_input = page.locator('input[placeholder*="Continuous High-Yield Hunter"]')
            if await name_input.count() > 0:
                await name_input.fill("Continuous High-Yield Hunter")
            
            # Select preset if available
            modal_form = page.locator('div:has-text("CREATE NEW TRADING BOT") form')
            modal_select = modal_form.locator('select')
            if await modal_select.count() > 0:
                await modal_select.select_option("aggressive_continuous_arbitrage.set")

            # Click Create Bot
            create_submit = page.locator('button:has-text("Create Bot")')
            if await create_submit.count() > 0:
                await create_submit.click()
                print("Created second bot...")
                await page.wait_for_timeout(3000)

        # 3. Screenshot with 2 bots in tab bar
        path3 = os.path.join(SCREENSHOT_DIR, "03_two_bots_in_cockpit.png")
        await autobot_el.screenshot(path=path3)
        print(f"Captured: {path3}")

        # 4. Open PRESETS LIBRARY modal
        presets_btn = autobot_el.locator('button:has-text("Presets")')
        if await presets_btn.count() > 0:
            print("Opening Presets modal...")
            await presets_btn.click()
            await page.wait_for_timeout(1000)

            path4 = os.path.join(SCREENSHOT_DIR, "04_presets_library_modal.png")
            await page.screenshot(path=path4)
            print(f"Captured: {path4}")

            close_btn = page.locator('div:has-text("METATRADER STRATEGY SET FILES") button:has-text("Close")')
            if await close_btn.count() > 0:
                await close_btn.click()
                await page.wait_for_timeout(1000)

        # 5. Open SAVE .SET modal
        save_set_btn = autobot_el.locator('button:has-text("Save .set")')
        if await save_set_btn.count() > 0:
            print("Opening Save .set modal...")
            await save_set_btn.click()
            await page.wait_for_timeout(1000)

            path5 = os.path.join(SCREENSHOT_DIR, "05_save_set_modal.png")
            await page.screenshot(path=path5)
            print(f"Captured: {path5}")

            cancel_btn = page.locator('div:has-text("SAVE STRATEGY SET FILE") button:has-text("Cancel")')
            if await cancel_btn.count() > 0:
                await cancel_btn.click()
                await page.wait_for_timeout(1000)

        # 6. Full overview of the AutoBot Cockpit
        path6 = os.path.join(SCREENSHOT_DIR, "06_full_cockpit_verification.png")
        await autobot_el.screenshot(path=path6)
        print(f"Captured: {path6}")

        await browser.close()
        print("All test verification steps executed successfully!")

if __name__ == "__main__":
    asyncio.run(main())
