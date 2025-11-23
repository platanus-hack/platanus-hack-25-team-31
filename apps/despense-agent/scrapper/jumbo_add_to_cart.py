import json
import time
import re
import math
import sys
from playwright.sync_api import sync_playwright

# Database of scraped products
DATA_FILE = 'apps/despense-agent/scrapper/products_data.json'

# Credentials
USER_EMAIL = "hormann.nicolas@gmail.com"
USER_PASS = "Password1"

# Default Shopping List (Empty by default, populated via args)
SHOPPING_LIST = []

# Override with args if provided
if len(sys.argv) > 1:
    try:
        # Expecting JSON string as first arg
        input_list = json.loads(sys.argv[1])
        if isinstance(input_list, list):
            SHOPPING_LIST = input_list
            print(f"Loaded {len(SHOPPING_LIST)} items from arguments.")
    except Exception as e:
        print(f"Error parsing arguments: {e}")

if not SHOPPING_LIST:
    print(
        "Warning: No products provided in arguments. Usage: python script.py '[{\"name\": \"...\"}]'")
    # For debugging purposes, we can keep a small fallback or just exit
    # print("Using fallback list for testing...")
    # SHOPPING_LIST = [...]


def parse_quantity_value(qty_str):
    qty_str = qty_str.lower().strip()
    if 'kg' in qty_str:
        val = float(re.search(r'(\d+(\.\d+)?)', qty_str).group(1))
        return val * 1000, 'g'
    elif 'g' in qty_str and 'mg' not in qty_str:
        val = float(re.search(r'(\d+(\.\d+)?)', qty_str).group(1))
        return val, 'g'
    elif 'l' in qty_str and 'ml' not in qty_str:
        val = float(re.search(r'(\d+(\.\d+)?)', qty_str).group(1))
        return val * 1000, 'ml'
    elif 'ml' in qty_str or 'cc' in qty_str:
        val = float(re.search(r'(\d+(\.\d+)?)', qty_str).group(1))
        return val, 'ml'
    else:
        match = re.search(r'(\d+(\.\d+)?)', qty_str)
        if match:
            return float(match.group(1)), 'unit'
        return 1.0, 'unit'


def find_best_product(product_name, target_amount, target_unit_type, products_db):
    candidates = [p for p in products_db if p['search_term'].lower()
                  == product_name.lower()]
    if not candidates:
        return None, 0, 0

    compatible_candidates = []
    for p in candidates:
        size, unit = parse_quantity_value(p['quantity'])
        if target_unit_type == 'unit' or unit == target_unit_type:
            compatible_candidates.append((p, size))

    if not compatible_candidates:
        if candidates:
            first_p = candidates[0]
            size, _ = parse_quantity_value(first_p['quantity'])
            return first_p, size, 1
        return None, 0, 0

    best_product = None
    min_diff = float('inf')
    best_pack_size = 0

    for p, size in compatible_candidates:
        diff = abs(size - target_amount)
        if diff < min_diff:
            min_diff = diff
            best_product = p
            best_pack_size = size

    if best_pack_size == 0:
        units_to_buy = 1
    else:
        units_to_buy = math.ceil(target_amount / best_pack_size)

    return best_product, best_pack_size, int(units_to_buy)


