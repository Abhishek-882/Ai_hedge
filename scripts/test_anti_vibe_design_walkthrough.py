import asyncio
import os
from playwright.async_api import async_playwright

SCREENSHOT_DIR = r"c:\Users\Asus\Downloads\prj\funding-rate-bot\test_screenshots\anti_vibe_world_class"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

async def run_tests():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 960})
        page = await context.new_page()

        print("[TEST STEP 1] Navigating to Landing Page https://ai-hedge-1.onrender.com/ ...")
        await page.goto("https://ai-hedge-1.onrender.com/", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(3000)

        # Step 1: Capture Hero Section with Three.js 3D WebGL Scene
        hero_shot = os.path.join(SCREENSHOT_DIR, "01_landing_hero_3d_webgl_initial.png")
        await page.screenshot(path=hero_shot, full_page=False)
        print(f"Captured: {hero_shot}")

        # Step 2: Hover and interact with the 3D Canvas
        print("[TEST STEP 2] Interacting with 3D WebGL Canvas via mouse movement...")
        canvas = page.locator("canvas").first
        if await canvas.count() > 0:
            box = await canvas.bounding_box()
            if box:
                # Move cursor across canvas to trigger spring inertia tilt and gimbal telemetry
                await page.mouse.move(box["x"] + box["width"] * 0.3, box["y"] + box["height"] * 0.3)
                await page.wait_for_timeout(800)
                await page.mouse.move(box["x"] + box["width"] * 0.7, box["y"] + box["height"] * 0.7)
                await page.wait_for_timeout(800)

            # Capture closeup of 3D Scene container
            three_container = page.locator("section").first
            gimbal_shot = os.path.join(SCREENSHOT_DIR, "02_landing_hero_gimbal_telemetry_interaction.png")
            await three_container.screenshot(path=gimbal_shot)
            print(f"Captured: {gimbal_shot}")

        # Step 3: Telemetry Ribbon and Live Spreads Matrix
        print("[TEST STEP 3] Inspecting Institutional Telemetry Ribbon and Opportunity Corridor Matrix...")
        corridor_heading = page.locator("text=Live Opportunity Corridor Matrix")
        await corridor_heading.scroll_into_view_if_needed()
        await page.wait_for_timeout(1000)
        corridor_shot = os.path.join(SCREENSHOT_DIR, "03_telemetry_ribbon_and_live_corridors.png")
        await page.screenshot(path=corridor_shot, full_page=False)
        print(f"Captured: {corridor_shot}")

        # Step 4: Cash Flow Simulator (Default State)
        print("[TEST STEP 4] Inspecting Arbitrage Cash-Flow Simulator default state...")
        sim_heading = page.locator("text=Interactive Arbitrage Cash-Flow Simulator")
        await sim_heading.scroll_into_view_if_needed()
        await page.wait_for_timeout(1000)
        sim_default_shot = os.path.join(SCREENSHOT_DIR, "04_cash_flow_simulator_default.png")
        await page.screenshot(path=sim_default_shot, full_page=False)
        print(f"Captured: {sim_default_shot}")

        # Step 5: Cash Flow Simulator Interacted ($50k chip, Compounded APY mode)
        print("[TEST STEP 5] Interacting with Cash-Flow Simulator ($50k capital chip & Compounded APY)...")
        chip_50k = page.locator('button:has-text("$50k")')
        if await chip_50k.count() > 0:
            await chip_50k.click()
            await page.wait_for_timeout(500)

        compound_btn = page.locator('button:has-text("Compounded APY")')
        if await compound_btn.count() > 0:
            await compound_btn.click()
            await page.wait_for_timeout(500)

        sim_interacted_shot = os.path.join(SCREENSHOT_DIR, "05_cash_flow_simulator_interacted.png")
        await page.screenshot(path=sim_interacted_shot, full_page=False)
        print(f"Captured: {sim_interacted_shot}")

        # Step 6: Institutional Bento Grid Feature Cards
        print("[TEST STEP 6] Inspecting Institutional Bento Grid...")
        bento_heading = page.locator("text=Institutional Core Infrastructure")
        await bento_heading.scroll_into_view_if_needed()
        await page.wait_for_timeout(1000)
        bento_shot = os.path.join(SCREENSHOT_DIR, "06_bento_grid_infrastructure.png")
        await page.screenshot(path=bento_shot, full_page=False)
        print(f"Captured: {bento_shot}")

        # Step 7: Quantitative Methodology and Risk Architecture
        print("[TEST STEP 7] Inspecting Quantitative Methodology section...")
        methodology_heading = page.locator("text=Quantitative Methodology")
        await methodology_heading.scroll_into_view_if_needed()
        await page.wait_for_timeout(1000)
        methodology_shot = os.path.join(SCREENSHOT_DIR, "07_methodology_and_proof.png")
        await page.screenshot(path=methodology_shot, full_page=False)
        print(f"Captured: {methodology_shot}")

        # Step 8: Full Landing Page Scroll Proof
        print("[TEST STEP 8] Capturing full landing page panorama...")
        full_landing_shot = os.path.join(SCREENSHOT_DIR, "08_full_landing_page_panorama.png")
        await page.screenshot(path=full_landing_shot, full_page=True)
        print(f"Captured: {full_landing_shot}")

        # Step 9: Login as Admin and Navigate to Cockpit (/terminal)
        print("[TEST STEP 9] Logging in as Admin to inspect Trading Cockpit...")
        await page.goto("https://ai-hedge-1.onrender.com/login", wait_until="networkidle")
        await page.click('button:has-text("Fill Admin")')
        await page.click('button[type="submit"]')
        await page.wait_for_url("**/terminal**", timeout=30000)
        await page.wait_for_timeout(4000)

        terminal_shot = os.path.join(SCREENSHOT_DIR, "09_terminal_cockpit_full_view.png")
        await page.screenshot(path=terminal_shot, full_page=False)
        print(f"Captured: {terminal_shot}")

        # Step 10: History Audit Ledger (/history)
        print("[TEST STEP 10] Navigating to History Audit Ledger (/history)...")
        await page.goto("https://ai-hedge-1.onrender.com/history", wait_until="networkidle")
        await page.wait_for_timeout(3000)
        history_shot = os.path.join(SCREENSHOT_DIR, "10_history_audit_ledger.png")
        await page.screenshot(path=history_shot, full_page=False)
        print(f"Captured: {history_shot}")

        await browser.close()
        print("\n[SUCCESS] All 10 step-by-step verification screenshots captured successfully!")

if __name__ == "__main__":
    asyncio.run(run_tests())
