import sys
import os
import time
from playwright.sync_api import sync_playwright

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

LEV_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "test_screenshots", "leverage_verification")
os.makedirs(LEV_DIR, exist_ok=True)

BASE_URL = "https://ai-hedge-1.onrender.com"

def run_leverage_test():
    print("=== STARTING COMPREHENSIVE LEVERAGE VERIFICATION SUITE ===")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 950})
        page = context.new_page()

        # 1. Login as Admin
        print("1. Logging in as Admin...")
        page.goto(f"{BASE_URL}/login", wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(1500)
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
        page.wait_for_timeout(2000)

        cockpit_header = page.locator("h2:has-text('EXECUTION COCKPIT')").first
        cockpit_card = cockpit_header.locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]")
        cockpit_card.scroll_into_view_if_needed()
        page.wait_for_timeout(1000)

        # ---------------------------------------------------------------------
        # TEST 1: DEFAULT EQUAL LEVERAGE (50x/50x) -> EQUAL MARGIN & 1:1 PARITY
        # ---------------------------------------------------------------------
        print("\n--- TEST 1: Verifying Default Equal Leverage (50x/50x) & 1:1 Parity ---")
        lev_engine = cockpit_card.locator("text=DYNAMIC LEVERAGE ENGINE").locator("xpath=ancestor::div[contains(@class, 'rounded-lg')][1]")
        lev_text = lev_engine.inner_text()
        print(f"Leverage text:\n{lev_text}")
        
        assert "BN: 50x" in lev_text and "BG: 50x" in lev_text, f"Expected BN: 50x • BG: 50x, got {lev_text}"
        assert "1:1 Leverage Parity" in lev_text or "1:1 MATCH" in lev_text, "Expected 1:1 Parity indicator"
        
        shot1 = os.path.join(LEV_DIR, "01_default_50x_equal_margin_parity.png")
        cockpit_card.screenshot(path=shot1)
        print(f"[✓] Captured {shot1}")

        # ---------------------------------------------------------------------
        # TEST 2: PRESET SWITCHING (e.g. 20x, 10x)
        # ---------------------------------------------------------------------
        print("\n--- TEST 2: Testing Presets (20x, 10x) ---")
        btn_20x = lev_engine.locator("button:has-text('20x')").first
        btn_20x.click()
        page.wait_for_timeout(600)
        
        lev_text_20x = lev_engine.inner_text()
        print(f"After clicking 20x preset: {lev_text_20x.splitlines()[:3]}")
        assert "BN: 20x" in lev_text_20x and "BG: 20x" in lev_text_20x, "Expected 20x for both venues"
        
        shot2 = os.path.join(LEV_DIR, "02_preset_20x_both_venues.png")
        cockpit_card.screenshot(path=shot2)
        print(f"[✓] Captured {shot2}")

        # ---------------------------------------------------------------------
        # TEST 3: CUSTOM SPLIT - BINANCE 10x vs BITGET 30x (BN LOWER THAN BG)
        # ---------------------------------------------------------------------
        print("\n--- TEST 3: Testing Custom Split: Binance 10x vs Bitget 30x ---")
        custom_split_btn = lev_engine.locator("button:has-text('Custom Split')").first
        if custom_split_btn.count() > 0:
            custom_split_btn.click()
            page.wait_for_timeout(600)

        # Set Binance to 10x via container chaining
        bn_panel = lev_engine.locator("div.space-y-1").filter(has_text="Binance Leverage")
        bn_10x = bn_panel.locator("button", has_text="10x").first
        if bn_10x.count() > 0:
            bn_10x.click()
            page.wait_for_timeout(500)

        # Set Bitget to 30x via container chaining
        bg_panel = lev_engine.locator("div.space-y-1").filter(has_text="Bitget Leverage")
        bg_30x = bg_panel.locator("button", has_text="30x").first
        if bg_30x.count() > 0:
            bg_30x.click()
            page.wait_for_timeout(500)

        lev_text_split = lev_engine.inner_text()
        print(f"After setting BN 10x / BG 30x:\n{lev_text_split}")
        assert "BN: 10x" in lev_text_split and "BG: 30x" in lev_text_split, "Expected BN: 10x and BG: 30x"
        assert "Disparity" in lev_text_split, "Expected Disparity indicator"
        assert "Binance" in lev_text_split and "more margin" in lev_text_split, "Expected Binance flagged as consuming more margin"

        shot3 = os.path.join(LEV_DIR, "03_custom_split_bn10x_bg30x_disparity.png")
        cockpit_card.screenshot(path=shot3)
        print(f"[✓] Captured {shot3}")

        # ---------------------------------------------------------------------
        # TEST 4: CUSTOM SPLIT - BINANCE 50x vs BITGET 10x (BG LOWER THAN BN)
        # ---------------------------------------------------------------------
        print("\n--- TEST 4: Testing Inverted Split: Binance 50x vs Bitget 10x ---")
        bn_50x = bn_panel.locator("button", has_text="50x").first
        if bn_50x.count() > 0:
            bn_50x.click()
            page.wait_for_timeout(500)

        bg_10x = bg_panel.locator("button", has_text="10x").first
        if bg_10x.count() > 0:
            bg_10x.click()
            page.wait_for_timeout(500)

        lev_text_split_inv = lev_engine.inner_text()
        print(f"After setting BN 50x / BG 10x:\n{lev_text_split_inv}")
        assert "BN: 50x" in lev_text_split_inv and "BG: 10x" in lev_text_split_inv, "Expected BN: 50x and BG: 10x"
        assert "Bitget" in lev_text_split_inv and "more margin" in lev_text_split_inv, "Expected Bitget flagged as consuming more margin"

        shot4 = os.path.join(LEV_DIR, "04_custom_split_bn50x_bg10x_disparity.png")
        cockpit_card.screenshot(path=shot4)
        print(f"[✓] Captured {shot4}")

        # ---------------------------------------------------------------------
        # TEST 5: 1-CLICK 'TRY TO USE MAX' RESTORING 50x/50x 1:1 PARITY
        # ---------------------------------------------------------------------
        print("\n--- TEST 5: Testing 1-Click 'Try to Use Max' ---")
        try_max_btn = lev_engine.locator("button", has_text="Try to Use Max").first
        if try_max_btn.count() == 0:
            try_max_btn = lev_engine.locator("button", has_text="Try Max").first

        assert try_max_btn.count() > 0, "Expected 'Try to Use Max' equalizer button to be present"
        try_max_btn.click()
        page.wait_for_timeout(800)

        lev_text_restored = lev_engine.inner_text()
        print(f"After 'Try to Use Max':\n{lev_text_restored}")
        assert "BN: 50x" in lev_text_restored and "BG: 50x" in lev_text_restored, "Expected both restored to 50x"
        assert "1:1 Leverage Parity" in lev_text_restored, "Expected 1:1 Parity restored"

        shot5 = os.path.join(LEV_DIR, "05_try_max_equalized_50x_restored.png")
        cockpit_card.screenshot(path=shot5)
        print(f"[✓] Captured {shot5}")

        print("\n=== ALL LEVERAGE TESTS PASSED WITH 100% SUCCESS! ===")
        browser.close()

if __name__ == "__main__":
    run_leverage_test()
