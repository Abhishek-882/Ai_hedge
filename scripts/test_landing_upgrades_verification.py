import asyncio
import os
import json
from playwright.async_api import async_playwright

SCREENSHOT_DIR = r"c:\Users\Asus\Downloads\prj\funding-rate-bot\test_screenshots\landing_upgrades"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

async def run_verification():
    async with async_playwright() as p:
        # Launch Chromium with WebGPU flag enabled
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--enable-unsafe-webgpu",
                "--use-vulkan",
                "--enable-features=Vulkan",
            ]
        )
        context = await browser.new_context(
            viewport={"width": 1440, "height": 960},
            device_scale_factor=1
        )
        page = await context.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        print("[STEP 1] Navigating to https://ai-hedge-1.onrender.com/ ...")
        response = await page.goto("https://ai-hedge-1.onrender.com/", wait_until="networkidle", timeout=90000)
        print(f"HTTP Status: {response.status if response else 'None'}")
        await page.wait_for_timeout(3000)

        # 1. Hero Section with Ambient WebGPU Canvas / CSS Fallback Gradient
        shot1 = os.path.join(SCREENSHOT_DIR, "01_hero_ambient_shader.png")
        await page.screenshot(path=shot1, full_page=False)
        print(f"Captured: {shot1}")

        # 2. Check for Animate.css classes on status badges
        pulse_elements = await page.locator(".animate__pulse").count()
        print(f"Animate.css pulse elements found: {pulse_elements}")

        # 3. Test Anime.js spring hover on CTA button
        cta_button = page.locator('a[href="/terminal"]').first
        if await cta_button.count() > 0:
            print("[STEP 2] Hovering over CTA button to trigger Anime.js spring physics...")
            await cta_button.hover()
            await page.wait_for_timeout(500)
            shot2 = os.path.join(SCREENSHOT_DIR, "02_cta_spring_hover.png")
            await page.screenshot(path=shot2, full_page=False)
            print(f"Captured: {shot2}")

        # 4. Scroll to Opportunity Corridor Matrix (verify AOS fade-up reveal)
        corridor_heading = page.locator("text=Live Opportunity Corridor Matrix")
        if await corridor_heading.count() > 0:
            print("[STEP 3] Scrolling to Opportunity Corridor Matrix...")
            await corridor_heading.evaluate("el => el.scrollIntoView({ behavior: 'instant', block: 'start' })")
            await page.wait_for_timeout(1000)
            shot3 = os.path.join(SCREENSHOT_DIR, "03_opportunity_corridors_aos.png")
            await page.screenshot(path=shot3, full_page=False)
            print(f"Captured: {shot3}")

            # Hover over first opportunity card
            cards = page.locator('[data-aos="fade-up"]:has-text("bps")')
            if await cards.count() > 0:
                await cards.first.hover()
                await page.wait_for_timeout(500)
                shot3_hover = os.path.join(SCREENSHOT_DIR, "03b_card_spring_hover.png")
                await page.screenshot(path=shot3_hover, full_page=False)
                print(f"Captured: {shot3_hover}")

        # 5. Scroll to Bento Grid Infrastructure (verify staggered AOS reveals)
        bento_heading = page.locator("text=Institutional Core Infrastructure")
        if await bento_heading.count() > 0:
            print("[STEP 4] Scrolling to Bento Infrastructure Grid...")
            await bento_heading.evaluate("el => el.scrollIntoView({ behavior: 'instant', block: 'start' })")
            await page.wait_for_timeout(1000)
            shot4 = os.path.join(SCREENSHOT_DIR, "04_bento_grid_infrastructure_aos.png")
            await page.screenshot(path=shot4, full_page=False)
            print(f"Captured: {shot4}")

        # 6. Scroll to Methodology & Risks
        methodology_heading = page.locator("text=Quantitative Methodology & Risk Management")
        if await methodology_heading.count() > 0:
            print("[STEP 5] Scrolling to Methodology Section...")
            await methodology_heading.evaluate("el => el.scrollIntoView({ behavior: 'instant', block: 'start' })")
            await page.wait_for_timeout(1000)
            shot5 = os.path.join(SCREENSHOT_DIR, "05_methodology_aos.png")
            await page.screenshot(path=shot5, full_page=False)
            print(f"Captured: {shot5}")

        # 7. Scroll to Launch CTA strip
        launch_heading = page.locator("text=Launch Institutional Arbitrage")
        if await launch_heading.count() > 0:
            print("[STEP 6] Scrolling to Launch CTA strip...")
            await launch_heading.evaluate("el => el.scrollIntoView({ behavior: 'instant', block: 'start' })")
            await page.wait_for_timeout(1000)
            shot6 = os.path.join(SCREENSHOT_DIR, "06_bottom_cta_strip_aos.png")
            await page.screenshot(path=shot6, full_page=False)
            print(f"Captured: {shot6}")

        # 8. Full Page Panorama
        shot_full = os.path.join(SCREENSHOT_DIR, "07_full_page_panorama.png")
        await page.screenshot(path=shot_full, full_page=True)
        print(f"Captured: {shot_full}")

        # 9. Verify Responsive Resize & Mobile Fallback Safety
        print("[STEP 7] Verifying dynamic viewport resize to mobile (500px)...")
        await page.set_viewport_size({"width": 500, "height": 800})
        await page.wait_for_timeout(1000)
        hidden_count_mobile = await page.evaluate("""() => {
            const els = Array.from(document.querySelectorAll('[data-aos], h2, h3, .grid > div'));
            return els.filter(el => window.getComputedStyle(el).opacity !== '1').length;
        }""")
        print(f"Mobile resize (500px) hidden elements (expect 0): {hidden_count_mobile}")

        # Restore desktop viewport
        await page.set_viewport_size({"width": 1440, "height": 960})
        await page.wait_for_timeout(1000)

        # Evaluate client side AOS and WebGPU/canvas states
        eval_result = await page.evaluate("""() => {
            const canvas = document.querySelector('canvas');
            const aosElements = document.querySelectorAll('[data-aos]');
            const animatedAosElements = document.querySelectorAll('.aos-animate');
            const pulseBadges = document.querySelectorAll('.animate__pulse');
            return {
                canvasPresent: !!canvas,
                canvasWidth: canvas ? canvas.width : 0,
                canvasHeight: canvas ? canvas.height : 0,
                totalAosElements: aosElements.length,
                animatedAosElements: animatedAosElements.length,
                pulseBadgeCount: pulseBadges.length,
            };
        }""")

        eval_result["hiddenElementsOnMobileResize"] = hidden_count_mobile

        print("\n--- DOM EVALUATION METRICS ---")
        print(json.dumps(eval_result, indent=2))
        print("Console errors:", console_errors)

        await browser.close()
        print("\n[SUCCESS] Verification completed successfully.")

if __name__ == "__main__":
    asyncio.run(run_verification())
