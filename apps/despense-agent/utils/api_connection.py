
import requests
from dotenv import load_dotenv
import os
import logging
import math

load_dotenv()

logger = logging.getLogger(__name__)


backend_url = os.getenv("BACKEND_URL")

headers = {
    "Content-Type": "application/json",
    "X-API-TOKEN": os.getenv("X_API_TOKEN_DEV")
}


def get_user_by_phone(phone: str):
    """
    Obtiene un usuario por número de teléfono.
    
    Returns:
        Diccionario con los datos del usuario, o None si no existe (404)
    
    Raises:
        requests.HTTPError: Para errores HTTP distintos de 404
    """
    response = requests.get(f"{backend_url}/api/users/phone/{phone}", headers=headers)
    
    # Si es 404, el usuario no existe
    if response.status_code == 404:
        return None
    
    # Para otros errores, lanzar excepción
    response.raise_for_status()
    
    return response.json()

def create_user(user_data: dict):
    """
    Crea un nuevo usuario en el backend.
    
    Args:
        user_data: Diccionario con los datos del usuario en formato:
            {
                "phoneNumber": "+56912345678",
                "name": "Juan Pérez",
                "home": {
                    "income": 1500000.50,
                    "foodType": "balanced",
                    "people": [
                        {
                            "age": 35,
                            "eatingRate": "normal",
                            "gender": "male",
                            "sportRate": "high"
                        },
                        ...
                    ]
                }
            }
    
    Returns:
        Respuesta del servidor con el usuario creado
    """
    print(f"Creating user AAAAACAAAAA: {user_data}")
    response = requests.post(
        f"{backend_url}/api/users/onboarding",
        headers=headers,
        json=user_data
    )
    response.raise_for_status()
    return response.json()

def get_all_products_for_user(user_id: str):
    return requests.get(f"{backend_url}/api/user-products/agent-all/{user_id}", headers=headers).json()


def get_user_buy_products(user_id: str):
    """
    Obtiene los productos sugeridos para comprar de un usuario,
    aplicando formato a los valores numéricos.
    """
    response = requests.get(f"{backend_url}/api/user-products/buy-products/user/{user_id}", headers=headers).json()
    result = []
    for product in response:
        nombre = product.get('name')
        estimado = math.floor(product.get('estimatedStock', 0))
        sugerido = math.ceil(product.get('recommendedBuyQuantity', 0))
        result.append({
            'name': nombre,
            'estimatedStock': estimado,
            'recommendedBuyQuantity': sugerido
        })
    return result


def analizar_estado_stock(productos):
    """
    Analiza el estado del stock de los productos basado en estimatedStock y criticalStock,
    mapeando la unidad de medida a un string legible.

    Args:
        productos: Lista de productos con formato del backend:
            - name: nombre del producto
            - estimatedStock: stock estimado
            - criticalStock: stock crítico
            - unit: unidad de medida

    Returns:
        Lista de productos con estado analizado:
            - name: nombre del producto
            - estado_stock: "nivel bajo", "nivel medio", o "nivel alto"
            - cantidad: string formateado con estimatedStock y unidad mapeada
    """
    # Print para verificar que se está ejecutando la versión correcta
    print("=" * 60)
    print("🔍 [VERIFICACIÓN] analizar_estado_stock ejecutándose...")
    print("=" * 60)
    
    unidad_map = {
        "unit": "Unidad",
        "kilogram": "Kg",
        "liter": "L",
        "pack": "Pack"
    }
    print(f"🔍 [VERIFICACIÓN] Unidad map definido: {unidad_map}")
    resultado = []
    for prod in productos:
        nombre = prod.get("name", "")
        estimated = prod.get("estimatedStock", 0)
        critical = prod.get("criticalStock", 0)
        unidad_original = prod.get("unit", "").strip()
        unidad_cod = unidad_original.lower()
        categoria = prod.get("category", "")

        
        # Selecciona el valor mapeado o usa la unidad original capitalizada si no está en el mapeo
        unidad = unidad_map.get(unidad_cod, unidad_original.capitalize() if unidad_original else "Unidad")
        
        # Si la unidad es "Unidad" (o "unit"), redondear hacia abajo el estimated
        if unidad == "Unidad" or unidad_cod == "unit":
            estimated = math.floor(estimated)
        
        # Print para debugging inmediato (todos los productos para verificar)
        print(f"🔍 [MAPEO] Producto: {nombre}")
        print(f"   Unidad original: '{unidad_original}' (tipo: {type(unidad_original)})")
        print(f"   Unidad código (lower): '{unidad_cod}'")
        print(f"   Unidad mapeada: '{unidad}'")
        print(f"   Estimated original: {prod.get('estimatedStock', 0)}")
        print(f"   Estimated después de floor (si aplica): {estimated}")
        print(f"   ¿Está en map? {unidad_cod in unidad_map}")
        if unidad_cod in unidad_map:
            print(f"   Valor del map: '{unidad_map[unidad_cod]}'")
        
        # Log para debugging (solo el primer producto para no saturar)
        if not resultado:
            logger.info(f"🔍 Mapeo de unidad: '{unidad_original}' -> '{unidad}' (código: '{unidad_cod}')")
            logger.info(f"🔍 Cantidad formateada: {estimated} {unidad}")
        try:
            if critical > 0:
                percent = (critical / estimated) * 100
            else:
                percent = 0
        except Exception:
            percent = 0
        if percent <= 30:
            estado = "nivel bajo"
        elif 30 <= percent <= 60:
            estado = "nivel medio"
        else:
            estado = "nivel alto"
        # Asegurar que siempre sea "Unidad" (singular) y no "Unidades"
        if unidad.lower() in ["unidades", "units"]:
            unidad = "Unidad"
        
        cantidad_formateada = f"{estimated} {unidad}"
        
        # VERIFICACIÓN CRÍTICA: Asegurar que la unidad mapeada se está usando
        if unidad_cod in unidad_map and unidad != unidad_map[unidad_cod]:
            print(f"⚠️ [ERROR] El mapeo no se aplicó correctamente!")
            print(f"   Unidad código: '{unidad_cod}'")
            print(f"   Valor esperado del map: '{unidad_map[unidad_cod]}'")
            print(f"   Valor actual de unidad: '{unidad}'")
            # Forzar el valor correcto
            unidad = unidad_map[unidad_cod]
            cantidad_formateada = f"{estimated} {unidad}"
            print(f"   ✅ Corregido a: '{cantidad_formateada}'")
        
        resultado.append({
            "name": nombre,
            "category": categoria,
            "estado_stock": estado,
            "cantidad": cantidad_formateada,
            "unidad": unidad # Incluimos la unidad limpia
        })
        
        # Print para debugging inmediato (solo el primer producto)
        if len(resultado) == 1:
            print(f"🔍 [DEBUG] analizar_estado_stock - Producto: {nombre}")
            print(f"🔍 [DEBUG] Unidad original: '{unidad_original}' -> Mapeada: '{unidad}'")
            print(f"🔍 [DEBUG] Estimated después de floor: {estimated}")
            print(f"🔍 [DEBUG] Cantidad formateada FINAL: '{cantidad_formateada}'")
            print(f"🔍 [DEBUG] Verificación: cantidad contiene '{unidad}'? {unidad in cantidad_formateada}")
    
    return resultado



