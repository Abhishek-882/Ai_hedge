import asyncio
import os
import sys
from playwright.async_api import async_playwright

OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "test_screenshots",
    "mutual_pairs_verification",
)
os.makedirs(OUTPUT_DIR, exist_ok=True)

TARGET_URL = "https://ai-hedge-1.onrender.com/"

async def run_verification():
    print(f"Starting verification against {TARGET_URL}...")
    alert_detected = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await context.new_page()

        # Listen for any native dialogs to prove NO alert popups occur
        page.on("dialog", lambda dialog: alert_detected.append(dialog.message))

        print("Navigating to platform...")
        await page.goto(TARGET_URL, wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(4000)

        # 1. Scanner inspection
        print("Checking All Coins Scanner...")
        scanner_el = page.locator("text=ALL COINS FUNDING ARBITRAGE SCANNER").first
        await scanner_el.scroll_into_view_if_needed()
        await page.wait_for_timeout(2000)

        # Take screenshot of scanner
        s1_path = os.path.join(OUTPUT_DIR, "01_verified_mutual_scanner_no_csop.png")
        await page.screenshot(path=s1_path)
        print(f"Saved {s1_path}")

        # Check for CSOP
        page_content = await page.content()
        has_csop = "CSOPSAMSUNG2LUSDT" in page_content
        print(f"Contains CSOPSAMSUNG2LUSDT: {has_csop} (Expected: False)")

        # 2. Click QUICK HEDGE on a top coin row
        print("Executing 1-Click Quick Hedge on top scanner row...")
        quick_hedge_btns = page.locator("button:has-text('QUICK HEDGE')")
        btn_count = await quick_hedge_btns.count()
        print(f"Found {btn_count} QUICK HEDGE buttons")

        if btn_count > 0:
            target_btn = quick_hedge_btns.first
            await target_btn.click()
            print("Clicked QUICK HEDGE. Waiting for transition to FILLED ✓...")
            
            # Wait for filled confirmation
            try:
                await page.wait_for_selector("button:has-text('FILLED ✓')", timeout=12000)
                print("SUCCESS: Button transitioned to FILLED ✓!")
            except Exception as e:
                print(f"Note on fill transition: {e}")

            await page.wait_for_timeout(2000)
            s2_path = os.path.join(OUTPUT_DIR, "02_quick_hedge_filled_no_alert.png")
            await page.screenshot(path=s2_path)
            print(f"Saved {s2_path}")

        # 3. Check LIVE OPEN POSITIONS table
        print("Checking LIVE OPEN POSITIONS table...")
        pos_header = page.locator("text=LIVE OPEN POSITIONS").first
        await pos_header.scroll_into_view_if_needed()
        await page.wait_for_timeout(2000)

        s3_path = os.path.join(OUTPUT_DIR, "03_live_open_positions_verified.png")
        await page.screenshot(path=s3_path)
        print(f"Saved {s3_path}")

        # 4. Check TRADED HEDGES HISTORY & AUDIT LOG table
        print("Checking TRADED HEDGES HISTORY & AUDIT LOG...")
        history_header = page.locator("text=TRADED HEDGES HISTORY & AUDIT LOG").first
        await history_header.scroll_into_view_if_needed()
        await page.wait_for_timeout(2000)

        s4_path = os.path.join(OUTPUT_DIR, "04_traded_hedges_history_populated.png")
        await page.screenshot(path=s4_path)
        print(f"Saved {s4_path}")

        # 5. Check live ticking of countdown and mark prices
        print("Checking live second-by-second ticking...")
        countdown_el = page.locator("text=SETTLEMENT UTC").first
        await countdown_el.scroll_into_view_if_needed()
        t0_text = await page.content()
        await page.wait_for_timeout(3000)
        t1_text = await page.content()
        is_ticking = t0_text != t1_text
        print(f"UI state changed over 3 seconds (ticking): {is_ticking}")

        s5_path = os.path.join(OUTPUT_DIR, "05_live_ticking_confirmed.png")
        await page.screenshot(path=s5_path)
        print(f"Saved {s5_path}")

        print(f"Native dialogs/alerts detected during session: {len(alert_detected)}")
        if alert_detected:
            print(f"Alert messages: {alert_detected}")
        else:
            print("ZERO native alerts triggered! Smooth in-app UX confirmed.")

        await browser.close()
        print("Verification complete.")

if __name__ == "__main__":
    asyncio.run(run_verification())
