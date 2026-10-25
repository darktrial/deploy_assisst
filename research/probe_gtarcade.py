import getpass
import json
import os
import sys
import time
from pathlib import Path

from environment import load_local_dependencies
load_local_dependencies()

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By


START_URL = "https://game.gtarcade.com/game?source=ad&gameId=346&opId=590&lm=&sid=2625310001&adid=1-0-18"
OUT = Path(__file__).resolve().parent / "capture"


def network_events(driver):
    rows = []
    for item in driver.get_log("performance"):
        msg = json.loads(item["message"])["message"]
        method = msg.get("method", "")
        if method.startswith("Network."):
            rows.append(msg)
    return rows


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    opts = Options()
    opts.binary_location = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    opts.add_argument("--headless=new")
    opts.add_argument("--window-size=1600,1000")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--no-first-run")
    opts.add_argument("--disable-default-apps")
    opts.set_capability("goog:loggingPrefs", {"performance": "ALL", "browser": "ALL"})

    driver = webdriver.Chrome(options=opts)
    try:
        driver.execute_cdp_cmd("Network.enable", {"maxTotalBufferSize": 100000000, "maxResourceBufferSize": 10000000})
        driver.get(START_URL)
        time.sleep(8)
        (OUT / "before_login.html").write_text(driver.page_source, encoding="utf-8")
        driver.save_screenshot(str(OUT / "before_login.png"))

        email = input("Email: ").strip()
        password = getpass.getpass("Password: ")

        inputs = driver.find_elements(By.CSS_SELECTOR, "input")
        print("INPUTS", json.dumps([
            {"type": x.get_attribute("type"), "name": x.get_attribute("name"),
             "id": x.get_attribute("id"), "placeholder": x.get_attribute("placeholder")}
            for x in inputs
        ], ensure_ascii=False))

        user_el = next((x for x in inputs if (x.get_attribute("type") or "").lower() in ("email", "text") and x.is_displayed()), None)
        pass_el = next((x for x in inputs if (x.get_attribute("type") or "").lower() == "password" and x.is_displayed()), None)
        if user_el is None or pass_el is None:
            raise RuntimeError("Could not find visible login inputs")
        user_el.clear()
        user_el.send_keys(email)
        pass_el.clear()
        pass_el.send_keys(password)

        submit = driver.find_element(By.ID, "integration_loginBtn")
        driver.execute_script("arguments[0].click()", submit)
        time.sleep(60)

        (OUT / "after_login.html").write_text(driver.page_source, encoding="utf-8")
        driver.save_screenshot(str(OUT / "after_login.png"))
        events = network_events(driver)
        (OUT / "network.json").write_text(json.dumps(events, ensure_ascii=False, indent=2), encoding="utf-8")
        (OUT / "browser.json").write_text(json.dumps(driver.get_log("browser"), ensure_ascii=False, indent=2), encoding="utf-8")
        print("FINAL_URL", driver.current_url)
        print("TITLE", driver.title)
        print("EVENTS", len(events))
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
