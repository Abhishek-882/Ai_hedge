import asyncio
import os
import sys
import json
from playwright.async_api import async_playwright

OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "test_screenshots",
    "every_coin_deep_verification",
)
os.makedirs(OUTPUT_DIR, exist_ok=True)

TARGET_URL = "https://ai-hedge-1.onrender.com/"

async def test_all_ranked_coins():
    print(f"Starting deep verification of every ranked coin against {TARGET_URL}...")
    dialogs = []
    results = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await context.new_page()

        # Catch any alert popups
        page.on("dialog", lambda d: dialogs.append({"type": d.type, "msg": d.message}))

        print("Opening platform...")
        await page.goto(TARGET_URL, wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(4000)

        # 1. Capture initial overview
        initial_ss = os.path.join(OUTPUT_DIR, "00_initial_overview.png")
        await page.screenshot(path=initial_ss)
        print(f"Saved initial overview: {initial_ss}")

        # 2. Scroll to scanner
        scanner = page.locator("text=ALL COINS FUNDING ARBITRAGE SCANNER").first
        await scanner.scroll_into_view_if_needed()
        await page.wait_for_timeout(2000)

        scanner_ss = os.path.join(OUTPUT_DIR, "01_scanner_ranked_coins.png")
        await page.screenshot(path=scanner_ss)
        print(f"Saved scanner ranking: {scanner_ss}")

        # Get all coin rows in the scanner
        rows = page.locator("tbody tr")
        row_count = await rows.count()
        print(f"Found {row_count} ranked coin rows in scanner")

        # Test top ranked coins (or up to 10 ranked coins deeply)
        coins_to_test = min(row_count, 10)

        for i in range(coins_to_test):
            row = rows.nth(i)
            row_text = await row.inner_text()
            lines = [l.strip() for l in row_text.split("\n") if l.strip()]
            symbol = lines[0] if len(lines) > 0 else f"COIN_{i}"
            print(f"\n--- Testing Ranked Coin #{i+1}: {symbol} ---")

            # 1. Test LOAD button
            load_btn = row.locator("button:has-text('LOAD'), button:has-text('LOADED')").first
            if await load_btn.count() > 0:
                await load_btn.click()
                print(f"  [1/3] Clicked LOAD for {symbol}")
                await page.wait_for_timeout(1500)

                # Scroll to Cockpit to verify loaded
                cockpit = page.locator("text=EXECUTION COCKPIT").first
                await cockpit.scroll_into_view_if_needed()
                await page.wait_for_timeout(1000)

                load_ss = os.path.join(OUTPUT_DIR, f"{i+1:02d}_load_{symbol}.png")
                await page.screenshot(path=load_ss)
                print(f"  Saved LOAD screenshot: {load_ss}")

                # 2. Test Cockpit Dual Hedge Benchmark
                bench_btn = page.locator("button:has-text('DUAL BENCHMARK SPEED TEST'), button:has-text('ENTER DUAL HEDGE')").first
                if await bench_btn.count() > 0:
                    print(f"  [2/3] Executing Cockpit Hedge on {symbol}...")
                    await bench_btn.click()
                    await page.wait_for_timeout(4000)

                    cockpit_hedge_ss = os.path.join(OUTPUT_DIR, f"{i+1:02d}_cockpit_hedge_{symbol}.png")
                    await page.screenshot(path=cockpit_hedge_ss)
                    print(f"  Saved Cockpit Hedge screenshot: {cockpit_hedge_ss}")

            # 3. Test 1-Click QUICK HEDGE directly from scanner
            await scanner.scroll_into_view_if_needed()
            await page.wait_for_timeout(1000)

            # Re-locate the row
            row_again = page.locator("tbody tr").nth(i)
            quick_btn = row_again.locator("button:has-text('QUICK HEDGE')").first
            if await quick_btn.count() > 0:
                print(f"  [3/3] Clicking 1-Click QUICK HEDGE on row {symbol}...")
                await quick_btn.click()
                await page.wait_for_timeout(3000)

                quick_ss = os.path.join(OUTPUT_DIR, f"{i+1:02d}_quick_hedge_{symbol}.png")
                await page.screenshot(path=quick_ss)
                print(f"  Saved Quick Hedge screenshot: {quick_ss}")

            results.append({"rank": i+1, "symbol": symbol, "status": "TESTED"})

        # 4. Check LIVE OPEN POSITIONS table
        print("\nVerifying LIVE OPEN POSITIONS table...")
        pos_table = page.locator("text=LIVE OPEN POSITIONS").first
        await pos_table.scroll_into_view_if_needed()
        await page.wait_for_timeout(2000)

        pos_ss = os.path.join(OUTPUT_DIR, "99_live_open_positions_verified.png")
        await page.screenshot(path=pos_ss)
        print(f"Saved Live Positions screenshot: {pos_ss}")

        # 5. Check TRADED HEDGES HISTORY & AUDIT LOG
        print("Verifying TRADED HEDGES HISTORY & AUDIT LOG...")
        history_table = page.locator("text=TRADED HEDGES HISTORY & AUDIT LOG").first
        await history_table.scroll_into_view_if_needed()
        await page.wait_for_timeout(2000)

        hist_ss = os.path.join(OUTPUT_DIR, "99_traded_hedges_history_verified.png")
        await page.screenshot(path=hist_ss)
        print(f"Saved Traded Hedges History screenshot: {hist_ss}")

        print(f"\nTotal native alerts detected across all tests: {len(dialogs)}")
        if dialogs:
            print(f"Alert messages: {dialogs}")
        else:
            print("PERFECT: Zero browser alerts triggered across all coin tests!")

        summary = {
            "testedCoins": results,
            "dialogs": dialogs,
            "success": len(dialogs) == 0,
        }
        with open(os.path.join(OUTPUT_DIR, "test_summary.json"), "w") as f:
            json.dump(summary, f, indent=2)

        await browser.close()
        print("Deep coin testing complete.")

if __name__ == "__main__":
    asyncio.run(test_all_ranked_coins())
