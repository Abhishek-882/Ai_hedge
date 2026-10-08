import os
import sys
import time
import json
import requests
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("BASE_URL", "http://localhost:3005").rstrip("/")
SCREENSHOT_DIR = Path(r"c:\Users\Asus\Downloads\prj\funding-rate-bot\test_screenshots\skeptical_audit")
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

print("=" * 70)
print(f"SKEPTICAL DEEP PLATFORM AUDIT RUNNING AGAINST {BASE_URL}")
print("=" * 70)

# ----------------------------------------------------------------------
# 1. UNAUTHENTICATED PROTECTION TESTS
# ----------------------------------------------------------------------
print("\n--- 1. Testing Unauthenticated Access Protection ---")
s_anon = requests.Session()

# 1a. Call /api/account without auth -> 401
res = s_anon.get(f"{BASE_URL}/api/account")
print("Unauth /api/account status:", res.status_code)
assert res.status_code == 401, f"Expected 401, got {res.status_code}"
assert res.json().get("requiresKeys") is True

# 1b. Call /api/bitget/account without auth -> 401
res = s_anon.get(f"{BASE_URL}/api/bitget/account")
print("Unauth /api/bitget/account status:", res.status_code)
assert res.status_code == 401, f"Expected 401, got {res.status_code}"

# 1c. Call POST /api/trades (action: clear) without auth -> MUST BE 401
res = s_anon.post(f"{BASE_URL}/api/trades", json={"action": "clear"})
print("Unauth clear trades status:", res.status_code)
assert res.status_code == 401, f"Unauthenticated clear must be rejected with 401, got {res.status_code}"
print(">>> Unauthenticated access security guards PASSED!")

# ----------------------------------------------------------------------
# 2. ADMIN AUTHENTICATION & ACCESS (varsha633@gmailcom / 99129838aA@)
# ----------------------------------------------------------------------
print("\n--- 2. Testing Admin Account (varsha633@gmailcom) ---")
s_admin = requests.Session()
login_res = s_admin.post(f"{BASE_URL}/api/auth", json={
    "action": "login",
    "email": "varsha633@gmailcom",
    "password": "99129838aA@",
})
print("Admin Login Status:", login_res.status_code)
admin_data = login_res.json()
assert admin_data.get("success") is True
assert admin_data.get("user", {}).get("role") == "admin"
print(f"Admin logged in: {admin_data['user']['email']}, Role: {admin_data['user']['role']}")

# Admin calls /api/account -> should have system keys access
acc_res = s_admin.get(f"{BASE_URL}/api/account")
acc_data = acc_res.json()
print("Admin account fetch:", acc_data.get("success"), "isAdmin:", acc_data.get("isAdmin"))
assert acc_data.get("isAdmin") is True
print(">>> Admin authentication & system keys access PASSED!")

# ----------------------------------------------------------------------
# 3. NON-ADMIN SIGNUP & BLANK API KEYS ISOLATION
# ----------------------------------------------------------------------
print("\n--- 3. Testing Non-Admin Blank Key Isolation ---")
s_user = requests.Session()
unique_id = int(time.time())
user_email = f"trader_{unique_id}@mmt.com"
signup_res = s_user.post(f"{BASE_URL}/api/auth", json={
    "action": "signup",
    "email": user_email,
    "password": "Password99!",
    "username": f"Trader{unique_id % 1000}",
})
user_data = signup_res.json()
assert user_data.get("success") is True
assert user_data.get("user", {}).get("role") == "user"

# Verify blank keys in returned user payload
user_keys = user_data.get("user", {}).get("apiKeys", {})
print("Newly registered user keys:", user_keys)
assert user_keys.get("binanceKey") == "", "Binance key MUST be blank"
assert user_keys.get("bitgetKey") == "", "Bitget key MUST be blank"

# Non-admin calls /api/account -> 401 requiresKeys
user_acc_res = s_user.get(f"{BASE_URL}/api/account")
assert user_acc_res.status_code == 401
assert user_acc_res.json().get("requiresKeys") is True
assert user_acc_res.json().get("isAdmin") is False
print(">>> Non-admin blank key isolation PASSED! No credentials leaked.")

