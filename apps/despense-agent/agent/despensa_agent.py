"""
Agente de Despensa usando LangGraph.

Simula la gestión de inventario de una despensa mediante un agente conversacional.
Soporta entradas multimodales: texto, audio e imágenes.
Arquitectura: Super Orquestador que decide entre Agente de Onboarding y Agente de Despensa.
"""

import os
import base64
import tempfile
import json
import threading
from typing import TypedDict, Annotated, Literal, Optional, List, Dict, Any

# Importar pydub para conversión de audio (opcional, solo si está instalado)
try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
except ImportError:
    PYDUB_AVAILABLE = False

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, BaseMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from langgraph.graph.message import add_messages
from openai import OpenAI

import sys
from pathlib import Path

# Agregar el directorio padre al path para importaciones
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.settings import Settings
from utils.logger import get_logger
from .prompts import SYSTEM_PROMPT
from services.whatsapp_service import WhatsAppService

logger = get_logger(__name__)

# Importar funciones de conexión con el backend
try:
    from utils.api_connection import (
        get_user_by_phone,
        get_all_products_for_user,
        get_user_buy_products,
        analizar_estado_stock,
        create_user,
        bulk_upload_products,
        generate_supermarket_cart,
        get_dashboard_pin
    )
    BACKEND_AVAILABLE = True
except ImportError as e:
    logger.warning(f"No se pudo importar api_connection: {e}")
    BACKEND_AVAILABLE = False

# Variable global para almacenar el user_id y phone durante la ejecución
_current_user_id: Optional[str] = None
_current_user_phone: Optional[str] = None

# Variable global para almacenar el estado de onboarding por teléfono
_onboarding_data: Dict[str, Dict[str, Any]] = {}  # {phone: {datos_onboarding}}

# Cargar configuración
try:
    settings = Settings.load()
    openai_client = OpenAI(api_key=settings.openai.api_key)
    whatsapp_service = WhatsAppService(settings.whatsapp)
except Exception as e:
    logger.error(f"Error cargando configuración: {e}")
    raise

# ============================================================================
# EXTRACCIÓN ESTRUCTURADA Y UTILIDADES
# ============================================================================
def normalizar_nombre_producto(nombre_original: str) -> str | None:
    """Normaliza el nombre de un producto a una versión genérica usando LLM."""
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    prompt = f"""Normaliza el siguiente nombre de producto de una boleta a su versión genérica y estándar.
Nombre original: "{nombre_original}"
Instrucciones:
1. Convierte abreviaciones a palabras completas (ej: "jgo" -> "jugo")
2. Elimina marcas específicas (ej: "guayarauco")
3. Usa nombres genéricos comunes (ej: "jugo de uva", "aceite de girasol")
4. Mantén la estructura básica
5. Si es irreconocible o no es alimento, responde "IGNORAR"
Responde SOLO con el nombre normalizado o "IGNORAR"."""
    
    try:
        response = llm.invoke(prompt)
        nombre_normalizado = response.content.strip().lower()
        if "ignorar" in nombre_normalizado or not nombre_normalizado:
            return None
        return nombre_normalizado.replace('"', '').replace("'", "").strip()
    except Exception as e:
        logger.error(f"Error normalizando nombre '{nombre_original}': {e}")
        return None

def normalizar_unidad(unidad: str) -> str:
    """Normaliza unidades de conteo genéricas a 'unidad'."""
    unidad_lower = unidad.lower().strip()
    unidades_conteo = {
        "lata", "latas", "lata.", "bolsa", "bolsas", "bolsa.", "paquete", "paquetes", "paquete.",
        "botella", "botellas", "botella.", "unidad", "unidades", "unidad.", "pieza", "piezas",
        "envase", "envases", "caja", "cajas", "pack", "packs", "un", "un.", "uds", "ud."
    }
    if unidad_lower in unidades_conteo:
        return "unidad"
    return unidad

