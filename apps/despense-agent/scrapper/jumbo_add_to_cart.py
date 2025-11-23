import asyncio
import json
import sys
from playwright.async_api import async_playwright

# Config
STATE_FILE = 'jumbo_cart_state.json'

# Credentials
USER_EMAIL = "hormann.nicolas@gmail.com"
USER_PASS = "Password1"


async def process_product(context, item):
    name = item['name']

    print(f"[{name}] Starting process...")
    page = await context.new_page()

    try:
        await page.goto("https://www.jumbo.cl/", timeout=60000)

        # Search Input
        search_input = page.locator('input.new-header-search-input')
        await search_input.wait_for(state="visible", timeout=30000)

        # Handle overlays
        try:
            close_btn = page.locator(
                'button[aria-label="Cerrar"], .modal-close, .close-modal, .new-modal-overlay').first
            if await close_btn.is_visible():
                await close_btn.click(force=True)
        except:
            pass

        await search_input.click(force=True)
        await search_input.fill(name)
        await page.keyboard.press("Enter")

        # Wait for results
        item_selector = 'div[data-cnstrc-item-id]'
        try:
            await page.wait_for_selector(item_selector, timeout=15000)
        except:
            print(f"[{name}] Timeout waiting for search results.")
            return

        # Get all items
        items = await page.locator(item_selector).all()

        if not items:
            print(f"[{name}] No items found.")
            return

        valid_items = []
        for p in items:
            if not await p.is_visible():
                continue

            # Skip sponsored
            if await p.locator('text=Patrocinado').count() > 0:
                continue

            valid_items.append(p)

        if not valid_items:
            print(f"[{name}] No valid (non-sponsored) items found.")
            return

        # Select Item (Prioritize Offer)
        selected_item = None

        for p in valid_items:
            # Check for offer indicators
            has_offer = await p.locator('.bg-bgflagoferta').count() > 0
            has_discount = await p.locator('.line-through').count() > 0

            if has_offer or has_discount:
                selected_item = p
                print(f"[{name}] Selected item on offer.")
                break

        if not selected_item:
            selected_item = valid_items[0]
            print(f"[{name}] Selected standard item.")

        # Scroll
        await selected_item.scroll_into_view_if_needed()

        # Logic to Add
        add_btn = selected_item.locator(
            'button.product-add-cart, button:has-text("Agregar")').first
        plus_btn = selected_item.locator(
            'button.product-change-quantity-btn.add, i.jumbo-icon-plus').first

        if await plus_btn.is_visible():
            is_icon = await plus_btn.evaluate("el => el.tagName === 'I'")
            if is_icon:
                plus_btn = plus_btn.locator('xpath=..')

        if await add_btn.is_visible():
            print(f"[{name}] Adding to cart...")
            await add_btn.click()
            # Just wait a bit to ensure action is registered
            await asyncio.sleep(1)

        elif await plus_btn.is_visible():
            print(f"[{name}] Already in cart. Adding 1 more.")
            await plus_btn.click()
            await asyncio.sleep(0.5)
        else:
            print(f"[{name}] Could not find add/plus button.")
            return

        print(f"[{name}] Done.")

    except Exception as e:
        print(f"Error processing {name}: {e}")
    finally:
        await page.close()


async def add_to_cart(shopping_list: list):
    """
    Main function to add items to cart.
    Accepts a list of dicts: [{'name': 'product name'}, ...]
    Returns the cart URL.
    """
    if not shopping_list:
        return "No items provided"

    async with async_playwright() as p:
        # Headless=False for debugging, but in docker we might need True + xvfb or just True if it works.
        # Ideally, we pass headless=True in production.
        # But for now, let's keep False if we are running locally with GUI, or True for Docker.
        # Since this runs in a container, we MUST set headless=True unless we have a display server.
        # Setting headless=True for container compatibility.
        browser = await p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-setuid-sandbox'])
        context = await browser.new_context()
        page = await context.new_page()

        print(f"Navigating to Jumbo Login...")
        await page.goto("https://www.jumbo.cl/", timeout=60000)

        # --- COOKIES ---
        try:
            await page.wait_for_selector('#onetrust-accept-btn-handler', timeout=5000)
            await page.click('#onetrust-accept-btn-handler')
            print("Cookies accepted.")
        except:
            pass

        # --- LOGIN ---
        try:
            print("Clicking login button...")
            login_btn = page.locator('button.login-register-button')
            await login_btn.click()

            await page.wait_for_selector('.login-wrap', timeout=10000)

            print(f"Logging in as {USER_EMAIL}...")

            email_input = page.locator(
                'input[name="email"][placeholder*="jumbito"]').first
            if not await email_input.is_visible():
                email_input = page.locator('input[name="email"]').first

            await email_input.click()
            await email_input.fill("")
            await email_input.type(USER_EMAIL, delay=100)
            await page.keyboard.press('Tab')

            pass_input = page.locator('input[name="Clave"]')
            await pass_input.click()
            await pass_input.fill("")
            await pass_input.type(USER_PASS, delay=100)
            await page.keyboard.press('Tab')

            await email_input.evaluate('el => el.dispatchEvent(new Event("input", { bubbles: true }))')
            await pass_input.evaluate('el => el.dispatchEvent(new Event("input", { bubbles: true }))')

            await asyncio.sleep(1)

            submit_btn = page.locator('button:has-text("Iniciar sesión")')
            if await submit_btn.is_visible():
                await submit_btn.click(force=True)
            else:
                await page.keyboard.press('Enter')

            await asyncio.sleep(3)
            print("Login submitted.")

        except Exception as e:
            print(f"Login failed: {e}")

        await page.close()

        # --- PARALLEL ADD ---
        print("Starting parallel product addition...")
        tasks = [process_product(context, item) for item in shopping_list]
        await asyncio.gather(*tasks)

        await context.storage_state(path=STATE_FILE)
        print(f"Session saved to {STATE_FILE}")

        cart_url = "https://www.jumbo.cl/mi-carro"
        await browser.close()

        return cart_url

# Compatibility with command line execution
if __name__ == "__main__":
    if len(sys.argv) > 1:
        try:
            input_list = json.loads(sys.argv[1])
            if isinstance(input_list, list):
                normalized_list = []
                for item in input_list:
                    if isinstance(item, str):
                        normalized_list.append({"name": item})
                    elif isinstance(item, dict) and 'name' in item:
                        normalized_list.append(item)

                url = asyncio.run(add_to_cart(normalized_list))
                print(url)
            else:
                print("Error: Argument must be a list")
        except Exception as e:
            print(f"Error parsing arguments: {e}")
    else:
        print("Usage: python jumbo_add_to_cart.py '[{\"name\": \"...\"}]'")
