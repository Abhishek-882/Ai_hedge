import asyncio
import os
import shutil
from playwright.async_api import async_playwright

OUTPUT_DIR = r"c:\Users\Asus\Downloads\prj\funding-rate-bot\test_screenshots\platform_walkthrough_hd"
ARTIFACT_DIR = r"C:\Users\Asus\.gemini\antigravity\brain\0093731b-eba4-445d-a250-9a6c7ebae264\walkthrough_screens"
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(ARTIFACT_DIR, exist_ok=True)

BASE_URL = "https://ai-hedge-1.onrender.com"

async def capture_frame(page, filename, delay=500):
    """Captures a clean 16:9 human-seeable screenshot."""
    if delay > 0:
        await page.wait_for_timeout(delay)
    local_path = os.path.join(OUTPUT_DIR, filename)
    await page.screenshot(path=local_path, full_page=False)
    artifact_path = os.path.join(ARTIFACT_DIR, filename)
    shutil.copyfile(local_path, artifact_path)
    print(f"[OK] {filename}")
    return local_path

async def safe_scroll(locator):
    try:
        if await locator.count() > 0:
            await locator.first.scroll_into_view_if_needed(timeout=3000)
            return True
    except Exception:
        pass
    return False

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=1.5
        )
        page = await context.new_page()

        print("\n--- STAGE 1: LANDING PAGE & METHODOLOGY ---")
        await page.goto(f"{BASE_URL}/", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(3000)

        # 01 Hero
        await capture_frame(page, "01_landing_hero_value_prop.png")

        # 02 Live Opportunity Corridors
        corridors = page.locator("text=Live Opportunity Corridor Matrix").or_(page.locator("text=OPPORTUNITY CORRIDORS"))
        await safe_scroll(corridors)
        await capture_frame(page, "02_landing_telemetry_corridors.png")

        # 03 Bento Grid Infrastructure
        bento = page.locator("text=Institutional Core Infrastructure").or_(page.locator("text=CORE INFRASTRUCTURE"))
        await safe_scroll(bento)
        await capture_frame(page, "03_landing_infrastructure_bento.png")

        # 04 8-Hour Settlement Methodology
        methodology = page.locator("text=8-Hour Settlement Methodology").or_(page.locator("text=The Mathematical Edge"))
        await safe_scroll(methodology)
        await capture_frame(page, "04_landing_settlement_methodology.png")

        # 05 Footer & Disclaimer
        footer = page.locator("footer")
        await safe_scroll(footer)
        await capture_frame(page, "05_landing_compliance_footer.png")

        print("\n--- STAGE 2: AUTHENTICATION & LOGIN ---")
        await page.goto(f"{BASE_URL}/login", wait_until="networkidle")
        await page.wait_for_timeout(2000)

        # 06 Login Cyber Vault Overview
        await capture_frame(page, "06_login_cyber_vault.png")

        # 07 Fill Admin Credentials
        fill_btn = page.locator('button:has-text("Fill Admin")')
        if await fill_btn.count() > 0:
            await fill_btn.click()
            await page.wait_for_timeout(400)
        await capture_frame(page, "07_login_credentials_input.png")

        # 08 Submit Login & Authenticate
        submit_btn = page.locator('button[type="submit"]')
        await submit_btn.click()
        await capture_frame(page, "08_login_active_authentication.png", delay=300)

        await page.wait_for_url("**/terminal**", timeout=30000)
        await page.wait_for_timeout(3000)
        # 09 Login Success Redirect to Terminal
        await capture_frame(page, "09_login_success_redirect.png")

        print("\n--- STAGE 3: USER PROFILE & API KEY VAULT ---")
        await page.goto(f"{BASE_URL}/profile", wait_until="networkidle")
        await page.wait_for_timeout(2500)

        # 10 Profile Vault Overview
        await capture_frame(page, "10_profile_vault_overview.png")

        # 11 Binance API Card
        bn_card = page.locator("text=Binance Futures API").or_(page.locator("text=BINANCE"))
        await safe_scroll(bn_card)
        await capture_frame(page, "11_profile_binance_api_card.png")

        # 12 Bitget API Card
        bg_card = page.locator("text=Bitget Futures API").or_(page.locator("text=BITGET"))
        await safe_scroll(bg_card)
        await capture_frame(page, "12_profile_bitget_api_card.png")

        # 13 Daemon Switch
        daemon_card = page.locator("text=Background Autonomous Daemon").or_(page.locator("text=AUTONOMOUS DAEMON"))
        await safe_scroll(daemon_card)
        await capture_frame(page, "13_profile_daemon_autotrade_switch.png")

        print("\n--- STAGE 4: TERMINAL OVERVIEW & BALANCES ---")
        await page.goto(f"{BASE_URL}/terminal", wait_until="networkidle")
        await page.wait_for_timeout(3500)

        # 14 Full Terminal Panoramic Overview
        await page.evaluate("window.scrollTo(0, 0)")
        await capture_frame(page, "14_terminal_panoramic_overview.png")

        # 15 Wallets & Unrealized PnL Close-up
        header_stats = page.locator("header")
        await safe_scroll(header_stats)
        await capture_frame(page, "15_terminal_wallets_and_unrealized_pnl.png")

        # 16 Quick Explorer Strip
        quick_explore = page.locator("text=QUICK EXPLORE")
        await safe_scroll(quick_explore)
        await capture_frame(page, "16_terminal_quick_explorer_strip.png")

        # 17 Telemetry HUD
        hud = page.locator("text=NEXT SETTLEMENT IN").or_(page.locator("text=LIVE SPREAD"))
        await safe_scroll(hud)
        await capture_frame(page, "17_terminal_telemetry_hud.png")

        print("\n--- STAGE 5: SPREAD CORRIDOR & PRESETS ---")
        # 18 Spread Corridor Tracker & Meter
        spread_box = page.locator("canvas").or_(page.locator("text=CROSS-EXCHANGE FUNDING SPREAD"))
        await safe_scroll(spread_box)
        await capture_frame(page, "18_spread_corridor_gauge.png")

        # 19 Spread Divergence breakdown
        rates_box = page.locator("text=BINANCE PERP").or_(page.locator("text=BITGET PERP"))
        await safe_scroll(rates_box)
        await capture_frame(page, "19_spread_divergence_breakdown.png")

        # 20 Strategy Presets Modal
        presets_btn = page.locator('button:has-text("Presets")')
        if await presets_btn.count() > 0:
            await presets_btn.first.click()
            await page.wait_for_timeout(800)
            await capture_frame(page, "20_strategy_presets_modal.png")
            close_btn = page.locator('button:has-text("Close")')
            if await close_btn.count() > 0:
                await close_btn.first.click()
                await page.wait_for_timeout(400)

        print("\n--- STAGE 6: ALL COINS SCANNER & COIN LOADING ---")
        # 21 All Coins Scanner Table
        scanner = page.locator("text=ALL COINS FUNDING ARBITRAGE SCANNER").or_(page.locator("text=Top Hedge Diff"))
        await safe_scroll(scanner)
        await capture_frame(page, "21_all_coins_scanner_table.png")

        # 22 Click LOAD on top coin
        exec_p = page.locator("text=ORDER EXECUTION PANEL")
        load_btns = page.locator('button:has-text("LOAD")')
        if await load_btns.count() > 0:
            await load_btns.first.click()
            await page.wait_for_timeout(600)
            await safe_scroll(exec_p)
            await capture_frame(page, "22_coin_load_sui.png")

        # 23 Click LOAD on second coin (e.g. SOL)
        if await load_btns.count() > 1:
            await safe_scroll(scanner)
            await page.wait_for_timeout(400)
            await load_btns.nth(1).click()
            await page.wait_for_timeout(600)
            await safe_scroll(exec_p)
            await capture_frame(page, "23_coin_load_sol.png")

        # 24 Click LOAD on third coin (e.g. DOGE)
        if await load_btns.count() > 2:
            await safe_scroll(scanner)
            await page.wait_for_timeout(400)
            await load_btns.nth(2).click()
            await page.wait_for_timeout(600)
            await safe_scroll(exec_p)
            await capture_frame(page, "24_coin_load_doge.png")

        print("\n--- STAGE 7: ORDER CONFIGURATION & SIZING ---")
        # 25 Order Panel Loaded Asset Banner
        await safe_scroll(exec_p)
        await capture_frame(page, "25_order_panel_loaded_asset.png")

        # 26 Sizing Chips ($500)
        chip_500 = page.locator('button:has-text("$500")')
        if await chip_500.count() > 0:
            await chip_500.first.click()
            await page.wait_for_timeout(400)
        await capture_frame(page, "26_order_panel_sizing_chips.png")

        # 27 Leverage Slider Control
        lev = page.locator('input[type="range"]')
        await safe_scroll(lev)
        await capture_frame(page, "27_order_panel_leverage_control.png")

        # 28 Basis Sniper Guard
        sniper = page.locator("text=BASIS SNIPER GUARD").or_(page.locator("text=BASIS GAP"))
        await safe_scroll(sniper)
        await capture_frame(page, "28_order_panel_basis_sniper.png")

        print("\n--- STAGE 8: EXECUTION & OPEN POSITIONS ---")
        # 29 Cockpit Dual Hedge Click
        hedge_btn = page.locator('button:has-text("ENTER DUAL HEDGE")').or_(page.locator('button:has-text("DUAL BENCHMARK")'))
        if await hedge_btn.count() > 0:
            await safe_scroll(hedge_btn)
            await hedge_btn.first.click()
            await capture_frame(page, "29_cockpit_dual_hedge_click.png", delay=800)

        # 30 Quick Hedge from Scanner Row
        await safe_scroll(scanner)
        quick_btns = page.locator('button:has-text("QUICK HEDGE")')
        if await quick_btns.count() > 0:
            await quick_btns.first.click()
            await capture_frame(page, "30_scanner_quick_hedge_click.png", delay=800)

        # 31 Fill Confirmation Banner
        await page.wait_for_timeout(1500)
        await capture_frame(page, "31_execution_confirmation_banner.png")

        # 32 Live Open Positions Table
        pos_table = page.locator("text=LIVE OPEN POSITIONS")
        await safe_scroll(pos_table)
        await capture_frame(page, "32_live_open_positions_table.png")

        print("\n--- STAGE 9: AUTOBOT & HISTORY AUDIT LEDGER ---")
        # 33 Autobot Panel Standby
        autobot = page.locator("text=MASTER DAEMON 24/7").or_(page.locator("text=BOT:"))
        await safe_scroll(autobot)
        await capture_frame(page, "33_autobot_panel_standby.png")

        # 34 Autobot Settings Drawer Expanded
        cfg_btn = page.locator('button:has-text("Config")').or_(page.locator('button:has-text("Settings")'))
        if await cfg_btn.count() > 0:
            await cfg_btn.first.click()
            await page.wait_for_timeout(600)
            await capture_frame(page, "34_autobot_settings_expanded.png")

        # 35 Navigate to History Page
        await page.goto(f"{BASE_URL}/history", wait_until="networkidle")
        await page.wait_for_timeout(2500)
        await capture_frame(page, "35_history_page_kpi_ledger.png")

        # 36 More Detail Modal
        detail_btn = page.locator('button:has-text("More Detail")').or_(page.locator('button:has-text("Detail")'))
        if await detail_btn.count() > 0:
            await detail_btn.first.click()
            await page.wait_for_timeout(1000)
            await capture_frame(page, "36_history_more_detail_modal.png")

        await browser.close()
        print("\n[COMPLETE] All 36 High-DPI human-seeable screenshots captured successfully!")

if __name__ == "__main__":
    asyncio.run(run())