def agrupar_productos_duplicados(productos: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    """Agrupa productos duplicados por nombre y suma sus cantidades."""
    productos_agrupados = {}
    
    for producto in productos:
        nombre_original = producto.get("nombre", "").strip()
        nombre_normalizado = " ".join(nombre_original.lower().strip().split())
        cantidad = producto.get("cantidad")
        unidad_original = producto.get("unidad", "unidad")
        unidad = normalizar_unidad(unidad_original)
        
        if not nombre_normalizado: continue
        
        if nombre_normalizado in productos_agrupados:
            existente = productos_agrupados[nombre_normalizado]
            cant_existente = existente.get("cantidad")
            unidad_existente = normalizar_unidad(existente.get("unidad", "unidad"))
            
            # Lógica de unidad preferida
            unidad_final = unidad if unidad != "unidad" else unidad_existente
            if unidad_existente != "unidad" and unidad == "unidad": unidad_final = unidad_existente
            elif unidad != "unidad" and unidad_existente == "unidad": unidad_final = unidad
            
            # Nombre más largo/descriptivo
            nombre_final = nombre_original if len(nombre_original) > len(existente.get("nombre", "")) else existente.get("nombre")
            
            # Sumar cantidades
            nueva_cantidad = None
            if cantidad is not None and cant_existente is not None:
                nueva_cantidad = cant_existente + cantidad
            elif cantidad is not None:
                nueva_cantidad = cantidad
            elif cant_existente is not None:
                nueva_cantidad = cant_existente
                
            productos_agrupados[nombre_normalizado].update({
                "cantidad": nueva_cantidad,
                "unidad": unidad_final,
                "nombre": nombre_final
            })
        else:
            prod_nuevo = producto.copy()
            prod_nuevo["unidad"] = unidad
            productos_agrupados[nombre_normalizado] = prod_nuevo
            
    return list(productos_agrupados.values())

def extraer_productos_desde_texto(texto: str) -> Dict[str, Any]:
    """Extrae información estructurada de productos y cantidades desde texto."""
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    prompt = f"""Analiza el texto y extrae productos de despensa.
Texto: "{texto}"
Extrae:
1. ACCIÓN: "UPDATE", "CREATE", "QUERY", "SHOPPING_LIST"
2. PRODUCTOS: [{{"nombre": str, "cantidad": number|null, "unidad": str}}]
3. INTENCIÓN: str
Responde SOLO JSON."""
    
    try:
        response = llm.invoke(prompt)
        content = response.content.strip().replace("```json", "").replace("```", "").strip()
        return json.loads(content)
    except Exception as e:
        logger.error(f"Error extrayendo productos: {e}")
        return {"accion": "QUERY", "productos": [], "intencion": "error"}

# ============================================================================
# LÓGICA DE ONBOARDING
# ============================================================================
def extraer_info_onboarding(texto: str, datos_existentes: Dict[str, Any] = None) -> Dict[str, Any]:
    """Extrae información de onboarding desde texto acumulado."""
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    datos_existentes = datos_existentes or {}
    
    prompt = f"""Analiza el texto del usuario (múltiples mensajes) para onboarding.
Texto: "{texto}"
Datos actuales: {json.dumps(datos_existentes, ensure_ascii=False)}
Extrae/Actualiza respetando ESTRICTAMENTE los valores permitidos:
1. name (str)
2. home.income (number)
3. home.foodType: SOLO uno de [process_food, vegetarian, healthy, balanced, other]
4. home.people (list of {{age, eatingRate, gender, sportRate}})
   - gender: SOLO [male, female, other]
   - sportRate: SOLO [low, normal, high]
   - eatingRate: SOLO [low, normal, high]

NOTA: Si el usuario dice "vegeratian" o similar, asume "vegetarian".
MANTÉN lo que ya existe si no se menciona nuevo.
Responde SOLO JSON."""

    try:
        response = llm.invoke(prompt)
        content = response.content.strip().replace("```json", "").replace("```", "").strip()
        info_extraida = json.loads(content)
        
        # Validar y mapear valores antes de fusionar
        def validar_enum(valor, permitidos, default=None):
            if not valor: return default
            valor_str = str(valor).lower().strip()
            # Mapeos comunes de errores/typos
            mapeos = {
                "vegeratian": "vegetarian",
                "procesada": "process_food",
                "procesados": "process_food",
                "hombre": "male", "mujer": "female", "otro": "other",
                "bajo": "low", "medio": "normal", "normal": "normal", "alto": "high"
            }
            valor_final = mapeos.get(valor_str, valor_str)
            if valor_final in permitidos:
                return valor_final
            return default

        # Listas de valores permitidos
        food_types = ["process_food", "vegetarian", "healthy", "balanced", "other"]
        genders = ["male", "female", "other"]
        rates = ["low", "normal", "high"]

        # Limpiar home info
        if info_extraida.get("home"):
            home = info_extraida["home"]
            if home.get("foodType"):
                home["foodType"] = validar_enum(home["foodType"], food_types)
            
            if home.get("people"):
                for persona in home["people"]:
                    if persona.get("gender"):
                        persona["gender"] = validar_enum(persona["gender"], genders)
                    if persona.get("eatingRate"):
                        persona["eatingRate"] = validar_enum(persona["eatingRate"], rates)
                    if persona.get("sportRate"):
                        persona["sportRate"] = validar_enum(persona["sportRate"], rates)

        # Merge inteligente
        resultado = datos_existentes.copy()
        if info_extraida.get("name"): resultado["name"] = info_extraida["name"]
        
        if "home" not in resultado: resultado["home"] = {}
        if info_extraida.get("home"):
            home_new = info_extraida["home"]
            if home_new.get("income") is not None: resultado["home"]["income"] = home_new["income"]
            if home_new.get("foodType"): resultado["home"]["foodType"] = home_new["foodType"]
            if home_new.get("people"): resultado["home"]["people"] = home_new["people"]
            
        return resultado
    except Exception as e:
        logger.error(f"Error onboarding info: {e}")
        return datos_existentes

def validar_info_onboarding_completa(datos: Dict[str, Any], phone_number: str) -> tuple[bool, List[str]]:
    """Valida si el onboarding está completo."""
    faltantes = []
    if not phone_number: faltantes.append("phoneNumber")
    if not datos.get("name"): faltantes.append("name")
    
    if "home" not in datos:
        return False, ["name", "home.income", "home.foodType", "home.people"]
        
    home = datos["home"]
    if home.get("income") is None: faltantes.append("home.income")
    if not home.get("foodType"): faltantes.append("home.foodType")
    
    if not home.get("people"):
        faltantes.append("home.people")
    else:
        for i, p in enumerate(home["people"]):
            if p.get("age") is None: faltantes.append(f"home.people[{i}].age")
            if not p.get("gender"): faltantes.append(f"home.people[{i}].gender")
            if not p.get("eatingRate"): faltantes.append(f"home.people[{i}].eatingRate")
            if not p.get("sportRate"): faltantes.append(f"home.people[{i}].sportRate")
            
    return len(faltantes) == 0, faltantes

def generar_mensaje_onboarding_inicial() -> str:
    return """¡Hola! 👋 Soy *Despensin*, tu asistente inteligente para la gestión de tu despensa y bodega. 🥫✨

Mi misión es ayudarte a mantener el control de tus alimentos, saber qué tienes, qué te falta y evitar el desperdicio. Para poder personalizar tu experiencia y darte las mejores recomendaciones, necesito configurar tu perfil inicial.

Por favor, cuéntame un poco sobre ti y tu hogar en un mensaje de texto o audio. Necesito los siguientes datos:

1.  *Tu nombre completo*.
2.  *Ingresos mensuales aproximados del hogar* (para sugerencias de presupuesto).
3.  *Tipo de alimentación* (ej. Balanceada, Vegetariana, Vegana, Carnívora, etc.).
4.  *Quiénes viven en casa*: Para cada persona necesito saber su:
    *   Edad
    *   Género
    *   Nivel de actividad física (Bajo/Normal/Alto)
    *   Ritmo de alimentación (Bajo/Normal/Alto)

¡Puedes enviarme un audio contándome todo esto de una vez! 🎙️ Si se te olvida algo, te lo preguntaré después. 😉"""

def generar_mensaje_onboarding_resumido() -> str:
    return """¡Hola! 👋 Soy Despensin. Para empezar necesito:

1. Tu nombre
2. Ingresos del hogar
3. Tipo de alimentación
4. Personas del hogar (edad, género, actividad, alimentación para cada una)

Puedes enviarme un audio o mensaje. 😊"""

def detectar_solicitud_resumen(texto: str) -> bool:
    keywords = ["resumen", "resumir", "mucho texto", "muy largo", "breve", "simplifica"]
    return any(k in texto.lower() for k in keywords)

def generar_pregunta_onboarding(campos_faltantes: List[str]) -> str:
    if "name" in campos_faltantes: return "Me falta tu nombre completo. ¿Cómo te llamas?"
    if "home.income" in campos_faltantes: return "¿Cuál es el ingreso mensual aproximado del hogar?"
    if "home.foodType" in campos_faltantes: return "¿Qué tipo de alimentación tienen? (balanceada, vegetariana...)"
    if any("people" in c for c in campos_faltantes): return "Necesito detalles de las personas: edad, género, actividad y alimentación de cada uno."
    return "Me falta un poco más de información para completar tu perfil."

# ============================================================================
# HERRAMIENTAS DEL AGENTE (TOOLS)
# ============================================================================
@tool
def consultar_despensa(item_name: str = "todos") -> str:
    """Consulta productos en la despensa."""
    global _current_user_id
    if not _current_user_id or not BACKEND_AVAILABLE:
        return json.dumps({
            "accion": "QUERY",
            "tipo": "error",
            "found": False,
            "msg": "Error: No se pudo conectar con el backend para consultar la despensa."
        }, ensure_ascii=False)
    
    try:
        productos = get_all_products_for_user(_current_user_id)
        productos_analizados = analizar_estado_stock(productos)
        
        # Función auxiliar para formatear estado
        def formatear_estado(estado_raw: str) -> str:
            if "bajo" in estado_raw.lower(): return "BAJO"
            if "medio" in estado_raw.lower(): return "MEDIO"
            if "alto" in estado_raw.lower(): return "ALTO"
            return "MEDIO" # Default

        # Procesar productos para incluir el estado en el formato deseado
        productos_finales = []
        for p in productos_analizados:
            nombre = p.get("name", "")
            cantidad_str = p.get("cantidad", "")
            estado_raw = p.get("estado_stock", "")
            estado_fmt = formatear_estado(estado_raw)
            
            # Crear un string combinado para el mensaje (ej: "300Ml (BAJO)")
            # Nota: La cantidad ya viene formateada como "300 Unit" o similar desde analizar_estado_stock
            
            productos_finales.append({
                "nombre": nombre,
                "cantidad": cantidad_str,
                "estado": estado_fmt,
                "mensaje_stock": f"{cantidad_str} ({estado_fmt})"
            })

        if item_name.lower() == "todos":
            return json.dumps({
                "accion": "QUERY", "tipo": "todos", 
                "productos": productos_finales,
                "total": len(productos_finales)
            }, ensure_ascii=False)
        else:
            # Filtrar específico
            found = next((p for p in productos_finales if p.get("nombre", "").lower() == item_name.lower()), None)
            if found:
                return json.dumps({"accion": "QUERY", "tipo": "especifico", "found": True, "data": found}, ensure_ascii=False)
            return json.dumps({"accion": "QUERY", "tipo": "especifico", "found": False}, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Error consultando backend: {e}")
        return json.dumps({"error": str(e)})

@tool
def actualizar_despensa(
    item_name: str, 
    cantidad: Optional[float] = None, 
    unidad: Optional[str] = None, 
    estado: Optional[str] = None,
    movement_type: Optional[str] = None
) -> str:
    """
    Actualiza o crea un producto en la despensa usando la API del backend.
    
    Args:
        item_name: Nombre del producto
        cantidad: Cantidad a actualizar/agregar/quitar (opcional)
        unidad: Unidad de medida (litro, kg, unidad, etc.)
        estado: Estado del stock (BAJO, MEDIO, ALTO) - opcional, solo referencial si se usa
        movement_type: Tipo de movimiento. Opciones:
            - "in": Para agregar productos (compras)
            - "out": Para quitar productos (consumo)
            - "adjustment": Para correcciones de inventario (decir "tengo X cantidad")
            Si no se especifica, la IA debe inferirlo, pero es mejor ser explícito.
    
    Returns:
        JSON string con resultado de la operación
    """
    global _current_user_id
    
    # Lógica de fallback simulada si no hay backend
    if not _current_user_id or not BACKEND_AVAILABLE:
        return json.dumps({
            "accion": "UPDATE_ERROR",
            "producto": item_name,
            "mensaje": f"Error: No se pudo conectar con el backend para actualizar {item_name}."
        }, ensure_ascii=False)

    try:
        # Normalizar parámetros para evitar errores en backend
        qty_final = cantidad if cantidad is not None else 1.0 # Default a 1 si no hay cantidad
        unit_final = unidad if unidad else "unidad" # Default "unidad" si es None
        
        # Inferir movement_type si no viene
        if not movement_type:
            movement_type = "adjustment"
        
        movement_type = movement_type.lower()
        if movement_type not in ["in", "out", "adjustment"]:
            if "in" in movement_type: movement_type = "in"
            elif "out" in movement_type: movement_type = "out"
            else: movement_type = "adjustment"

        # Preparar producto para bulk_upload
        product_payload = {
            "name": item_name,
            "quantity": float(qty_final), # Asegurar que sea número
            "sourceText": f"Actualización via agente: {item_name} {qty_final} {unit_final}", 
            "measurementUnit": unit_final
        }
        
        # Logging detallado del payload
        logger.info(f"🔄 Actualizando despensa: {movement_type}")
        logger.info(f"📦 Payload producto: {json.dumps(product_payload)}")
        
        response = bulk_upload_products(
            user_id=_current_user_id,
            movement_type=movement_type,
            source_type="agent_chat", 
            products=[product_payload]
        )
        
        # Procesar respuesta
        mensaje_accion = {
            "in": "agregado",
            "out": "quitado",
            "adjustment": "ajustado"
        }.get(movement_type, "actualizado")
        
        return json.dumps({
            "accion": "UPDATE",
            "exito": True,
            "producto": item_name,
            "tipo_movimiento": movement_type,
            "cantidad": qty_final,
            "unidad": unit_final,
            "mensaje": f"✅ Se ha {mensaje_accion} {qty_final} {unit_final} de {item_name}."
        }, ensure_ascii=False)

    except Exception as e:
        logger.error(f"❌ Error actualizando despensa en backend: {e}", exc_info=True)
        return json.dumps({
            "accion": "UPDATE",
            "exito": False,
            "error": str(e),
            "mensaje": "Hubo un error técnico al actualizar tu despensa."
        }, ensure_ascii=False)

@tool
def consultar_reposicion_de_productos() -> str:
    """
    Consulta qué productos necesita comprar el usuario basado en su stock crítico.
    Filtra los productos que están en estado BAJO o MEDIO.
    Returns JSON string con la lista de productos a comprar/reponer.
    """
    global _current_user_id
    
    if not _current_user_id or not BACKEND_AVAILABLE:
        # Sin backend, no podemos consultar reposición real
        return json.dumps({
            "accion": "SHOPPING_LIST",
            "productos": [],
            "mensaje": "Error: No se pudo conectar con el sistema de recomendaciones."
        }, ensure_ascii=False)
    
    try:
        logger.info(f"🛒 Consultando reposición inteligente para user_id: {_current_user_id}")
        
        # 1. Obtener inventario actual y analizar estado (BAJO/MEDIO/ALTO)
        # Esto nos da la "verdad" sobre qué falta realmente
        todos_productos = get_all_products_for_user(_current_user_id)
        analizados = analizar_estado_stock(todos_productos)
        
        # 2. Obtener recomendaciones del backend (para saber CUÁNTO comprar)
        # Creamos un mapa {nombre_lower: cantidad_sugerida}
        sugeridos_backend = get_user_buy_products(_current_user_id)
        mapa_sugeridos = {
            p.get("name", "").lower().strip(): p.get("recommendedBuyQuantity", 1) 
            for p in sugeridos_backend
        }
        
        # 3. Filtrar y Construir lista final
        productos_a_comprar = []
        
        for prod in analizados:
            estado = prod.get("estado_stock", "").lower()
            nombre = prod.get("name", "")
            
            # Filtrar: Solo incluir si es nivel bajo o medio (excluir alto)
            if "bajo" in estado or "medio" in estado:
                # Obtener cantidad sugerida del otro endpoint (o default 1)
                cantidad_sugerida = mapa_sugeridos.get(nombre.lower().strip(), 1)
                
                # Si la sugerencia es 0 pero el estado es bajo, sugerir al menos 1
                if cantidad_sugerida == 0: 
                    cantidad_sugerida = 1
                
                prioridad = "ALTA" if "bajo" in estado else "MEDIA"
                estado_fmt = "BAJO" if "bajo" in estado else "MEDIO"
                
                productos_a_comprar.append({
                    "nombre": nombre,
                    "estado": estado_fmt,
                    "cantidad_sugerida": cantidad_sugerida,
                    "stock_actual": prod.get("cantidad", ""),
                    "prioridad": prioridad
                })
        
        # Construir mensaje para el LLM
        if productos_a_comprar:
            mensaje = f"Se han identificado {len(productos_a_comprar)} productos que necesitan reposición (Estado BAJO o MEDIO):\n\n"
            for idx, p in enumerate(productos_a_comprar, 1):
                mensaje += f"{idx}. *{p['nombre']}* (Estado: {p['estado']}) - Comprar: {p['cantidad_sugerida']}\n"
        else:
            mensaje = "¡Excelente! Tienes todos los productos necesarios en buen nivel (ALTO). No necesitas comprar nada por ahora."
        
        return json.dumps({
            "accion": "SHOPPING_LIST",
            "productos": productos_a_comprar,
            "mensaje": mensaje
        }, ensure_ascii=False)
        
    except Exception as e:
        logger.error(f"Error consultando reposición: {e}")
        return json.dumps({"error": str(e)})

@tool
def generar_carrito_compras(productos: list[str]) -> str:
    """
    Genera un enlace a un carrito de supermercado (Jumbo) pre-llenado con los productos solicitados.
    
    IMPORTANTE: Úsalo SOLO cuando el usuario confirme explícitamente que quiere crear el carro, 
    "ir a comprar" o solicite el enlace para comprar. NO lo uses si solo pregunta qué le falta.
    
    Args:
        productos: Lista de nombres de productos que el usuario quiere comprar (ej: ["leche", "huevos", "pan"])
    
    Returns:
        JSON string con el estado de inicio (la URL llegará después).
    """
    global _current_user_id
    global _current_user_phone
    
    if not _current_user_id or not _current_user_phone:
        return json.dumps({
            "accion": "CART_ERROR",
            "mensaje": "Error: Usuario o teléfono no identificado para enviar la respuesta."
        }, ensure_ascii=False)

    try:
        # Limpiar lista de productos (asegurar minúsculas y strings)
        productos_limpios = [str(p).lower().strip() for p in productos if p]
        
        if not productos_limpios:
            return json.dumps({
                "accion": "CART_ERROR",
                "mensaje": "La lista de productos para el carrito está vacía."
            }, ensure_ascii=False)

        logger.info(f"🛒 Iniciando hilo para generar carrito de {_current_user_id} con: {productos_limpios}")
        
        # Datos para el hilo
        user_id_thread = _current_user_id
        phone_thread = _current_user_phone
        products_thread = productos_limpios
        
        def run_async_cart():
            try:
                logger.info("⏳ Ejecutando generate_supermarket_cart en background...")
                response = generate_supermarket_cart(user_id_thread, products_thread)
                
                cart_url = ""
                if isinstance(response, dict):
                    cart_url = response.get("url") or response.get("link") or response.get("cartUrl")
                elif isinstance(response, str):
                    cart_url = response
                    
                if not cart_url:
                     cart_url = str(response)

                msg_final = f"🛒 ¡Listo! Aquí tienes tu carrito de compras con {len(products_thread)} productos: {cart_url}"
                logger.info(f"✅ Carrito generado. Enviando WhatsApp a {phone_thread}")
                whatsapp_service.send_text_message(phone_thread, msg_final)
                
            except Exception as e:
                logger.error(f"❌ Error background generating cart: {e}")
                error_msg = f"Hubo un problema técnico generando tu carrito de compras. Por favor intenta nuevamente más tarde."
                whatsapp_service.send_text_message(phone_thread, error_msg)

        # Lanzar hilo
        threading.Thread(target=run_async_cart).start()

        return json.dumps({
            "accion": "CART_PENDING",
            "exito": True,
            "mensaje": "He comenzado a armar tu carrito de compras en Jumbo. 🛒\n\nEsto puede tomar unos minutos mientras selecciono los productos. Te enviaré el enlace por aquí apenas esté listo."
        }, ensure_ascii=False)

    except Exception as e:
        logger.error(f"❌ Error iniciando generación de carrito: {e}", exc_info=True)
        return json.dumps({
            "accion": "CART_ERROR",
            "exito": False,
            "error": str(e),
            "mensaje": "Hubo un error al intentar generar el carrito."
        }, ensure_ascii=False)

@tool
def solicitar_dashboard() -> str:
    """
    Solicita acceso al dashboard del usuario.
    Retorna la URL y el PIN de acceso.
    """
    global _current_user_id
    global _current_user_phone
    
    if not _current_user_id or not _current_user_phone:
        return json.dumps({"error": "Usuario no identificado"})

    try:
        # Obtener PIN del backend
        # Asegurarnos de que el teléfono tenga el formato correcto
        res = get_dashboard_pin(_current_user_phone)
        pin = res.get("pin")
        
        # URL del dashboard
        url = f"https://dashboard-staging-6637.up.railway.app/dashboard/{_current_user_id}"
        
        return json.dumps({
            "accion": "DASHBOARD_ACCESS",
            "url": url,
            "pin": pin,
            "mensaje": f"Para acceder a tu dashboard entra a: {url} \n\nTu PIN de acceso es: *{pin}*"
        }, ensure_ascii=False)
        
    except Exception as e:
        logger.error(f"Error getting dashboard pin: {e}")
        return json.dumps({"error": str(e)})

@tool
def transcribir_audio(audio_file_path: str) -> str:
    """
    Transcribe audio a texto usando Whisper.
    Maneja conversión de OGG a WAV si es necesario.
    """
    if not os.path.exists(audio_file_path):
        return "Error: El archivo de audio no existe."
    
    file_ext = os.path.splitext(audio_file_path)[1].lower()
    audio_to_use = audio_file_path
    temp_wav = None
    temp_converted_file = None
    
    # Conversión OGG a WAV si es necesario
    if file_ext == ".ogg":
        if PYDUB_AVAILABLE:
            try:
                # Intentar cargar con pydub
                try:
                    audio = AudioSegment.from_file(audio_file_path)
                except:
                    audio = AudioSegment.from_file(audio_file_path, format="ogg")
                
                temp_wav = tempfile.mktemp(suffix=".wav")
                # Exportar a mono 16kHz (ideal para Whisper)
                audio.export(temp_wav, format="wav", parameters=["-ac", "1", "-ar", "16000"])
                audio_to_use = temp_wav
                temp_converted_file = temp_wav
                logger.info(f"Conversión OGG a WAV exitosa: {temp_wav}")
            except Exception as e:
                logger.error(f"Error convirtiendo audio OGG: {e}")
                # Intentaremos enviarlo directo a Whisper como fallback
        else:
            logger.warning("pydub no disponible para convertir OGG. Intentando directo.")

    try:
        with open(audio_to_use, "rb") as f:
            transcript = openai_client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
                language="es"
            )
        
        texto_transcrito = transcript.text.strip()
        logger.info(f"Audio transcrito: {texto_transcrito[:50]}...")
        
        # Limpiar temporal
        if temp_converted_file and os.path.exists(temp_converted_file):
            try:
                os.remove(temp_converted_file)
            except: pass
            
        # Extraer info estructurada también
        extracto = extraer_productos_desde_texto(texto_transcrito)
        
        return json.dumps({
            "texto_transcrito": texto_transcrito,
            "extracto_estructurado": extracto,
            "formato": "JSON_READY"
        }, ensure_ascii=False)
        
    except Exception as e:
        logger.error(f"Error en Whisper: {e}")
        if temp_converted_file and os.path.exists(temp_converted_file):
            try: os.remove(temp_converted_file)
            except: pass
            
        error_msg = str(e).lower()
        if "rate_limit" in error_msg:
            return "[ERROR_RATE_LIMIT] Límite de tasa excedido. Intenta más tarde."
        return f"[ERROR_TRANSCRIPTION] Error transcribiendo: {str(e)}"

@tool
def procesar_imagen(image_file_path: str) -> str:
    """
    Procesa una imagen de boleta o factura usando OpenAI Vision API.
    Verifica primero si es una boleta válida.
    """
    if not os.path.exists(image_file_path):
        return "Error: El archivo de imagen no existe."
        
    file_ext = os.path.splitext(image_file_path)[1].lower()
    mime_type = f"image/{file_ext[1:]}"
    if file_ext == '.jpg': mime_type = 'image/jpeg'
    
    try:
        with open(image_file_path, "rb") as image_file:
            base64_image = base64.b64encode(image_file.read()).decode('utf-8')
            
        # 1. Verificar si es boleta
        verification_prompt = "Analiza esta imagen. Responde SI si es una boleta, factura, ticket o recibo de compra. Responde NO si es cualquier otra cosa."
        
        verif_response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "user", "content": [
                    {"type": "text", "text": verification_prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{base64_image}"}}
                ]}
            ],
            max_tokens=10
        )
        es_boleta = verif_response.choices[0].message.content.strip().upper()
        
        if "NO" in es_boleta:
            return json.dumps({
                "es_boleta": False,
                "error": "IMAGEN_NO_ES_BOLETA",
                "mensaje": "La imagen no parece ser una boleta o factura. Por favor envía una foto válida de tu compra."
            }, ensure_ascii=False)
            
        # 2. Extraer productos
        analysis_prompt = """Analiza esta boleta. Identifica TODOS los productos, cantidades y unidades.
Genera una lista estructurada para actualizar el inventario.
Si no puedes leer bien, indícalo."""

        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "user", "content": [
                    {"type": "text", "text": analysis_prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{base64_image}"}}
                ]}
            ],
            max_tokens=1000
        )
        
        analisis = response.choices[0].message.content.strip()
        
        # 3. Estructurar y Normalizar
        extracto = extraer_productos_desde_texto(analisis)
        
        if extracto.get("productos"):
            prods_norm = []
            for p in extracto["productos"]:
                nombre = p.get("nombre", "")
                nombre_norm = normalizar_nombre_producto(nombre)
                if nombre_norm:
                    p["nombre"] = nombre_norm
                    prods_norm.append(p)
            
            extracto["productos"] = agrupar_productos_duplicados(prods_norm)
            
        return json.dumps({
            "es_boleta": True,
            "analisis_imagen": analisis,
            "extracto_estructurado": extracto,
            "formato": "JSON_READY"
        }, ensure_ascii=False)
        
    except Exception as e:
        logger.error(f"Error procesando imagen: {e}")
        return json.dumps({"error": str(e), "es_boleta": False})

