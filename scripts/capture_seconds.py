from playwright.sync_api import sync_playwright
import time
from pathlib import Path

dir_path = Path(r"c:\Users\Asus\Downloads\prj\funding-rate-bot\test_screenshots\every_sec_verification")
dir_path.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    page.goto("https://ai-hedge-1.onrender.com", wait_until="networkidle")
    page.wait_for_timeout(2000)

    for i in range(1, 5):
        try:
            el = page.locator("span:has-text('SETTLEMENT UTC')").locator("xpath=../..").locator("div.text-xl")
            val = el.inner_text().strip()
        except Exception as e:
            val = "error"
        print(f"Sec #{i}: Settlement Countdown = {val}")
        page.screenshot(path=str(dir_path / f"sec_0{i}_settlement_countdown_{val.replace(':', '_')}.png"))
        time.sleep(1.0)

    browser.close()