def bulk_upload_products(user_id: str, movement_type: str, source_type: str, products: list):
    """
    Sube productos en bulk al backend.
    
    Args:
        user_id: ID del usuario
        movement_type: Tipo de movimiento - "in", "out", o "update"
        source_type: Tipo de fuente - "receipt" u otro valor
        products: Lista de productos con formato:
            [
                {
                    "name": "nombre del producto",
                    "quantity": cantidad (número),
                    "sourceText": "texto original de donde viene el producto",
                    "measurementUnit": "unidad de medida" (ej: "litro", "L", "unidad", "kg", "gr")
                },
                ...
            ]
    
    Returns:
        Respuesta del servidor
    """
    if movement_type not in ["in", "out", "adjustment"]:
        raise ValueError(f"movement_type debe ser 'in', 'out' o 'adjustment', recibido: {movement_type}")
    
    payload = {
        "movementType": movement_type,
        "sourceType": source_type,
        "products": products
    }
    
    response = requests.post(
        f"{backend_url}/api/user-products/bulk-upload/{user_id}",
        headers=headers,
        json=payload
    )
    
    # Verificar si la respuesta fue exitosa
    response.raise_for_status()
    
    return response.json()


def generate_supermarket_cart(user_id: str, products: list[str]):
    """
    Genera un carrito de supermercado enviando una lista de productos.
    
    Args:
        user_id: ID del usuario
        products: Lista de nombres de productos (strings)
        
    Returns:
        Respuesta del servidor (debería contener la URL del carrito)
    """
    # Asegurar que products sea una lista de strings
    if not isinstance(products, list):
        products = [str(products)]
    
    # IMPORTANTE: Usamos POST para generar el carrito.
    try:
        response = requests.post(
            f"{backend_url}/api/users/{user_id}/cart",
            headers=headers,
            json=products
        )
        
        response.raise_for_status()
        
        # Manejo robusto: si la respuesta es JSON válida, devolverla como dict
        try:
            return response.json()
        except ValueError: # requests.exceptions.JSONDecodeError en versiones nuevas, ValueError en viejas
            # Si la respuesta no es JSON, retornar el texto plano (probablemente la URL)
            logger.warning(f"Respuesta no es JSON, devolviendo como texto plano: {response.text[:50]}...")
            return response.text.strip()
            
    except Exception as e:
        logger.error(f"Error en generate_supermarket_cart: {e}")
        if 'response' in locals():
            logger.error(f"Response status: {response.status_code}")
            logger.error(f"Response text: {response.text}")
        raise e

def get_dashboard_pin(phone: str):
    """
    Obtiene un PIN de acceso para el dashboard.
    
    Args:
        phone: Número de teléfono del usuario (formato +569...)
        
    Returns:
        Diccionario con el PIN (ej: {"pin": "1234"})
    """
    # El endpoint espera {"phone": "..."}
    payload = {"phone": phone}
    
    response = requests.post(
        f"{backend_url}/api/auth/get-pin",
        headers=headers,
        json=payload
    )
    
    response.raise_for_status()
    return response.json()