@tool
def procesar_extracto_productos(extracto_json: str) -> str:
    """Procesa un extracto JSON de productos."""
    return json.dumps({"mensaje": "Extracto procesado", "detalles": extracto_json})

# ============================================================================
# GRAFO DE DESPENSA (LANGGRAPH)
# ============================================================================
class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    user_input: str
    media_file_path: Optional[str]

def agent_node(state: AgentState) -> AgentState:
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    messages = state["messages"]
    
    # Log para depuración del contexto
    logger.info(f"🧠 Agent Node Context - Messages count: {len(messages)}")
    if messages:
        last_msg = messages[-1]
        content_preview = str(last_msg.content)[:100] if hasattr(last_msg, "content") else "No content"
        logger.info(f"   Last message ({type(last_msg).__name__}): {content_preview}...")
    
    tools = [consultar_despensa, actualizar_despensa, consultar_reposicion_de_productos, 
             transcribir_audio, procesar_imagen, procesar_extracto_productos, generar_carrito_compras, solicitar_dashboard]
    
    # Prompt System
    msgs = [SystemMessage(content=SYSTEM_PROMPT)] + messages
    
    llm_with_tools = llm.bind_tools(tools)
    response = llm_with_tools.invoke(msgs)
    
    return {"messages": [response], "user_input": state["user_input"], "media_file_path": state.get("media_file_path")}

