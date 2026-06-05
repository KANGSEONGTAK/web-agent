from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from typing import Optional, List, Dict, Any
import time


class BrowserController:
    def __init__(self, headless: bool = False):
        self.headless = headless
        self.driver: Optional[webdriver.Chrome] = None

    def start(self):
        chrome_options = Options()
        if self.headless:
            chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        
        self.driver = webdriver.Chrome(options=chrome_options)

    def stop(self):
        if self.driver:
            self.driver.quit()

    def navigate(self, url: str):
        self.driver.get(url)
        time.sleep(1)

    def get_page_content(self) -> str:
        return self.driver.page_source

    def get_text_content(self) -> str:
        return self.driver.find_element(By.TAG_NAME, "body").text

    def get_interactive_elements(self) -> List[Dict[str, Any]]:
        elements = []
        
        # Get all input fields
        inputs = self.driver.find_elements(By.CSS_SELECTOR, "input, textarea, select")
        for el in inputs:
            try:
                elements.append({
                    "type": "input",
                    "tag": el.tag_name,
                    "input_type": el.get_attribute("type") or "text",
                    "name": el.get_attribute("name") or el.get_attribute("id") or "",
                    "placeholder": el.get_attribute("placeholder") or "",
                    "id": el.get_attribute("id") or "",
                    "visible": el.is_displayed()
                })
            except:
                pass

        # Get all buttons and links
        buttons = self.driver.find_elements(By.CSS_SELECTOR, "button, a[href]")
        for el in buttons:
            try:
                elements.append({
                    "type": "clickable",
                    "tag": el.tag_name,
                    "text": el.text,
                    "href": el.get_attribute("href") or "",
                    "id": el.get_attribute("id") or "",
                    "visible": el.is_displayed()
                })
            except:
                pass

        return elements

    def fill_input(self, selector: str, value: str):
        element = self.driver.find_element(By.CSS_SELECTOR, selector)
        element.clear()
        element.send_keys(value)
        time.sleep(0.5)

    def click_element(self, selector: str):
        element = self.driver.find_element(By.CSS_SELECTOR, selector)
        element.click()
        time.sleep(0.5)

    def take_screenshot(self, path: str):
        self.driver.save_screenshot(path)

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()
