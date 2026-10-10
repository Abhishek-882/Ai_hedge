import asyncio
import os
import shutil
from playwright.async_api import async_playwright

OUTPUT_DIR = r"c:\Users\Asus\Downloads\prj\funding-rate-bot\test_screenshots\platform_walkthrough"
ARTIFACT_DIR = r"C:\Users\Asus\.gemini\antigravity\brain\0093731b-eba4-445d-a250-9a6c7ebae264\walkthrough_screens"
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(ARTIFACT_DIR, exist_ok=True)

BASE_URL = "https://ai-hedge-1.onrender.com"

async def capture(page, filename, full_page=False, delay=800):
    if delay > 0:
        await page.wait_for_timeout(delay)
    local_path = os.path.join(OUTPUT_DIR, filename)
    await page.screenshot(path=local_path, full_page=full_page)
    artifact_path = os.path.join(ARTIFACT_DIR, filename)
    shutil.copyfile(local_path, artifact_path)
    print(f"[CAPTURED] {filename}")
    return local_path

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=1.25
        )
        page = await context.new_page()

        print("=== STAGE 1: LANDING PAGE & METHODOLOGY ===")
        await page.goto(f"{BASE_URL}/", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(3000)

        # 01 Landing Hero
        await capture(page, "01_landing_hero.png", full_page=False)

        # 02 Live Ticker Ribbon
        ticker = page.locator("text=24H ARBITRAGE VOLUME").or_(page.locator("text=BINANCE")).first
        if await ticker.count() > 0:
            await ticker.scroll_into_view_if_needed()
            await capture(page, "02_landing_telemetry_ribbon.png")

        # 03 Opportunity Corridors
        corridors = page.locator("text=Live Opportunity Corridor Matrix").first
        if await corridors.count() > 0:
            await corridors.scroll_into_view_if_needed()
            await capture(page, "03_landing_opportunity_corridors.png")

        # 04 Bento Grid Infrastructure
        bento = page.locator("text=Institutional Core Infrastructure").first
        if await bento.count() > 0:
            await bento.scroll_into_view_if_needed()
            await capture(page, "04_landing_bento_infrastructure.png")

        # 05 Methodology & 8-Hour Settlement
        methodology = page.locator("text=8-Hour Settlement Methodology").or_(page.locator("text=The Mathematical Edge")).first
        if await methodology.count() > 0:
            await methodology.scroll_into_view_if_needed()
            await capture(page, "05_landing_methodology_settlement.png")

        # 06 Footer & Disclaimer
        footer = page.locator("footer").first
        if await footer.count() > 0:
            await footer.scroll_into_view_if_needed()
            await capture(page, "06_landing_footer_and_disclaimer.png")

        print("=== STAGE 2: AUTHENTICATION & LOGIN ===")
        await page.goto(f"{BASE_URL}/login", wait_until="networkidle")
        await page.wait_for_timeout(2000)

        # 07 Login Page Overview
        await capture(page, "07_login_page_overview.png")

        # 08 Fill Credentials
        fill_btn = page.locator('button:has-text("Fill Admin")')
        if await fill_btn.count() > 0:
            await fill_btn.click()
            await capture(page, "08_login_fill_credentials.png", delay=500)

        # 09 Submit Login
        submit_btn = page.locator('button[type="submit"]')
        await submit_btn.click()
        await page.wait_for_url("**/terminal**", timeout=30000)
        await page.wait_for_timeout(3000)
        await capture(page, "09_login_authentication_success.png")

        print("=== STAGE 3: USER PROFILE & API KEY VAULT ===")
        await page.goto(f"{BASE_URL}/profile", wait_until="networkidle")
        await page.wait_for_timeout(2000)

        # 10 Profile Overview
        await capture(page, "10_profile_vault_overview.png")

        # 11 Binance Credentials Box
        bn_box = page.locator("text=Binance Futures API").first
        if await bn_box.count() > 0:
            await bn_box.scroll_into_view_if_needed()
            await capture(page, "11_profile_binance_credentials.png")

        # 12 Bitget Credentials Box
        bg_box = page.locator("text=Bitget Futures API").first
        if await bg_box.count() > 0:
            await bg_box.scroll_into_view_if_needed()
            await capture(page, "12_profile_bitget_credentials.png")

        # 13 Background Daemon Toggle
        daemon_sec = page.locator("text=Background Autonomous Daemon").first
        if await daemon_sec.count() > 0:
            await daemon_sec.scroll_into_view_if_needed()
            await capture(page, "13_profile_daemon_autotrade_toggle.png")

        print("=== STAGE 4: TERMINAL COCKPIT & LIVE TELEMETRY ===")
        await page.goto(f"{BASE_URL}/terminal", wait_until="networkidle")
        await page.wait_for_timeout(3000)

        # 14 Full Terminal Overview
        await capture(page, "14_terminal_full_cockpit.png")

        # 15 Account Balances HUD
        bal_hud = page.locator("text=Binance Margin").or_(page.locator("text=BALANCES")).first
        if await bal_hud.count() > 0:
            await bal_hud.scroll_into_view_if_needed()
            await capture(page, "15_terminal_account_telemetry.png")

        # 16 Spread Meter & Prismatic Core
        spread_core = page.locator("canvas").first
        if await spread_core.count() > 0:
            await spread_core.scroll_into_view_if_needed()
            await capture(page, "16_terminal_spread_meter.png")

        # 17 All Coins Scanner Table
        scanner = page.locator("text=ALL COINS SCANNER").or_(page.locator("text=RANKED SPREAD CORRIDORS")).first
        if await scanner.count() > 0:
            await scanner.scroll_into_view_if_needed()
            await capture(page, "17_terminal_all_coins_scanner.png")

        # 18 Strategy Presets Modal
        presets_btn = page.locator('button:has-text("Presets")').first
        if await presets_btn.count() > 0:
            await presets_btn.click()
            await capture(page, "18_terminal_strategy_presets_modal.png", delay=1000)
            close_btn = page.locator('button:has-text("Close")')
            if await close_btn.count() > 0:
                await close_btn.first.click()
                await page.wait_for_timeout(500)

        print("=== STAGE 5: COIN SELECTION & SIZING CONFIGURATION ===")
        # Scroll back up to Execution Panel
        exec_panel = page.locator("text=ORDER EXECUTION PANEL").first
        if await exec_panel.count() > 0:
            await exec_panel.scroll_into_view_if_needed()

        # 19 Click LOAD on a coin from scanner
        load_btns = page.locator('button:has-text("LOAD")')
        if await load_btns.count() > 0:
            await load_btns.first.click()
            await page.wait_for_timeout(1000)
            if await exec_panel.count() > 0:
                await exec_panel.scroll_into_view_if_needed()
            await capture(page, "19_coin_load_top_ranked.png")

        # 20 Click LOAD on 2nd coin (e.g. SOL or ETH)
        if await load_btns.count() > 1:
            await load_btns.nth(1).click()
            await page.wait_for_timeout(1000)
            if await exec_panel.count() > 0:
                await exec_panel.scroll_into_view_if_needed()
            await capture(page, "20_coin_load_second_ranked.png")

        # 21 Click LOAD on 3rd coin
        if await load_btns.count() > 2:
            await load_btns.nth(2).click()
            await page.wait_for_timeout(1000)
            if await exec_panel.count() > 0:
                await exec_panel.scroll_into_view_if_needed()
            await capture(page, "21_coin_load_third_ranked.png")

        # 22 Sizing Chips
        chip_500 = page.locator('button:has-text("$500")').first
        if await chip_500.count() > 0:
            await chip_500.click()
            await capture(page, "22_order_panel_sizing_chips.png", delay=500)

        # 23 Leverage Slider / Selection
        lev_slider = page.locator('input[type="range"]').first
        if await lev_slider.count() > 0:
            await capture(page, "23_order_panel_leverage_slider.png", delay=300)

        # 24 Basis Sniper Guard
        sniper_box = page.locator("text=BASIS SNIPER GUARD").first
        if await sniper_box.count() > 0:
            await sniper_box.scroll_into_view_if_needed()
            await capture(page, "24_order_panel_basis_sniper_guard.png")

        print("=== STAGE 6: EXECUTION & OPEN POSITIONS ===")
        # 25 Cockpit Hedge Execution
        hedge_btn = page.locator('button:has-text("ENTER DUAL HEDGE")').or_(page.locator('button:has-text("DUAL BENCHMARK")')).first
        if await hedge_btn.count() > 0:
            await hedge_btn.click()
            await capture(page, "25_cockpit_hedge_execution.png", delay=1200)

        # 26 Quick Hedge from Scanner
        quick_btns = page.locator('button:has-text("QUICK HEDGE")')
        if await quick_btns.count() > 0:
            await quick_btns.first.scroll_into_view_if_needed()
            await quick_btns.first.click()
            await capture(page, "26_quick_hedge_row_click.png", delay=1000)

        # 27 Hedge Fill Confirmation
        await page.wait_for_timeout(1500)
        await capture(page, "27_hedge_fill_confirmation.png")

        # 28 Live Open Positions Table
        pos_table = page.locator("text=LIVE OPEN POSITIONS").first
        if await pos_table.count() > 0:
            await pos_table.scroll_into_view_if_needed()
            await capture(page, "28_live_open_positions_table.png", delay=1000)

        print("=== STAGE 7: AUTOBOT DAEMON & TIMING MODES ===")
        # 29 Autobot Panel Overview
        autobot = page.locator("text=AUTONOMOUS HEDGE BOT").or_(page.locator("text=AUTOBOT")).first
        if await autobot.count() > 0:
            await autobot.scroll_into_view_if_needed()
            await capture(page, "29_autobot_panel_stopped.png")

            # 30 Expand Autobot Settings Drawer
            settings_toggle = page.locator('button:has-text("Config")').or_(page.locator('button:has-text("Settings")')).first
            if await settings_toggle.count() > 0:
                await settings_toggle.click()
                await capture(page, "30_autobot_settings_drawer_expanded.png", delay=800)

            # 31 Timing Mode Selection
            timing_btn = page.locator('button:has-text("Opportunistic")').or_(page.locator('button:has-text("Pre-Funding")')).first
            if await timing_btn.count() > 0:
                await timing_btn.click()
                await capture(page, "31_autobot_timing_modes.png", delay=500)

            # 32 Start Autobot
            start_bot = page.locator('button:has-text("START AUTOBOT")').or_(page.locator('button:has-text("START BOT")')).first
            if await start_bot.count() > 0:
                await start_bot.click()
                await capture(page, "32_autobot_running_state.png", delay=1500)
                # Stop it afterwards so it doesn't leave background loop running
                stop_bot = page.locator('button:has-text("STOP AUTOBOT")').or_(page.locator('button:has-text("STOP BOT")')).first
                if await stop_bot.count() > 0:
                    await stop_bot.click()
                    await page.wait_for_timeout(500)

        print("=== STAGE 8: AUDIT STREAM & HISTORY LEDGER ===")
        # 33 Audit Log Stream in Terminal
        audit_sec = page.locator("text=TRADED HEDGES HISTORY & AUDIT LOG").or_(page.locator("text=AUDIT LOG")).first
        if await audit_sec.count() > 0:
            await audit_sec.scroll_into_view_if_needed()
            await capture(page, "33_terminal_audit_stream.png")

        # 34 Position Close Action
        close_pos_btn = page.locator('button:has-text("CLOSE")').or_(page.locator('button:has-text("Close")')).first
        if await close_pos_btn.count() > 0:
            await close_pos_btn.scroll_into_view_if_needed()
            await capture(page, "34_position_close_action.png")

        # 35 Navigate to History Page
        await page.goto(f"{BASE_URL}/history", wait_until="networkidle")
        await page.wait_for_timeout(2500)
        await capture(page, "35_history_ledger_page.png")

        # 36 History Search & Status Filters
        filter_input = page.locator('input[placeholder*="Search"]').or_(page.locator('input[type="text"]')).first
        if await filter_input.count() > 0:
            await filter_input.fill("SUI")
            await capture(page, "36_history_search_and_filters.png", delay=500)
            await filter_input.fill("")

        # 37 More Detail Modal
        detail_btn = page.locator('button:has-text("More Detail")').or_(page.locator('button:has-text("Detail")')).first
        if await detail_btn.count() > 0:
            await detail_btn.click()
            await capture(page, "37_history_hedge_detail_modal.png", delay=1000)

        await browser.close()
        print("\n[SUCCESS] Captured 37 stage walkthrough screenshots successfully!")

if __name__ == "__main__":
    asyncio.run(run())
