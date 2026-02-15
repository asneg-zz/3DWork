#!/usr/bin/env python3
"""Quick test to check browser console for errors"""

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import sys

def check_errors():
    chrome_options = Options()
    chrome_options.add_argument('--headless=new')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    chrome_options.add_argument('--disable-gpu')

    driver = webdriver.Chrome(options=chrome_options)

    try:
        print("Loading http://localhost:5173...")
        driver.get('http://localhost:5173')

        # Wait a bit for app to load
        time.sleep(3)

        # Get console logs
        print("\n=== Browser Console Logs ===")
        logs = driver.get_log('browser')
        for log in logs:
            print(f"[{log['level']}] {log['message']}")

        # Check page source
        print("\n=== Page Title ===")
        print(driver.title)

        print("\n=== Page Source (first 500 chars) ===")
        print(driver.page_source[:500])

        # Try to find main element
        try:
            main = driver.find_element(By.TAG_NAME, 'main')
            print(f"\n✓ Found <main> element")
        except:
            print(f"\n✗ No <main> element found")

        # Try to find canvas
        try:
            canvas = driver.find_element(By.TAG_NAME, 'canvas')
            print(f"✓ Found <canvas> element")
        except:
            print(f"✗ No <canvas> element found")

        return len([l for l in logs if l['level'] == 'SEVERE']) == 0

    finally:
        driver.quit()

if __name__ == '__main__':
    success = check_errors()
    sys.exit(0 if success else 1)
