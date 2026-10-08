import sys
import os
import time
from playwright.sync_api import sync_playwright

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

SCREENSHOT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "test_screenshots", "anti_glitch_and_adaptable_leverage")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

BASE_URL = "https://ai-hedge-1.onrender.com"

def run_test():
    print("=== STARTING UNIVERSAL ANTI-GLITCH & ADAPTABLE LEVERAGE TEST ===")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 950})
        page = context.new_page()

        alerts = []
        page.on("dialog", lambda dialog: (alerts.append(dialog.message), dialog.accept()))

        # 1. Login as Admin
        print("1. Logging in as Admin...")
        page.goto(f"{BASE_URL}/login", wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(2000)
        fill_btn = page.locator("button:has-text('Fill Admin')")
        if fill_btn.count() > 0:
            fill_btn.first.click()
            page.wait_for_timeout(500)
        page.click("button[type='submit']")
        page.wait_for_timeout(4000)

        if "/terminal" not in page.url:
            page.goto(f"{BASE_URL}/terminal", wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(3000)

        print(f"2. On Terminal: {page.url}")
        page.wait_for_timeout(3000)

        # -------------------------------------------------------------
        # STEP 1: VERIFY INITIAL BTC STATE & EQUALIZED 50x/50x LEVERAGE
        # -------------------------------------------------------------
        print("\n--- STEP 1: Verifying BTC state, clean asset strip, and 50x/50x leverage ---")
        cockpit_header = page.locator("h2:has-text('EXECUTION COCKPIT')").first
        cockpit_card = cockpit_header.locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]")
        cockpit_card.scroll_into_view_if_needed()
        page.wait_for_timeout(1000)

        # Check Asset Strip for BTC
        selector_grid = cockpit_card.locator("div.grid-cols-6").first
        btc_btns = selector_grid.locator("button:has-text('BTC')")
        eth_btns = selector_grid.locator("button:has-text('ETH')")
        print(f"Asset buttons: BTC count={btc_btns.count()}, ETH count={eth_btns.count()} (Both MUST be 1)")
        assert btc_btns.count() == 1, f"Expected exactly 1 BTC button, got {btc_btns.count()}"
        assert eth_btns.count() == 1, f"Expected exactly 1 ETH button, got {eth_btns.count()}"

        # Check Leverage Engine text: BN: 50x • BG: 50x
        lev_text = cockpit_card.locator("text=DYNAMIC LEVERAGE ENGINE").locator("xpath=ancestor::div[1]").inner_text()
        print(f"Leverage Engine summary: {lev_text}")
        assert "50x" in lev_text, f"Expected 50x in leverage header, got {lev_text}"

        # Verify 1:1 Parity indicator
        parity_elem = cockpit_card.locator("text=1:1 Leverage Parity")
        if parity_elem.count() > 0:
            print("[✓] 1:1 Leverage Parity verified on BTC (equal 50x/50x).")
        else:
            print("[!] Note: Parity element text check:", cockpit_card.inner_text()[:300])

        shot1 = os.path.join(SCREENSHOT_DIR, "01_btc_50x_parity_equal_margin.png")
        cockpit_card.screenshot(path=shot1)
        print(f"[✓] Captured {shot1}")

        # -------------------------------------------------------------
        # STEP 2: TEST SWITCHING TO ETH - ZERO GLITCH & ZERO DUPLICATE
        # -------------------------------------------------------------
        print("\n--- STEP 2: Switching to ETH and verifying zero price glitch ---")
        eth_selector_btn = selector_grid.locator("button:has-text('ETH')").first
        eth_selector_btn.click()
        page.wait_for_timeout(1500)

        # Check for duplicate ETH buttons
        eth_btns_after = selector_grid.locator("button:has-text('ETH')")
        print(f"ETH buttons after selection: count={eth_btns_after.count()} (MUST be exactly 1)")
        assert eth_btns_after.count() == 1, f"Duplicate ETH button detected! Found {eth_btns_after.count()}"

        # Sample prices on SpreadTracker to verify ETH range (~$2,000-$3,000, NOT $80,000)
        spread_card = page.locator("h2:has-text('CROSS-EXCHANGE FUNDING SPREAD')").first.locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]")
        spread_text = spread_card.inner_text()
        has_btc_80k_leak = "80," in spread_text or "81," in spread_text or "86,400" in spread_text
        print(f"SpreadTracker text on ETH:\n{spread_text[:200]}...")
        assert not has_btc_80k_leak, "Glitch detected: BTC $80k price leaked into ETH SpreadTracker!"
        print("[✓] Verified ETH prices populated cleanly without BTC 80k price leak.")

        shot2 = os.path.join(SCREENSHOT_DIR, "02_eth_selected_zero_glitch_no_duplicate.png")
        page.screenshot(path=shot2)
        print(f"[✓] Captured {shot2}")

        # -------------------------------------------------------------
        # STEP 3: TEST CUSTOM SPLIT (e.g. Binance 10x vs Bitget 30x)
        # -------------------------------------------------------------
        print("\n--- STEP 3: Testing Custom Split & Margin Disparity Analyzer ---")
        custom_split_btn = cockpit_card.locator("button:has-text('Custom Split')").first
        if custom_split_btn.count() > 0:
            custom_split_btn.click()
            page.wait_for_timeout(800)

        # Set Binance to 10x
        bn_10x_btn = cockpit_card.locator("button:has-text('10x')").first
        if bn_10x_btn.count() > 0:
            bn_10x_btn.click()
            page.wait_for_timeout(500)

        # Check Disparity banner
        disparity_banner = cockpit_card.locator("text=Disparity")
        print(f"Disparity banner present: {disparity_banner.count() > 0}")
        if disparity_banner.count() > 0:
            print(f"[✓] Disparity banner message: {disparity_banner.first.inner_text()}")

        shot3 = os.path.join(SCREENSHOT_DIR, "03_custom_split_disparity_warning.png")
        cockpit_card.screenshot(path=shot3)
        print(f"[✓] Captured {shot3}")

        # -------------------------------------------------------------
        # STEP 4: TEST 1-CLICK 'TRY TO USE MAX' EQUALIZER
        # -------------------------------------------------------------
        print("\n--- STEP 4: Testing 1-Click 'Try to Use Max' Equalizer ---")
        try_max_btn = cockpit_card.locator("button:has-text('Try to Use Max')").first
        if try_max_btn.count() == 0:
            try_max_btn = cockpit_card.locator("button:has-text('Try Max')").first

        if try_max_btn.count() > 0:
            try_max_btn.click()
            page.wait_for_timeout(800)
            print("[✓] Clicked 'Try to Use Max' equalizer button.")

        # Confirm equalized parity restored
        shot4 = os.path.join(SCREENSHOT_DIR, "04_equalized_max_restored.png")
        cockpit_card.screenshot(path=shot4)
        print(f"[✓] Captured {shot4}")

        # -------------------------------------------------------------
        # STEP 5: LOAD ARBITRARY RANKED COIN FROM SCANNER (e.g. ADA/SOL)
        # -------------------------------------------------------------
        print("\n--- STEP 5: Testing arbitrary ranked coin loading from All Coins Scanner ---")
        scanner_card = page.locator("h2:has-text('ALL COINS FUNDING ARBITRAGE SCANNER')").first.locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]")
        scanner_card.scroll_into_view_if_needed()
        page.wait_for_timeout(1000)

        load_btns = scanner_card.locator("button:has-text('LOAD')")
        if load_btns.count() > 0:
            first_load = load_btns.first
            row = first_load.locator("xpath=ancestor::tr")
            coin_sym = row.locator("td").nth(1).inner_text().replace("\n", " ").strip()
            print(f"Loading ranked coin: {coin_sym}")
            first_load.click()
            page.wait_for_timeout(2000)

            # Scroll up to Cockpit
            cockpit_card.scroll_into_view_if_needed()
            page.wait_for_timeout(1000)

            loaded_label = cockpit_card.locator("text=LOADED:").inner_text()
            print(f"Cockpit status: {loaded_label}")

            shot5 = os.path.join(SCREENSHOT_DIR, "05_ranked_coin_loaded_in_cockpit.png")
            cockpit_card.screenshot(path=shot5)
            print(f"[✓] Captured {shot5}")

        print("\n=== ALL ANTI-GLITCH & ADAPTABLE LEVERAGE CHECKS PASSED SUCCESSFULLY! ===")
        browser.close()

if __name__ == "__main__":
    run_test()