def should_continue(state: AgentState) -> Literal["tools", "end"]:
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls: return "tools"
    return "end"

def create_pantry_graph(user_id: str):
    global _current_user_id
    _current_user_id = user_id
    
    workflow = StateGraph(AgentState)
    workflow.add_node("agent", agent_node)
    workflow.add_node("tools", ToolNode([
        consultar_despensa, actualizar_despensa, consultar_reposicion_de_productos,
        transcribir_audio, procesar_imagen, procesar_extracto_productos, generar_carrito_compras, solicitar_dashboard
    ]))
    
    workflow.set_entry_point("agent")
    workflow.add_conditional_edges("agent", should_continue, {"tools": "tools", "end": END})
    workflow.add_edge("tools", "agent")
    
    return workflow.compile()

# ============================================================================
# AGENTES ESPECÍFICOS
# ============================================================================

def run_onboarding_agent(
    user_input: str,
    chat_history: list,
    media_file_path: Optional[str],
    phone_normalized: str
) -> Any:
    """Ejecuta el agente de onboarding."""
    logger.info(f"🚀 Ejecutando Agente de Onboarding para {phone_normalized}")
    
    # 1. Recuperar o inicializar datos
    onboarding_data = _onboarding_data.get(phone_normalized, {})
    
    # 2. Si es inicio absoluto
    if not onboarding_data and not user_input and not media_file_path:
        return generar_mensaje_onboarding_inicial()

    # 3. Detectar solicitud de resumen
    texto_analizar = user_input or ""
    if detectar_solicitud_resumen(texto_analizar):
        return generar_mensaje_onboarding_resumido()
        
    # 4. Procesar input (Texto / Audio) y Acumular Historial
    texto_nuevo = user_input or ""
    
    if media_file_path:
        # Transcribir si es audio
        try:
            res = json.loads(transcribir_audio.invoke({"audio_file_path": media_file_path}))
            texto_transcrito = res.get("texto_transcrito", "")
            if texto_transcrito:
                texto_nuevo += " " + texto_transcrito
                logger.info(f"Audio transcrito en onboarding: {texto_transcrito}")
        except Exception as e:
            logger.error(f"Error transcribiendo en onboarding: {e}")

    # Construir contexto completo desde historial + nuevo
    texto_contexto = ""
    if chat_history:
        msgs_text = [m.content for m in chat_history if isinstance(m, HumanMessage) and m.content]
        texto_contexto = " ".join(msgs_text)
    
    texto_completo = f"{texto_contexto} {texto_nuevo}".strip()
    
    if not texto_completo:
        # Si no hay nada de texto aún, mandar inicial
        return generar_mensaje_onboarding_inicial()

    # 5. Extraer información
    logger.info("Extrayendo info de onboarding...")
    onboarding_data = extraer_info_onboarding(texto_completo, onboarding_data)
    onboarding_data["phoneNumber"] = phone_normalized
    _onboarding_data[phone_normalized] = onboarding_data # Persistir
    
    # Verificar si tenemos algún dato útil más allá del teléfono
    # Si el usuario solo dijo "Hola" o el LLM no extrajo nada, seguimos en la etapa inicial.
    tiene_datos = False
    if onboarding_data.get("name"):
        tiene_datos = True
    elif onboarding_data.get("home"):
        home = onboarding_data["home"]
        if (home.get("income") is not None or 
            home.get("foodType") or 
            (home.get("people") and len(home.get("people")) > 0)):
            tiene_datos = True
            
    if not tiene_datos:
        # Si no hay datos extraídos, enviamos el mensaje de bienvenida/explicación nuevamente
        return generar_mensaje_onboarding_inicial()
    
    # 6. Validar
    completo, faltantes = validar_info_onboarding_completa(onboarding_data, phone_normalized)
    
    if completo:
        logger.info("✅ Onboarding completo. Creando usuario...")
        try:
            res = create_user(onboarding_data)
            # Intentar obtener ID
            new_id = None
            if isinstance(res, dict):
                new_id = res.get("id") or res.get("userId") or res.get("_id")
            
            if new_id:
                _onboarding_data.pop(phone_normalized, None) # Limpiar
                return {
                    "respuesta": "¡Cuenta creada con éxito! 🎉 ¿En qué te puedo ayudar con tu despensa hoy?",
                    "nuevo_usuario_id": new_id, # Flag para el orquestador si quisiera encadenar
                    "formato": "TEXT"
                }
            else:
                return "Hubo un problema técnico creando tu cuenta. Por favor intenta más tarde."
        except Exception as e:
            logger.error(f"Error create_user: {e}")
            return "Error al crear usuario. Intenta nuevamente."
    else:
        logger.info(f"Onboarding incompleto. Faltan: {faltantes}")
        return generar_pregunta_onboarding(faltantes)