# ----------------------------------------------------------------------
# 4. PROFILE KEY UPDATE & SECRET PRESERVATION TEST
# ----------------------------------------------------------------------
print("\n--- 4. Testing Key Update & Secret Preservation ---")
# User saves personal keys
update_res = s_user.post(f"{BASE_URL}/api/auth", json={
    "action": "update_keys",
    "apiKeys": {
        "binanceKey": "my_test_binance_key_12345678",
        "binanceSecret": "my_very_secret_binance_secret_87654321",
        "bitgetKey": "my_test_bitget_key_12345678",
        "bitgetSecret": "my_very_secret_bitget_secret_87654321",
        "bitgetPassphrase": "myPassphrase99",
    }
})
assert update_res.json().get("success") is True
print("First key save successful!")

# User subsequently updates only the endpoint or key, leaving secrets masked/blank
update_res2 = s_user.post(f"{BASE_URL}/api/auth", json={
    "action": "update_keys",
    "apiKeys": {
        "binanceKey": "my_test_binance_key_updated",
        "binanceSecret": "••••••••••••",  # masked
        "bitgetSecret": "",              # blank
    }
})
assert update_res2.json().get("success") is True

# Check user profile via GET /api/auth
profile_check = s_user.get(f"{BASE_URL}/api/auth").json()
profile_keys = profile_check.get("user", {}).get("apiKeys", {})
print("Profile keys after second update:", profile_keys)
assert profile_keys.get("binanceKey") == "my_test_binance_key_updated"
assert profile_keys.get("hasBinanceSecret") is True, "Original secret must NOT be wiped out by mask"
assert profile_keys.get("hasBitgetSecret") is True, "Original bitget secret must NOT be wiped out by blank"
print(">>> Secret preservation on subsequent updates PASSED!")

# ----------------------------------------------------------------------
# 5. TRADE HISTORY "STARTS NOW" & FULL DEPTH TELEMETRY RECEIPT TEST
# ----------------------------------------------------------------------
print("\n--- 5. Testing Trade History Ledger & Full Depth Receipt ---")
# 5a. Admin clears history
clear_res = s_admin.post(f"{BASE_URL}/api/trades", json={"action": "clear"})
assert clear_res.json().get("success") is True
assert clear_res.json().get("count") == 0

# Verify ledger is truly empty
hist_res = s_admin.get(f"{BASE_URL}/api/trades")
assert hist_res.json().get("count") == 0, "History must start at 0"
print("Trade history verified empty: history starts now!")

# 5b. Record a hedge trade with full depth execution details
trade_payload = {
    "symbol": "ETHUSDT",
    "quantity": "0.05",
    "notionalUsdt": 154.20,
    "directionLabel": "Short BN + Long BG",
    "leg1Venue": "Binance Testnet",
    "leg1Side": "SELL",
    "leg1Price": 3084.50,
    "leg1OrderId": "ORD_BN_99182",
    "leg2Venue": "Bitget V3 Demo",
    "leg2Side": "BUY",
    "leg2Price": 3083.80,
    "leg2OrderId": "ORD_BG_88271",
    "interLegDeltaMs": 11.4,
    "durationMs": 1420,
    "realizedPnl": 0.3500,
    "returnsPct": 0.2269,
    "feesUsdt": 0.0012,
    "status": "DELTA_NEUTRAL",
}
rec_res = s_admin.post(f"{BASE_URL}/api/trades", json=trade_payload)
assert rec_res.json().get("success") is True
saved = rec_res.json().get("trade")
assert saved["symbol"] == "ETHUSDT"
assert saved["durationMs"] == 1420
assert saved["interLegDeltaMs"] == 11.4
assert saved["realizedPnl"] == 0.3500
assert saved["returnsPct"] == 0.2269
assert saved["leg1OrderId"] == "ORD_BN_99182"
assert saved["leg2OrderId"] == "ORD_BG_88271"
print("Hedge trade archived with exact full depth fields!")

# ----------------------------------------------------------------------
# 6. 25 REPEATED CYCLES OF ALL PRIMARY ENDPOINTS (BUTTON/ENDPOINT STRESS)
# ----------------------------------------------------------------------
print("\n--- 6. Running 25 Repeated Cycles on Primary Platform Endpoints ---")
latencies = []
for i in range(1, 26):
    t0 = time.time()
    r1 = s_admin.get(f"{BASE_URL}/api/ticker?symbol=BTCUSDT", timeout=5)
    r2 = s_admin.get(f"{BASE_URL}/api/coins", timeout=5)
    r3 = s_admin.get(f"{BASE_URL}/api/bot/daemon", timeout=5)
    r4 = s_admin.get(f"{BASE_URL}/api/trades", timeout=5)
    r5 = s_admin.get(f"{BASE_URL}/api/auth", timeout=5)
    cyc_ms = (time.time() - t0) * 1000
    latencies.append(cyc_ms)
    assert all(r.status_code == 200 for r in [r1, r2, r3, r4, r5]), f"Cycle {i} failed"
    if i % 5 == 0 or i == 1:
        print(f"  Cycle {i:02d}/25 passed in {cyc_ms:.1f}ms (All 5 endpoints HTTP 200)")

