import asyncio
import os
import time
from playwright.async_api import async_playwright

SCREENSHOT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "test_screenshots", "pnl_spread_calibration")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

TARGET_URL = "https://ai-hedge-1.onrender.com/"

async def run_verification():
    print("=== Starting PnL, Spread & ETHUSDT Live Telemetry Verification ===")
    print(f"Target URL: {TARGET_URL}")
    print(f"Screenshots directory: {SCREENSHOT_DIR}")

    alerts_encountered = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        page.on("dialog", lambda dialog: (
            alerts_encountered.append(dialog.message),
            print(f"[ALERT DETECTED]: {dialog.message}"),
            asyncio.create_task(dialog.dismiss())
        ))

        # 1. Load Homepage
        print("[1] Loading live platform...")
        await page.goto(TARGET_URL, wait_until="networkidle", timeout=60000)
        await asyncio.sleep(4)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "01_initial_page_loaded.png"), full_page=False)
        print("  [OK] Initial page loaded and captured")

        # 2. Inspect Header Stats (Binance Wallet, Bitget Equity, Net Unrealized PnL)
        print("[2] Inspecting Net Unrealized PnL stability over 8 seconds...")
        pnl_readings = []
        for i in range(5):
            try:
                net_pnl_elem = page.locator("text=NET UNREALIZED PnL").locator("xpath=..")
                text = await net_pnl_elem.inner_text()
                pnl_readings.append(text.replace("\n", " "))
            except Exception as e:
                pnl_readings.append(f"Error: {e}")
            await asyncio.sleep(1.5)

        print(f"  PnL Telemetry samples: {pnl_readings}")
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "02_net_unrealized_pnl_stability.png"), full_page=False)

        # 3. Inspect SpreadTracker default (BTCUSDT)
        print("[3] Inspecting SpreadTracker and TelemetryHUD...")
        spread_box = page.locator("text=CROSS-EXCHANGE FUNDING SPREAD").locator("xpath=../..")
        await spread_box.scroll_into_view_if_needed()
        await asyncio.sleep(1)
        spread_text = await spread_box.inner_text()
        print(f"  BTC Spread Tracker content:\n{spread_text}")
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "03_spread_tracker_default.png"))

        # 4. Select ETH in Execution Cockpit
        print("[4] Selecting ETH in Execution Cockpit...")
        cockpit = page.locator("#execution-cockpit-section")
        await cockpit.scroll_into_view_if_needed()
        eth_asset_btn = cockpit.locator("button:has-text('ETH')").first
        await eth_asset_btn.click()
        await asyncio.sleep(3)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "04_cockpit_eth_selected.png"))
        print("  [OK] ETH selected in Execution Cockpit")

        # 5. Inspect SpreadTracker updated to ETHUSDT
        print("[5] Verifying SpreadTracker calibrated for ETHUSDT...")
        await spread_box.scroll_into_view_if_needed()
        await asyncio.sleep(2)
        eth_spread_text = await spread_box.inner_text()
        print(f"  ETH Spread Tracker content:\n{eth_spread_text}")
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "05_eth_spread_tracker_live.png"))

        # 6. Scroll to All Coins Scanner and filter by ETH
        print("[6] Testing Scanner search and LOAD on ETH...")
        scanner = page.locator("text=ALL COINS FUNDING ARBITRAGE SCANNER").locator("xpath=../..")
        await scanner.scroll_into_view_if_needed()
        search_input = scanner.locator("input[placeholder*='Search coin']").first
        if await search_input.count() > 0:
            await search_input.fill("ETH")
            await asyncio.sleep(2)
            await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "06_scanner_filtered_eth.png"))

            # Click LOAD on filtered row
            scanner_table = scanner.locator("table")
            eth_row = scanner_table.locator("tbody tr", has_text="ETH").first
            if await eth_row.count() > 0:
                load_btn = eth_row.locator("button:has-text('LOAD')").first
                if await load_btn.count() > 0:
                    await load_btn.click()
                    await asyncio.sleep(2)
                    print("  [OK] Scanner LOAD clicked for ETH")
                    await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "07_eth_loaded_from_scanner.png"))

        # 7. Inspect Live Open Positions Table
        print("[7] Inspecting Live Open Positions table...")
        pos_section = page.locator("text=LIVE OPEN POSITIONS").locator("xpath=../..")
        await pos_section.scroll_into_view_if_needed()
        await asyncio.sleep(2)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "08_live_open_positions.png"))
        pos_text = await pos_section.inner_text()
        print(f"  Positions table summary (first 300 chars): {pos_text[:300].replace(chr(10), ' ')}")

        # 8. Final verification report
        print("\n=== Verification Summary ===")
        print(f"Alerts encountered: {len(alerts_encountered)} (Expected: 0)")
        if alerts_encountered:
            print(f"  Alert messages: {alerts_encountered}")
        else:
            print("  [OK] ZERO browser alerts confirmed")
        print(f"All screenshots saved to: {SCREENSHOT_DIR}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run_verification())