def run():
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            products_db = json.load(f)
    except FileNotFoundError:
        print(f"Error: {DATA_FILE} not found.")
        return

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        print(f"Navigating to Jumbo Login...")
        page.goto("https://www.jumbo.cl/", timeout=60000)

        # --- COOKIES ---
        try:
            # Wait a bit for banner
            time.sleep(2)
            page.wait_for_selector(
                '#onetrust-accept-btn-handler', timeout=5000)
            page.click('#onetrust-accept-btn-handler')
            print("Cookies accepted.")
            time.sleep(1)
        except:
            pass

        # --- LOGIN ---
        try:
            print("Clicking login button...")
            # Selector from user: button with aria-label "Regístrate" or class login-register-button
            login_btn = page.locator('button.login-register-button')
            login_btn.click()

            # Wait for modal/inputs
            # Wait specifically for the wrapper first
            page.wait_for_selector('.login-wrap', timeout=10000)
            time.sleep(1)

            print(f"Logging in as {USER_EMAIL}...")

            # EMAIL INTERACTION
            # Use more specific selector. There are multiple email inputs (footer subscription etc).
            # The login one is inside .login-wrap or has specific placeholder
            email_input = page.locator(
                'input[name="email"][placeholder*="jumbito"]').first
            email_input.click()  # Focus
            time.sleep(0.2)
            email_input.fill("")
            # Type slowly char by char
            email_input.type(USER_EMAIL, delay=150)
            page.keyboard.press('Tab')  # Tab out to trigger blur/validation
            time.sleep(0.5)

            # PASSWORD INTERACTION
            pass_input = page.locator('input[name="Clave"]')
            pass_input.click()
            time.sleep(0.2)
            pass_input.fill("")
            pass_input.type(USER_PASS, delay=150)
            page.keyboard.press('Tab')
            time.sleep(1)

            # Trigger events manually as backup
            email_input.evaluate(
                'el => el.dispatchEvent(new Event("input", { bubbles: true }))')
            email_input.evaluate(
                'el => el.dispatchEvent(new Event("change", { bubbles: true }))')
            email_input.evaluate(
                'el => el.dispatchEvent(new Event("blur", { bubbles: true }))')

            pass_input.evaluate(
                'el => el.dispatchEvent(new Event("input", { bubbles: true }))')
            pass_input.evaluate(
                'el => el.dispatchEvent(new Event("change", { bubbles: true }))')

            time.sleep(1)

            # Submit
            submit_btn = page.locator('button:has-text("Iniciar sesión")')

            if submit_btn.is_visible():
                # Check if disabled
                # Sometimes class includes 'disabled-btn'
                class_attr = submit_btn.get_attribute("class") or ""
                if "disabled" in class_attr or submit_btn.get_attribute("disabled") is not None:
                    print(
                        "Submit button is disabled. Trying to force enable or re-type...")
                    # Force click anyway? Or retry typing?
                    # Usually blur events trigger validation
                    pass

                submit_btn.click(force=True)
            else:
                # Fallback enter
                page.keyboard.press('Enter')

            time.sleep(5)  # Wait for auth process
            print("Login submitted (assuming success).")

        except Exception as e:
            print(f"Login failed or skipped: {e}")
            # Continue anyway? Depends if cart requires login. Jumbo usually allows guest cart but better with login.

        # --- ADD PRODUCTS ---
        for item in SHOPPING_LIST:
            name = item['name']
            target = item['target']
            unit = item['unit_type']

            product, pack_size, count = find_best_product(
                name, target, unit, products_db)

            if not product:
                print(f"Skipping {name}: No suitable product found.")
                continue

            print(f"Processing {name}: Buying {count} x '{product['name']}'")

            try:
                # Navigate
                page.goto(product['link'], timeout=60000,
                          wait_until="domcontentloaded")

                # Add to Cart Button
                # Try to wait for button to be visible
                try:
                    page.wait_for_selector(
                        'button.product-add-cart, button.product-change-quantity-btn.add, button:has-text("Agregar")', timeout=5000)
                except:
                    pass

                add_btn = page.locator('button.product-add-cart').first
                if not add_btn.is_visible():
                    add_btn = page.locator('button:has-text("Agregar")').first

                if add_btn.is_visible():
                    # Scroll to it
                    add_btn.scroll_into_view_if_needed()
                    add_btn.click()
                    print("  Added to cart (1st unit).")

                    # If more than 1 needed
                    if count > 1:
                        time.sleep(2)

                        # Increment Button
                        plus_btn = page.locator(
                            'button.product-change-quantity-btn.add').first
                        if not plus_btn.is_visible():
                            plus_btn = page.locator(
                                'i.jumbo-icon-plus').locator('xpath=..').first

                        for i in range(count - 1):
                            if plus_btn.is_visible():
                                plus_btn.click()
                                print(f"  +1 ({i+2}/{count})")
                                time.sleep(0.7)
                            else:
                                print("  Plus button lost.")
                                break
                else:
                    # Maybe already in cart? Check for plus button directly
                    plus_btn = page.locator(
                        'button.product-change-quantity-btn.add').first
                    if not plus_btn.is_visible():
                        plus_btn = page.locator(
                            'i.jumbo-icon-plus').locator('xpath=..').first

                    if plus_btn.is_visible():
                        print("  Already in cart. Adjusting quantity...")
                        for i in range(count):
                            plus_btn.click()
                            print(f"  +1 (Adjusting)")
                            time.sleep(0.7)
                    else:
                        # Debug: take screenshot if fail
                        page.screenshot(path=f"debug_{name}.png")
                        print(
                            "  'Add to cart' button not found (Out of stock?). Screenshot saved.")

                time.sleep(1)

            except Exception as e:
                print(f"Error processing {name}: {e}")

        browser.close()
        print("Exit code: 0")


if __name__ == "__main__":
    run()