avg_ms = sum(latencies) / len(latencies)
print(f">>> 25/25 cycles PASSED! Average roundtrip cycle time: {avg_ms:.1f}ms")

# ----------------------------------------------------------------------
# 7. PLAYWRIGHT BROWSER VISUAL INSPECTION & SCREENSHOTS
# ----------------------------------------------------------------------
print("\n--- 7. Running Playwright Headless Browser UI Verification ---")
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()

    # 7a. Intro page
    print("Visiting Intro Page (/) ...")
    page.goto(f"{BASE_URL}/", wait_until="networkidle")
    time.sleep(1)
    page.screenshot(path=str(SCREENSHOT_DIR / "01_intro_hero.png"))

    page.evaluate("window.scrollBy(0, 750)")
    time.sleep(1)
    page.screenshot(path=str(SCREENSHOT_DIR / "02_intro_3d_nexus.png"))

    page.evaluate("window.scrollBy(0, 900)")
    time.sleep(1)
    page.screenshot(path=str(SCREENSHOT_DIR / "03_intro_footer_disclaimer.png"))

    # 7b. Login page
    print("Visiting Login Page (/login) ...")
    page.goto(f"{BASE_URL}/login", wait_until="networkidle")
    time.sleep(1)
    page.screenshot(path=str(SCREENSHOT_DIR / "04_login_page.png"))

    # Fill Admin
    print("Testing 'Fill Admin' button...")
    page.click("button:has-text('Fill Admin')")
    time.sleep(0.5)
    page.click("button[type='submit']")
    time.sleep(2)
    print("Logged in, redirected to:", page.url)

    # 7c. Trading Terminal
    page.goto(f"{BASE_URL}/terminal", wait_until="networkidle")
    time.sleep(2)
    page.screenshot(path=str(SCREENSHOT_DIR / "05_terminal_authenticated.png"))

    # 7d. History Page
    print("Visiting History Page (/history) ...")
    page.goto(f"{BASE_URL}/history", wait_until="networkidle")
    time.sleep(1.5)
    page.screenshot(path=str(SCREENSHOT_DIR / "06_history_table.png"))

    # Click [ More Detail ]
    print("Clicking [ More Detail ] modal...")
    detail_btn = page.locator("button:has-text('[ More Detail ]')").first
    if detail_btn.count() > 0:
        detail_btn.click()
        time.sleep(1)
        page.screenshot(path=str(SCREENSHOT_DIR / "07_more_detail_modal.png"))
        print("Captured modal screenshot 07_more_detail_modal.png")
        page.click("button:has-text('Close Details')")
        time.sleep(0.5)

    # 7e. Profile Page
    print("Visiting Profile Page (/profile) ...")
    page.goto(f"{BASE_URL}/profile", wait_until="networkidle")
    time.sleep(1.5)
    page.screenshot(path=str(SCREENSHOT_DIR / "08_profile_vault.png"))

    # 7f. Test Logout & Unauthenticated Redirect
    print("Testing Logout and Auth Redirect Gate...")
    page.locator("button:has-text('Sign Out')").first.click()
    page.wait_for_url("**/login", timeout=10000)
    print("Logout successfully redirected to:", page.url)
    assert "/login" in page.url

    # Attempt to visit /terminal when logged out -> MUST redirect to /login
    page.goto(f"{BASE_URL}/terminal", wait_until="networkidle")
    page.wait_for_url("**/login", timeout=10000)
    print("Unauthenticated /terminal redirect PASSED! Current URL:", page.url)
    assert "/login" in page.url

    # Attempt to visit /history when logged out -> MUST redirect to /login
    page.goto(f"{BASE_URL}/history", wait_until="networkidle")
    page.wait_for_url("**/login", timeout=10000)
    print("Unauthenticated /history redirect PASSED! Current URL:", page.url)
    assert "/login" in page.url

    browser.close()

print("\n" + "=" * 70)
print("SKEPTICAL AUDIT FULLY PASSED: 100% SUCCESS ACROSS ALL VECTORS!")
print("=" * 70)