def run_pantry_agent(
    user_input: str,
    chat_history: list,
    media_file_path: Optional[str],
    user_id: str
) -> Any:
    """Ejecuta el agente de despensa (LangGraph)."""
    logger.info(f"🚀 Ejecutando Agente de Despensa para {user_id}")
    
    app = create_pantry_graph(user_id)
    
    inputs = {
        "messages": chat_history or [],
        "user_input": user_input or "",
        "media_file_path": media_file_path
    }
    
    # Manejo especial de multimedia para el prompt
    if media_file_path:
        ext = os.path.splitext(media_file_path)[1].lower()
        tipo = "audio" if ext in ['.wav', '.mp3', '.ogg'] else "imagen"
        inputs["messages"].append(HumanMessage(content=f"El usuario envió {tipo}: {media_file_path}"))
    elif user_input:
        inputs["messages"].append(HumanMessage(content=user_input))
        
    res = app.invoke(inputs)
    last_msg = res["messages"][-1]
    return last_msg.content

# ============================================================================
# SUPER ORQUESTADOR
# ============================================================================
def run_agent(
    user_input: str = "", 
    chat_history: list[BaseMessage] = None, 
    media_file_path: Optional[str] = None,
    user_phone: Optional[str] = None
):
    """
    Super Orquestador: Decide si ejecutar Onboarding o Despensa.
    """
    logger.info(f"🎯 SUPER ORQUESTADOR: Iniciando para {user_phone}")
    
    if not user_phone:
        return "Error: Se requiere número de teléfono para operar."

    # 1. Normalizar teléfono
    phone_norm = user_phone.strip()
    if not phone_norm.startswith("+"): phone_norm = "+" + phone_norm
    
    # GLOBAL: Guardar teléfono para uso en herramientas asíncronas
    global _current_user_phone
    _current_user_phone = phone_norm

    # 2. Verificar Usuario
    user_id = None
    if BACKEND_AVAILABLE:
        try:
            user_data = get_user_by_phone(phone_norm)
            if user_data and isinstance(user_data, dict):
                user_id = user_data.get("id") or user_data.get("userId") or user_data.get("_id")
        except Exception as e:
            logger.error(f"Error check user: {e}")
    
    # 3. Enrutamiento
    if user_id:
        # ---> Agente de Despensa
        logger.info(f"Usuario encontrado ({user_id}). Derivando a Agente de Despensa.")
        return run_pantry_agent(user_input, chat_history, media_file_path, user_id)
    else:
        # ---> Agente de Onboarding
        logger.info(f"Usuario NO encontrado. Derivando a Agente de Onboarding.")
        res = run_onboarding_agent(user_input, chat_history, media_file_path, phone_norm)
        
        # Si el onboarding acaba de crear el usuario (retorna dict con flag), podríamos
        # opcionalmente encadenar una llamada al agente de despensa o retornar el saludo.
        if isinstance(res, dict) and "nuevo_usuario_id" in res:
            return res["respuesta"]
        
        return res
