import re
import json
import time
from playwright.sync_api import sync_playwright

# List of products from seed.ts
PRODUCTS = [
    'Arroz', 'Fideos', 'Aceite', 'Leche', 'Azúcar', 'Sal', 'Harina', 'Atún',
    'Avena', 'Quinoa', 'Aceite de Oliva', 'Yogurt Griego', 'Huevos', 'Pollo',
    'Lentejas', 'Garbanzos', 'Tofu', 'Leche de Almendras'
]

OUTPUT_FILE = 'apps/despense-agent/scrapper/products_data.json'


def parse_quantity(title):
    """
    Parses the quantity from the product title.
    """
    # Common pattern in Jumbo: "Granola Quaker Avena, Miel y Almendras 320 g"
    # Often the unit is at the end.

    # Check for comma separated unit (less common in Jumbo titles provided but good check)
    if ',' in title:
        parts = title.split(',')
        potential_quantity = parts[-1].strip()
        match = re.search(
            r'\d+\s*(?:kg|g|L|ml|cc|un|pack|botella|oz)', potential_quantity, re.IGNORECASE)
        if match:
            return potential_quantity

    # Check at the end of string if no comma
    # e.g. "... 320 g" or "... 1 L"
    match = re.search(
        r'(\d+\s*(?:kg|g|L|ml|cc|un|pack|botella|oz))\s*$', title, re.IGNORECASE)
    if match:
        return match.group(1)

    return 'unidad'


def run():
    data = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        print(f"Navigating to https://www.jumbo.cl/")
        page.goto("https://www.jumbo.cl/", timeout=60000)

        # Accept Cookies
        # Selector from user: #onetrust-accept-btn-handler
        try:
            page.wait_for_selector(
                '#onetrust-accept-btn-handler', timeout=5000)
            page.click('#onetrust-accept-btn-handler')
            print("Cookies accepted.")
        except:
            print("Cookie banner not found or already accepted.")

        # Wait for search input
        # Selector from user: input.new-header-search-input
        search_input_selector = 'input.new-header-search-input'
        page.wait_for_selector(search_input_selector, timeout=30000)

        for product_name in PRODUCTS:
            print(f"Searching for: {product_name}")

            try:
                search_input = page.locator(search_input_selector)

                # Clear logic: select all and delete, or fill empty
                # Sometimes click is not enough to focus or select all
                search_input.click()
                search_input.fill("")  # Clear explicitly
                search_input.fill(product_name)
                page.keyboard.press("Enter")

                # Wait for results
                # Selector for items: user mentioned a div with data-cnstrc-item-id
                item_selector = 'div[data-cnstrc-item-id]'

                # Wait a bit for results to load
                try:
                    # Wait for network idle can help too
                    page.wait_for_load_state("networkidle")
                    time.sleep(3)  # Explicit wait for dynamic content
                    page.wait_for_selector(item_selector, timeout=10000)
                except:
                    print(f"Timeout waiting for results for {product_name}")

                # Get items again after search
                items = page.locator(item_selector).all()

                if not items:
                    print(f"No items found for {product_name}")
                    # Attempt retry or skip
                    continue

                # Take top 3
                top_items = items[:3]

                product_results = []

                for item in top_items:
                    # Extract data
                    try:
                        # Check if item is visible to avoid errors
                        if not item.is_visible():
                            item.scroll_into_view_if_needed()

                        # Name
                        # Selector from user: .product-card-name
                        title_el = item.locator('.product-card-name').first
                        title = title_el.inner_text() if title_el.count() > 0 else "Unknown Title"

                        # Link
                        # Selector from user: a inside the card
                        link_el = item.locator('a').first
                        href = link_el.get_attribute('href')
                        full_link = f"https://www.jumbo.cl{href}" if href else ""

                        # Quantity parsing
                        quantity = parse_quantity(title)

                        product_results.append({
                            "search_term": product_name,
                            "name": title,
                            "link": full_link,
                            "quantity": quantity
                        })

                    except Exception as e:
                        print(f"Error extracting item for {product_name}: {e}")
                        continue

                print(
                    f"Found {len(product_results)} results for {product_name}")
                data.extend(product_results)

                # Small delay
                time.sleep(1)

            except Exception as e:
                print(f"Error searching for {product_name}: {e}")
                # Try to recover by going home or just clearing search?
                # Jumbo search usually stays on same page layout, so we might just need to clear input
                # If navigation failed completely, go home
                if "Target closed" in str(e):
                    raise e
                page.goto("https://www.jumbo.cl/")

        browser.close()

    # Save to JSON
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Done. Data saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    run()
