"""
Agente de Despensa usando LangGraph.

Simula la gestión de inventario de una despensa mediante un agente conversacional.
Soporta entradas multimodales: texto, audio e imágenes.
"""

import os
import base64
import tempfile
import json
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

logger = get_logger(__name__)

# Cargar configuración
try:
    settings = Settings.load()
    openai_client = OpenAI(api_key=settings.openai.api_key)
except Exception as e:
    logger.error(f"Error cargando configuración: {e}")
    raise

# ============================================================================
# BASE DE DATOS SIMULADA (Diccionario global)
# ============================================================================
DESPENSA_DB = {
    "leche": {"stock": 0, "unidad": "litro", "estado": "BAJO"},
    "huevos": {"stock": 12, "unidad": "unidad", "estado": "ALTO"},
    "pan": {"stock": 2, "unidad": "unidad", "estado": "MEDIO"},
    "azúcar": {"stock": 2, "unidad": "kg", "estado": "ALTO"},
    "aceite": {"stock": 1, "unidad": "litro", "estado": "MEDIO"},
    "arroz": {"stock": 0, "unidad": "kg", "estado": "BAJO"},
    "fideos": {"stock": 5, "unidad": "paquete", "estado": "ALTO"},
}


# ============================================================================
# EXTRACCIÓN ESTRUCTURADA DE PRODUCTOS
# ============================================================================
def normalizar_nombre_producto(nombre_original: str) -> str | None:
    """
    Normaliza el nombre de un producto a una versión genérica usando LLM.
    
    Ejemplos:
    - "jgo uva" -> "jugo de uva"
    - "pulpa de jugo guayarauco" -> "pulpa de jugo"
    - "aceite girasol" -> "aceite de girasol"
    
    Args:
        nombre_original: Nombre del producto tal como aparece en la boleta
    
    Returns:
        Nombre normalizado genérico, o None si no se puede reconocer el producto
    """
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    
    prompt = f"""Normaliza el siguiente nombre de producto de una boleta a su versión genérica y estándar.

Nombre original: "{nombre_original}"

Instrucciones:
1. Convierte abreviaciones a palabras completas (ej: "jgo" -> "jugo", "kg" -> "kilo")
2. Elimina marcas específicas y nombres propios (ej: "guayarauco", "coca cola")
3. Usa nombres genéricos comunes (ej: "jugo de uva", "aceite de girasol", "pulpa de jugo")
4. Mantén la estructura básica del producto (tipo + ingrediente principal si aplica)
5. Usa español estándar y nombres comunes de productos alimenticios

Ejemplos:
- "jgo uva" -> "jugo de uva"
- "pulpa de jugo guayarauco" -> "pulpa de jugo"
- "aceite girasol" -> "aceite de girasol"
- "leche entera colun" -> "leche entera"
- "pan molde bimbo" -> "pan de molde"
- "yogurth natural" -> "yogur natural"
- "arroz graneado" -> "arroz"

IMPORTANTE:
- Si el nombre es completamente irreconocible o no parece ser un producto alimenticio común, responde SOLO con "IGNORAR"
- Si puedes normalizarlo, responde SOLO con el nombre normalizado en minúsculas, sin puntos ni caracteres especiales
- Responde SOLO con el nombre normalizado o "IGNORAR", sin explicaciones ni texto adicional

Nombre normalizado:"""
    
    try:
        response = llm.invoke(prompt)
        nombre_normalizado = response.content.strip().lower()
        
        # Si el LLM indica ignorar, retornar None
        if "ignorar" in nombre_normalizado or nombre_normalizado == "":
            return None
        
        # Limpiar el nombre de posibles caracteres extra
        nombre_normalizado = nombre_normalizado.replace('"', '').replace("'", "").strip()
        
        # Si después de limpiar está vacío, retornar None
        if not nombre_normalizado:
            return None
        
        logger.debug(f"Normalizado: '{nombre_original}' -> '{nombre_normalizado}'")
        return nombre_normalizado
        
    except Exception as e:
        logger.error(f"Error normalizando nombre '{nombre_original}': {e}")
        # En caso de error, retornar None para ignorar el producto
        return None


def normalizar_unidad(unidad: str) -> str:
    """
    Normaliza unidades de conteo genéricas a "unidad".
    
    Args:
        unidad: Unidad original (ej: "lata", "bolsa", "paquete", "botella")
    
    Returns:
        "unidad" si es una unidad de conteo genérica, o la unidad original si es específica (kg, litro, etc.)
    """
    unidad_lower = unidad.lower().strip()
    
    # Unidades de conteo genéricas que se normalizan a "unidad"
    unidades_conteo = {
        "lata", "latas", "lata.",
        "bolsa", "bolsas", "bolsa.",
        "paquete", "paquetes", "paquete.",
        "botella", "botellas", "botella.",
        "unidad", "unidades", "unidad.",
        "pieza", "piezas", "pieza.",
        "envase", "envases", "envase.",
        "caja", "cajas", "caja.",
        "pack", "packs", "pack.",
        "un", "un.", "uds", "ud."
    }
    
    if unidad_lower in unidades_conteo:
        return "unidad"
    
    # Unidades específicas se mantienen (kg, litro, gramo, etc.)
    return unidad


def agrupar_productos_duplicados(productos: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    """
    Agrupa productos duplicados por nombre y suma sus cantidades.
    Agrupa por nombre sin importar la unidad, siempre sumando cantidades.
    Normaliza unidades de conteo genéricas (lata, bolsa, etc.) a "unidad".
    
    Args:
        productos: Lista de productos con estructura {"nombre": str, "cantidad": int|None, "unidad": str}
    
    Returns:
        Lista de productos únicos con cantidades sumadas
    """
    productos_agrupados = {}
    
    for producto in productos:
        # Obtener nombre original y normalizado para comparación
        nombre_original = producto.get("nombre", "").strip()
        nombre_normalizado = nombre_original.lower().strip()
        nombre_normalizado = " ".join(nombre_normalizado.split())  # Eliminar espacios múltiples
        cantidad = producto.get("cantidad")
        unidad_original = producto.get("unidad", "unidad")
        unidad = normalizar_unidad(unidad_original)  # Normalizar unidad
        
        if not nombre_normalizado:
            continue
        
        logger.debug(f"Procesando producto para agrupación: '{nombre_original}' (normalizado: '{nombre_normalizado}') - {cantidad} {unidad}")
        
        # Si el producto ya existe (comparando por nombre normalizado), SIEMPRE agrupar y sumar cantidades
        if nombre_normalizado in productos_agrupados:
            producto_existente = productos_agrupados[nombre_normalizado]
            cantidad_existente = producto_existente.get("cantidad")
            unidad_existente_normalizada = normalizar_unidad(producto_existente.get("unidad", "unidad"))
            nombre_existente = producto_existente.get("nombre", nombre_normalizado)
            
            # Seleccionar la unidad final (preferir unidades específicas como kg, litro sobre "unidad")
            # Si ambas son "unidad" (normalizadas), usar "unidad"
            # Si una es específica (kg, litro, etc.) y otra es "unidad", usar la específica
            if unidad == "unidad" and unidad_existente_normalizada != "unidad":
                unidad_final = unidad_existente_normalizada
            elif unidad != "unidad" and unidad_existente_normalizada == "unidad":
                unidad_final = unidad
            elif unidad != "unidad":
                # Si la nueva no es "unidad", preferirla (más reciente)
                unidad_final = unidad
            else:
                # Ambas son "unidad" (normalizadas)
                unidad_final = "unidad"
            
            # Usar el nombre más descriptivo (el que tenga más caracteres o sea más completo)
            nombre_final = nombre_original if len(nombre_original) > len(nombre_existente) else nombre_existente
            
            # Sumar cantidades siempre que sea posible
            if cantidad is not None and cantidad_existente is not None:
                nueva_cantidad = cantidad_existente + cantidad
                productos_agrupados[nombre_normalizado]["cantidad"] = nueva_cantidad
                productos_agrupados[nombre_normalizado]["unidad"] = unidad_final
                productos_agrupados[nombre_normalizado]["nombre"] = nombre_final
                logger.info(f"✅ Agrupado '{nombre_final}': {cantidad_existente} {unidad_existente_normalizada} + {cantidad} {unidad} = {nueva_cantidad} {unidad_final}")
            elif cantidad is not None:
                # Solo el nuevo tiene cantidad
                productos_agrupados[nombre_normalizado]["cantidad"] = cantidad
                productos_agrupados[nombre_normalizado]["unidad"] = unidad_final
                productos_agrupados[nombre_normalizado]["nombre"] = nombre_final
                logger.info(f"✅ Agrupado '{nombre_final}': actualizado cantidad a {cantidad} {unidad_final}")
            elif cantidad_existente is not None:
                # Solo el existente tiene cantidad, mantenerla pero actualizar unidad si es más específica
                productos_agrupados[nombre_normalizado]["unidad"] = unidad_final
                productos_agrupados[nombre_normalizado]["nombre"] = nombre_final
                logger.info(f"✅ Agrupado '{nombre_final}': manteniendo cantidad {cantidad_existente}, unidad actualizada a {unidad_final}")
            else:
                # Ninguno tiene cantidad, solo actualizar unidad si es más específica
                productos_agrupados[nombre_normalizado]["unidad"] = unidad_final
                productos_agrupados[nombre_normalizado]["nombre"] = nombre_final
                logger.info(f"✅ Agrupado '{nombre_final}': sin cantidad, unidad actualizada a {unidad_final}")
        else:
            # Primer producto con este nombre - actualizar con unidad normalizada
            producto_nuevo = producto.copy()
            producto_nuevo["unidad"] = unidad  # Usar unidad normalizada
            productos_agrupados[nombre_normalizado] = producto_nuevo
            logger.debug(f"Nuevo producto agregado: '{nombre_original}' ({cantidad} {unidad})")
    
    # Convertir el diccionario a lista
    # Los nombres ya están en su formato original, solo capitalizar primera letra
    resultado = []
    for producto in productos_agrupados.values():
        nombre = producto.get("nombre", "")
        if nombre:
            # Capitalizar primera letra de cada palabra
            nombre_capitalizado = nombre.title()
            producto_final = producto.copy()
            producto_final["nombre"] = nombre_capitalizado
            resultado.append(producto_final)
        else:
            resultado.append(producto)
    
    logger.info(f"Agrupación completada: {len(resultado)} productos únicos")
    return resultado


def extraer_productos_desde_texto(texto: str) -> Dict[str, Any]:
    """
    Extrae información estructurada de productos y cantidades desde texto transcrito.
    
    Args:
        texto: Texto transcrito del usuario (ej: "tengo 1 plátano, 3 manzanas, 1 leche")
    
    Returns:
        Diccionario con estructura:
        {
            "accion": "UPDATE" | "CREATE" | "QUERY" | "SHOPPING_LIST",
            "productos": [
                {"nombre": "plátano", "cantidad": 1, "unidad": "unidad"},
                {"nombre": "manzana", "cantidad": 3, "unidad": "unidad"},
                ...
            ],
            "intencion": "actualizar stock" | "consultar" | "crear productos" | "lista de compras"
        }
    """
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    
    prompt = f"""Analiza el siguiente texto del usuario y extrae información estructurada sobre productos de despensa.

Texto del usuario: "{texto}"

Extrae:
1. La ACCIÓN que el usuario quiere realizar:
   - "UPDATE": Actualizar stock de productos existentes (ej: "tengo 3 manzanas", "me quedan 2 leches")
   - "CREATE": Crear nuevos productos (ej: "agregué plátanos", "compré galletas nuevas")
   - "QUERY": Consultar productos (ej: "¿qué tengo?", "¿cuántas manzanas tengo?")
   - "SHOPPING_LIST": Generar lista de compras (ej: "¿qué me falta?", "¿qué debo comprar?")

2. Los PRODUCTOS mencionados con sus cantidades:
   - Para cada producto, extrae: nombre, cantidad (número), unidad (unidad/kg/litro/paquete/etc)
   - Si no se menciona cantidad, usa null
   - Si no se menciona unidad, usa "unidad" por defecto

3. La INTENCIÓN general del usuario

Responde SOLO con un JSON válido en este formato exacto:
{{
    "accion": "UPDATE" | "CREATE" | "QUERY" | "SHOPPING_LIST",
    "productos": [
        {{"nombre": "nombre_producto", "cantidad": número_o_null, "unidad": "unidad"}},
        ...
    ],
    "intencion": "descripción breve de la intención"
}}

Ejemplos:

Usuario: "tengo 1 plátano, 3 manzanas, 1 leche, 2 galletas"
{{
    "accion": "UPDATE",
    "productos": [
        {{"nombre": "plátano", "cantidad": 1, "unidad": "unidad"}},
        {{"nombre": "manzana", "cantidad": 3, "unidad": "unidad"}},
        {{"nombre": "leche", "cantidad": 1, "unidad": "litro"}},
        {{"nombre": "galleta", "cantidad": 2, "unidad": "paquete"}}
    ],
    "intencion": "actualizar stock de productos existentes"
}}

Usuario: "¿qué me falta comprar?"
{{
    "accion": "SHOPPING_LIST",
    "productos": [],
    "intencion": "generar lista de productos que faltan"
}}

Usuario: "compré plátanos y galletas nuevas"
{{
    "accion": "CREATE",
    "productos": [
        {{"nombre": "plátano", "cantidad": null, "unidad": "unidad"}},
        {{"nombre": "galleta", "cantidad": null, "unidad": "paquete"}}
    ],
    "intencion": "crear nuevos productos en la despensa"
}}

Responde SOLO con el JSON, sin texto adicional:"""

    try:
        response = llm.invoke(prompt)
        contenido = response.content.strip()
        
        # Limpiar el contenido si tiene markdown code blocks
        if contenido.startswith("```json"):
            contenido = contenido.replace("```json", "").replace("```", "").strip()
        elif contenido.startswith("```"):
            contenido = contenido.replace("```", "").strip()
        
        # Parsear JSON
        resultado = json.loads(contenido)
        
        # Logging profesional
        logger.info(
            f"Extracción completada: {resultado.get('accion')} - "
            f"{len(resultado.get('productos', []))} producto(s)"
        )
        
        return resultado
        
    except json.JSONDecodeError as e:
        logger.error(f"Error parseando JSON: {e}")
        logger.debug(f"Contenido recibido: {contenido[:200]}")
        return {
            "accion": "QUERY",
            "productos": [],
            "intencion": "no se pudo extraer información estructurada"
        }
    except Exception as e:
        logger.exception(f"Error extrayendo productos: {e}")
        return {
            "accion": "QUERY",
            "productos": [],
            "intencion": "error al procesar"
        }


# ============================================================================
# ESTADO DEL GRAFO
# ============================================================================
class AgentState(TypedDict):
    """Estado del agente que mantiene el historial de conversación, input del usuario y archivos multimedia."""
    messages: Annotated[list[BaseMessage], add_messages]
    user_input: str
    media_file_path: Optional[str]  # Ruta del archivo multimedia (audio o imagen)


# ============================================================================
# HERRAMIENTAS (TOOLS)
# ============================================================================
@tool
def consultar_despensa(item_name: str) -> str:
    """
    Consulta el estado actual de un ítem en la despensa.
    
    Args:
        item_name: Nombre del ítem a consultar (ej: "leche", "huevos")
    
    Returns:
        JSON string con información del producto o mensaje de error
    """
    item_name_lower = item_name.lower().strip()
    producto = DESPENSA_DB.get(item_name_lower)
    
    if producto is None:
        return json.dumps({
            "accion": "QUERY",
            "producto": item_name,
            "encontrado": False,
            "mensaje": f"El ítem '{item_name}' no está registrado en la despensa."
        }, ensure_ascii=False)
    
    # Compatibilidad con formato antiguo y nuevo
    if isinstance(producto, dict):
        resultado = {
            "accion": "QUERY",
            "producto": item_name,
            "encontrado": True,
            "stock": producto.get("stock"),
            "unidad": producto.get("unidad", "unidad"),
            "estado": producto.get("estado", "MEDIO"),
            "mensaje": f"El producto '{item_name}' tiene {producto.get('stock', 0)} {producto.get('unidad', 'unidad')} y está en estado {producto.get('estado', 'MEDIO')}"
        }
    else:
        # Formato antiguo (solo estado)
        resultado = {
            "accion": "QUERY",
            "producto": item_name,
            "encontrado": True,
            "estado": producto,
            "mensaje": f"El estado de '{item_name}' es: {producto}"
        }
    
    return json.dumps(resultado, ensure_ascii=False)


@tool
def actualizar_despensa(item_name: str, cantidad: Optional[int] = None, unidad: Optional[str] = None, estado: Optional[str] = None) -> str:
    """
    Actualiza o crea un producto en la despensa con información estructurada.
    
    Args:
        item_name: Nombre del producto
        cantidad: Cantidad de stock (opcional)
        unidad: Unidad de medida (opcional, default: "unidad")
        estado: Estado del producto "BAJO", "MEDIO", "ALTO" (opcional, se calcula si no se proporciona)
    
    Returns:
        JSON string con información de la actualización
    """
    item_name_lower = item_name.lower().strip()
    unidad = unidad or "unidad"
    
    # Verificar si el producto ya existe
    producto_existente = DESPENSA_DB.get(item_name_lower)
    es_nuevo = producto_existente is None
    
    # Determinar el stock final
    if cantidad is not None:
        stock_final = cantidad
    elif producto_existente and isinstance(producto_existente, dict):
        stock_final = producto_existente.get("stock", 0)
    else:
        stock_final = 0
    
    # Calcular estado basado en stock si no se proporciona explícitamente
    if estado is None:
        if stock_final == 0:
            estado = "BAJO"
        elif stock_final <= 2:
            estado = "MEDIO"
        else:
            estado = "ALTO"
    
    estado_upper = estado.upper().strip()
    
    # Validar que el estado sea válido
    estados_validos = ["BAJO", "MEDIO", "ALTO"]
    if estado_upper not in estados_validos:
        return json.dumps({
            "accion": "UPDATE",
            "producto": item_name,
            "exito": False,
            "error": f"Estado '{estado}' no válido. Use: BAJO, MEDIO o ALTO"
        }, ensure_ascii=False)
    
    # Asegurar que el estado sea consistente con el stock
    # Si el stock es 0, el estado DEBE ser BAJO
    if stock_final == 0 and estado_upper != "BAJO":
        estado_upper = "BAJO"
        logger.warning(f"Corrigiendo estado a BAJO para '{item_name}' con stock 0")
    
    # Actualizar o crear el producto
    DESPENSA_DB[item_name_lower] = {
        "stock": stock_final,
        "unidad": unidad,
        "estado": estado_upper
    }
    
    resultado = {
        "accion": "CREATE" if es_nuevo else "UPDATE",
        "producto": item_name,
        "exito": True,
        "stock": stock_final,
        "unidad": unidad,
        "estado": estado_upper,
        "mensaje": f"{'✅ Creado' if es_nuevo else '✅ Actualizado'}: '{item_name}' ahora tiene {stock_final} {unidad} (estado: {estado_upper})"
    }
    
    return json.dumps(resultado, ensure_ascii=False)


@tool
def procesar_extracto_productos(extracto_json: str) -> str:
    """
    Procesa un extracto estructurado de productos y ejecuta las acciones correspondientes.
    
    Args:
        extracto_json: JSON string con la estructura extraída de productos
    
    Returns:
        JSON string con el resultado de todas las operaciones
    """
    try:
        extracto = json.loads(extracto_json) if isinstance(extracto_json, str) else extracto_json
        accion = extracto.get("accion")
        productos = extracto.get("productos", [])
        
        logger.info(f"Procesando extracto: {accion} - {len(productos)} producto(s)")
        
        resultados = []
        
        if accion == "UPDATE" or accion == "CREATE":
            for producto in productos:
                nombre = producto.get("nombre")
                cantidad = producto.get("cantidad")
                unidad = producto.get("unidad", "unidad")
                
                # Actualizar o crear producto
                resultado_actualizacion = json.loads(actualizar_despensa.invoke({
                    "item_name": nombre,
                    "cantidad": cantidad,
                    "unidad": unidad
                }))
                resultados.append(resultado_actualizacion)
        
        elif accion == "QUERY":
            if productos:
                # Consultar productos específicos
                for producto in productos:
                    nombre = producto.get("nombre")
                    resultado_consulta = json.loads(consultar_despensa.invoke({"item_name": nombre}))
                    resultados.append(resultado_consulta)
            else:
                # Consulta general - retornar todos los productos
                todos_productos = []
                for nombre, datos in DESPENSA_DB.items():
                    if isinstance(datos, dict):
                        todos_productos.append({
                            "nombre": nombre,
                            "stock": datos.get("stock"),
                            "unidad": datos.get("unidad"),
                            "estado": datos.get("estado")
                        })
                    else:
                        todos_productos.append({
                            "nombre": nombre,
                            "estado": datos
                        })
                
                resultados.append({
                    "accion": "QUERY",
                    "tipo": "todos",
                    "productos": todos_productos,
                    "mensaje": f"Tienes {len(todos_productos)} productos en tu despensa"
                })
        
        elif accion == "SHOPPING_LIST":
            # Generar lista de productos con bajo stock
            productos_bajo_stock = []
            for nombre, datos in DESPENSA_DB.items():
                if isinstance(datos, dict):
                    if datos.get("estado") == "BAJO" or datos.get("stock", 0) == 0:
                        productos_bajo_stock.append({
                            "nombre": nombre,
                            "stock_actual": datos.get("stock", 0),
                            "unidad": datos.get("unidad"),
                            "estado": datos.get("estado")
                        })
                elif datos == "BAJO":
                    productos_bajo_stock.append({
                        "nombre": nombre,
                        "estado": datos
                    })
            
            resultados.append({
                "accion": "SHOPPING_LIST",
                "productos": productos_bajo_stock,
                "mensaje": f"Te faltan {len(productos_bajo_stock)} productos. Lista de compras generada."
            })
        
        resultado_final = {
            "accion_original": accion,
            "resultados": resultados,
            "total_operaciones": len(resultados)
        }
        
        logger.info(f"Procesamiento completado: {len(resultados)} operación(es)")
        
        return json.dumps(resultado_final, ensure_ascii=False)
        
    except Exception as e:
        return json.dumps({
            "accion": "ERROR",
            "error": str(e),
            "mensaje": f"Error procesando extracto: {str(e)}"
        }, ensure_ascii=False)


@tool
def consultar_reposicion_de_productos() -> str:
    """
    Consulta qué productos necesita comprar el usuario basado en su stock crítico.
    
    Esta herramienta calcula qué productos están bajo el stock crítico definido por el usuario
    y genera una lista de compras con los productos que necesita reponer.
    
    Returns:
        JSON string con la lista de productos a comprar/reponer
    """
    print("[TEST] - Consulta sobre reposición de productos")
    
    # Obtener productos con bajo stock (estado BAJO o stock = 0)
    productos_a_comprar = []
    
    for nombre, datos in DESPENSA_DB.items():
        if isinstance(datos, dict):
            estado = datos.get("estado", "MEDIO")
            stock = datos.get("stock", 0)
            
            if estado == "BAJO" or stock == 0:
                productos_a_comprar.append({
                    "nombre": nombre,
                    "stock_actual": stock,
                    "unidad": datos.get("unidad", "unidad"),
                    "estado": estado,
                    "prioridad": "ALTA" if stock == 0 else "MEDIA"
                })
    
    # Generar mensaje de respuesta
    if productos_a_comprar:
        mensaje = f"Necesitas comprar {len(productos_a_comprar)} producto(s):\n\n"
        for idx, producto in enumerate(productos_a_comprar, 1):
            nombre = producto["nombre"]
            stock = producto["stock_actual"]
            unidad = producto["unidad"]
            prioridad = producto["prioridad"]
            
            mensaje += f"{idx}. {nombre.capitalize()}"
            if stock is not None:
                mensaje += f" (tienes {stock} {unidad})"
            if prioridad == "ALTA":
                mensaje += " ⚠️ URGENTE"
            mensaje += "\n"
    else:
        mensaje = "¡Excelente! Tienes todos los productos necesarios. No necesitas comprar nada por ahora."
    
    resultado = {
        "accion": "SHOPPING_LIST",
        "productos": productos_a_comprar,
        "total": len(productos_a_comprar),
        "mensaje": mensaje
    }
    
    return json.dumps(resultado, ensure_ascii=False)


# ============================================================================
# HERRAMIENTAS MULTIMODALES (TOOLS)
# ============================================================================
@tool
def transcribir_audio(audio_file_path: str) -> str:
    """
    Transcribe un archivo de audio a texto usando OpenAI Whisper API.
    
    Args:
        audio_file_path: Ruta al archivo de audio (ej: "audio.wav", "mensaje.mp3")
    
    Returns:
        Texto transcrito que indica lo que el usuario dijo
    
    Raises:
        FileNotFoundError: Si el archivo no existe
        ValueError: Si el formato de archivo no es soportado
    """
    # Validar que el archivo existe
    if not os.path.exists(audio_file_path):
        raise FileNotFoundError(f"El archivo de audio '{audio_file_path}' no existe.")
    
    if not os.path.isfile(audio_file_path):
        raise ValueError(f"'{audio_file_path}' no es un archivo válido.")
    
    # Validar formato de archivo
    # Nota: Whisper soporta: mp3, mp4, mpeg, mpga, m4a, wav, webm
    # WhatsApp envía audios en formato .ogg (OGG Opus), que necesitamos convertir
    valid_extensions = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm', '.ogg']
    file_ext = os.path.splitext(audio_file_path)[1].lower()
    
    if file_ext not in valid_extensions:
        raise ValueError(f"Formato de archivo '{file_ext}' no soportado. Formatos válidos: {', '.join(valid_extensions)}")
    
    # Validar tamaño del archivo (máximo 25 MB para Whisper)
    file_size = os.path.getsize(audio_file_path) / (1024 * 1024)  # MB
    if file_size > 25:
        raise ValueError(f"El archivo es demasiado grande ({file_size:.2f} MB). El máximo es 25 MB.")
    
    # Si es OGG, intentamos primero enviarlo directamente a Whisper
    # Si falla, lo convertimos a WAV
    audio_file_to_use = audio_file_path
    temp_converted_file = None
    
    # Intentar primero con OGG directamente (Whisper puede aceptarlo aunque no esté documentado)
    if file_ext == '.ogg':
        print(f"🔄 Archivo OGG detectado. Intentando transcripción directa primero...")
        try:
            with open(audio_file_path, "rb") as audio_file:
                transcript = openai_client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    language="es"
                )
            texto_transcrito = transcript.text.strip()
            print(f"✅ Transcripción directa exitosa (sin conversión)")
            
            # Extraer información estructurada del texto transcrito
            print(f"\n📊 Extrayendo información estructurada del audio transcrito...")
            extracto = extraer_productos_desde_texto(texto_transcrito)
            
            # Retornar tanto el texto transcrito como el extracto estructurado
            resultado = {
                "texto_transcrito": texto_transcrito,
                "extracto_estructurado": extracto,
                "formato": "JSON_READY"
            }
            
            return json.dumps(resultado, ensure_ascii=False)
        except Exception as direct_error:
            error_msg = str(direct_error).lower()
            if "invalid" in error_msg or "format" in error_msg or "unsupported" in error_msg:
                print(f"⚠️  Whisper rechazó OGG directamente. Convirtiendo a WAV...")
                # Continuar con la conversión
            else:
                # Otro tipo de error, re-lanzar
                raise
    
    # Si llegamos aquí, necesitamos convertir OGG a WAV
    if file_ext == '.ogg':
        if PYDUB_AVAILABLE:
            temp_wav_path = None
            try:
                print(f"🔄 Convirtiendo archivo OGG a WAV...")
                print(f"   Archivo original: {audio_file_path}")
                print(f"   Tamaño: {os.path.getsize(audio_file_path)} bytes")
                
                # Verificar que ffmpeg está disponible
                import subprocess
                try:
                    result = subprocess.run(['ffmpeg', '-version'], capture_output=True, timeout=5)
                    if result.returncode != 0:
                        raise Exception("ffmpeg no está funcionando correctamente")
                    print(f"   ✅ ffmpeg está disponible")
                except FileNotFoundError:
                    raise Exception("ffmpeg no está instalado o no está en PATH. Instala con: brew install ffmpeg (macOS)")
                except Exception as ffmpeg_err:
                    raise Exception(f"Error verificando ffmpeg: {ffmpeg_err}")
                
                # Intentar cargar el archivo OGG usando diferentes métodos
                # WhatsApp envía OGG Opus, que puede necesitar especificación explícita
                audio = None
                try:
                    # Método 1: Intentar con from_file sin especificar formato (pydub detecta automáticamente)
                    audio = AudioSegment.from_file(audio_file_path)
                    print(f"   ✅ Método 1 exitoso: from_file (detección automática)")
                except Exception as e1:
                    print(f"   ⚠️  Método 1 falló: {e1}")
                    try:
                        # Método 2: Intentar especificando formato ogg explícitamente
                        audio = AudioSegment.from_file(audio_file_path, format="ogg")
                        print(f"   ✅ Método 2 exitoso: from_file con format='ogg'")
                    except Exception as e2:
                        print(f"   ⚠️  Método 2 falló: {e2}")
                        try:
                            # Método 3: Intentar con from_ogg específico
                            audio = AudioSegment.from_ogg(audio_file_path)
                            print(f"   ✅ Método 3 exitoso: from_ogg")
                        except Exception as e3:
                            print(f"   ❌ Método 3 falló: {e3}")
                            raise Exception(f"No se pudo cargar el archivo OGG con ningún método. Verifica que el archivo sea válido y que ffmpeg esté instalado correctamente.")
                
                if audio is None:
                    raise Exception("No se pudo cargar el archivo de audio")
                
                print(f"   ✅ Archivo OGG cargado correctamente")
                print(f"   Duración: {len(audio)} ms ({len(audio)/1000:.2f} segundos)")
                
                # Crear archivo temporal WAV
                temp_wav_path = tempfile.mktemp(suffix='.wav')
                
                # Exportar a WAV con parámetros específicos para Whisper
                # Whisper funciona mejor con mono, 16kHz
                audio.export(temp_wav_path, format="wav", parameters=["-ac", "1", "-ar", "16000"])
                
                # Verificar que el archivo convertido existe y tiene contenido
                if not os.path.exists(temp_wav_path):
                    raise Exception("El archivo convertido no se creó")
                
                converted_size = os.path.getsize(temp_wav_path)
                if converted_size == 0:
                    raise Exception("El archivo convertido está vacío")
                
                print(f"✅ Archivo convertido a WAV: {temp_wav_path}")
                print(f"   Tamaño convertido: {converted_size} bytes ({converted_size/1024:.2f} KB)")
                
                audio_file_to_use = temp_wav_path
                # Guardar la ruta para limpieza posterior
                temp_converted_file = temp_wav_path
                    
            except Exception as conv_error:
                print(f"❌ Error convirtiendo OGG a WAV: {conv_error}")
                import traceback
                traceback.print_exc()
                # Limpiar archivo temporal si existe
                if temp_wav_path and os.path.exists(temp_wav_path):
                    try:
                        os.remove(temp_wav_path)
                    except:
                        pass
                # Retornar un mensaje que indique el problema pero que el LLM pueda usar
                # En lugar de "Error:", usamos un formato que el LLM entienda como resultado de herramienta
                return f"[ERROR_CONVERSION] No se pudo procesar el audio OGG. El archivo necesita conversión pero falló: {str(conv_error)}"
        else:
            return f"[ERROR_SETUP] pydub no está disponible. Se requiere para convertir audios de WhatsApp."
    
    try:
        # Transcribir usando OpenAI Whisper API
        with open(audio_file_to_use, "rb") as audio_file:
            transcript = openai_client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language="es"  # Especificar español para mejor precisión
            )
        
        # Retornar el texto transcrito en un formato estructurado
        texto_transcrito = transcript.text.strip()
        
        # Limpiar archivo temporal convertido si existe
        if temp_converted_file and isinstance(temp_converted_file, str):
            if os.path.exists(temp_converted_file):
                try:
                    os.remove(temp_converted_file)
                    print(f"🗑️  Archivo temporal eliminado: {temp_converted_file}")
                except Exception as cleanup_err:
                    print(f"⚠️  No se pudo eliminar archivo temporal: {cleanup_err}")
        
        # Extraer información estructurada del texto transcrito
        print(f"\n📊 Extrayendo información estructurada del audio transcrito...")
        extracto = extraer_productos_desde_texto(texto_transcrito)
        
        # Retornar tanto el texto transcrito como el extracto estructurado
        resultado = {
            "texto_transcrito": texto_transcrito,
            "extracto_estructurado": extracto,
            "formato": "JSON_READY"  # Indica que está listo para integrar con BD
        }
        
        return json.dumps(resultado, ensure_ascii=False)
    
    except Exception as e:
        # Limpiar archivo temporal convertido si existe
        if temp_converted_file and isinstance(temp_converted_file, str):
            if os.path.exists(temp_converted_file):
                try:
                    os.remove(temp_converted_file)
                except:
                    pass
        
        # Manejo de errores de la API
        error_msg = str(e)
        print(f"❌ Error en transcripción de Whisper: {error_msg}")
        
        if "rate_limit" in error_msg.lower():
            return f"[ERROR_RATE_LIMIT] Límite de tasa de Whisper excedido. Intenta de nuevo en unos momentos."
        elif "invalid_file" in error_msg.lower() or "invalid" in error_msg.lower() or "format" in error_msg.lower():
            return f"[ERROR_FORMAT] El archivo de audio no es compatible con Whisper. Formato rechazado."
        else:
            return f"[ERROR_TRANSCRIPTION] Error al transcribir audio con Whisper: {error_msg}"


@tool
def procesar_imagen(image_file_path: str) -> str:
    """
    Procesa una imagen de boleta o factura usando OpenAI Vision API y extrae información sobre los productos.
    
    IMPORTANTE: Esta función SOLO procesa boletas y facturas. Si la imagen no es una boleta/factura,
    retornará un mensaje indicando que solo puede procesar ese tipo de documentos.
    
    Args:
        image_file_path: Ruta al archivo de imagen (ej: "boleta.jpg", "factura.png")
    
    Returns:
        Texto estructurado con la información extraída de la boleta/factura para actualizar el inventario,
        o mensaje de error si no es una boleta/factura
    
    Raises:
        FileNotFoundError: Si el archivo no existe
        ValueError: Si el formato de archivo no es soportado
    """
    # Validar que el archivo existe
    if not os.path.exists(image_file_path):
        raise FileNotFoundError(f"El archivo de imagen '{image_file_path}' no existe.")
    
    if not os.path.isfile(image_file_path):
        raise ValueError(f"'{image_file_path}' no es un archivo válido.")
    
    # Validar formato de archivo
    valid_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
    file_ext = os.path.splitext(image_file_path)[1].lower()
    
    if file_ext not in valid_extensions:
        raise ValueError(f"Formato de archivo '{file_ext}' no soportado. Formatos válidos: {', '.join(valid_extensions)}")
    
    # Validar tamaño del archivo (máximo 20 MB para Vision API)
    file_size = os.path.getsize(image_file_path) / (1024 * 1024)  # MB
    if file_size > 20:
        raise ValueError(f"El archivo es demasiado grande ({file_size:.2f} MB). El máximo es 20 MB.")
    
    try:
        # Leer y codificar la imagen en base64
        with open(image_file_path, "rb") as image_file:
            base64_image = base64.b64encode(image_file.read()).decode('utf-8')
        
        # Determinar el tipo MIME
        mime_type = f"image/{file_ext[1:]}"  # jpg -> image/jpeg
        if file_ext == '.jpg':
            mime_type = 'image/jpeg'
        
        # PRIMERO: Verificar si la imagen es una boleta o factura
        logger.info("Verificando si la imagen es una boleta o factura...")
        verification_prompt = """Analiza esta imagen y determina si es una boleta, factura, ticket de compra o recibo de compra.

Responde SOLO con "SI" si es una boleta/factura/ticket/recibo de compra, o "NO" si es cualquier otro tipo de imagen.

Una boleta/factura/ticket/recibo de compra típicamente contiene:
- Lista de productos comprados
- Precios
- Total a pagar
- Fecha de compra
- Nombre del establecimiento/comercio
- Números de documento (boleta N°, factura N°, etc.)

Si la imagen es una foto de productos en una despensa, de una nevera, de productos en un estante, o cualquier otra cosa que NO sea un documento de compra, responde "NO"."""
        
        verification_response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": verification_prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{base64_image}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=10
        )
        
        verification_result = verification_response.choices[0].message.content.strip().upper()
        logger.info(f"Resultado de verificación: {verification_result}")
        
        # Si NO es una boleta/factura, retornar mensaje apropiado
        if "NO" in verification_result or verification_result == "":
            mensaje_error = (
                "Lo siento, solo puedo procesar imágenes de boletas, facturas, tickets o recibos de compra. "
                "La imagen que enviaste no parece ser un documento de compra.\n\n"
                "Por favor, puedes:\n"
                "• Enviar una foto de tu boleta o factura de compra\n"
                "• O informarme tus compras mediante texto o audio"
            )
            logger.warning(f"Imagen rechazada: no es una boleta/factura")
            return json.dumps({
                "es_boleta": False,
                "mensaje": mensaje_error,
                "error": "IMAGEN_NO_ES_BOLETA"
            }, ensure_ascii=False)
        
        # Si ES una boleta/factura, procesarla normalmente
        logger.info("Imagen verificada como boleta/factura. Procesando...")
        
        # Usar OpenAI Vision API para analizar la boleta/factura
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": """Analiza esta boleta, factura, ticket o recibo de compra.

Identifica TODOS los productos comprados que aparecen en el documento. Para cada producto, extrae:
- Nombre del producto
- Cantidad (si está visible)
- Unidad de medida (kg, litro, unidad, paquete, etc.)

Genera un mensaje estructurado para actualizar el inventario con estos productos.

Formato de respuesta:
- Lista cada producto en una línea separada: "Compra de [cantidad] [unidad] de [producto], establecer a ALTO"
- Si no hay cantidad visible, solo el nombre: "Compra de [producto], establecer a ALTO"

Ejemplos:
- "Compra de 1 kg de arroz, establecer a ALTO"
- "Compra de 2 litros de leche, establecer a ALTO"
- "Compra de pan, establecer a ALTO"
- "Compra de 12 unidades de huevos, establecer a ALTO"

Si no puedes identificar productos claramente, indica: "No se pudieron identificar productos claramente en la boleta"."""
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{base64_image}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=1000
        )
        
        # Extraer el resultado del análisis
        analisis = response.choices[0].message.content.strip()
        logger.info(f"Análisis de boleta completado: {analisis[:200]}...")
        
        # Extraer información estructurada del análisis de la boleta
        logger.info("Extrayendo información estructurada del análisis de boleta...")
        extracto = extraer_productos_desde_texto(analisis)
        
        # Normalizar nombres de productos a versiones genéricas
        if extracto.get("productos"):
            productos_originales = extracto.get("productos", [])
            logger.info(f"Normalizando nombres de productos a versiones genéricas... ({len(productos_originales)} productos)")
            productos_normalizados = []
            
            for producto in productos_originales:
                nombre_original = producto.get("nombre", "").strip()
                if not nombre_original:
                    continue
                
                # Normalizar el nombre del producto
                nombre_normalizado = normalizar_nombre_producto(nombre_original)
                
                # Si el nombre no se pudo reconocer (retorna None), ignorar el producto
                if nombre_normalizado is None:
                    logger.warning(f"Producto ignorado (no reconocido): '{nombre_original}'")
                    continue
                
                # Actualizar el producto con el nombre normalizado
                producto_normalizado = producto.copy()
                producto_normalizado["nombre"] = nombre_normalizado
                productos_normalizados.append(producto_normalizado)
            
            # Agrupar productos duplicados y sumar cantidades
            logger.info("Agrupando productos duplicados...")
            productos_agrupados = agrupar_productos_duplicados(productos_normalizados)
            
            # Actualizar el extracto con los productos normalizados y agrupados
            extracto["productos"] = productos_agrupados
            logger.info(f"Productos procesados: {len(productos_agrupados)} únicos de {len(productos_normalizados)} normalizados (de {len(productos_originales)} originales)")
        
        # Retornar tanto el análisis como el extracto estructurado
        resultado = {
            "es_boleta": True,
            "analisis_imagen": analisis,
            "extracto_estructurado": extracto,
            "formato": "JSON_READY"  # Indica que está listo para integrar con BD
        }
        
        return json.dumps(resultado, ensure_ascii=False)
    
    except Exception as e:
        # Manejo de errores de la API
        error_msg = str(e)
        logger.exception(f"Error procesando imagen: {error_msg}")
        
        if "rate_limit" in error_msg.lower():
            return json.dumps({
                "es_boleta": False,
                "error": "RATE_LIMIT",
                "mensaje": "Error: Límite de tasa excedido. Por favor, intenta de nuevo en unos momentos."
            }, ensure_ascii=False)
        elif "invalid_image" in error_msg.lower() or "invalid_file" in error_msg.lower():
            return json.dumps({
                "es_boleta": False,
                "error": "INVALID_IMAGE",
                "mensaje": f"Error: El archivo '{image_file_path}' no es una imagen válida."
            }, ensure_ascii=False)
        else:
            return json.dumps({
                "es_boleta": False,
                "error": "PROCESSING_ERROR",
                "mensaje": f"Error al procesar imagen: {error_msg}"
            }, ensure_ascii=False)


# ============================================================================
# NODO DEL AGENTE (Razonamiento)
# ============================================================================
def agent_node(state: AgentState) -> AgentState:
    """
    Nodo del agente que usa el LLM para razonar sobre la intención del usuario
    y decidir qué herramienta usar. Maneja entradas de texto, audio e imágenes.
    """
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    
    # Obtener los mensajes del estado y el archivo multimedia
    messages = state["messages"]
    media_file_path = state.get("media_file_path")
    
    # Determinar qué herramientas están disponibles según el contexto
    all_tools = [
        consultar_despensa, 
        actualizar_despensa, 
        consultar_reposicion_de_productos
    ]
    
    # Si hay un archivo multimedia, agregar las herramientas multimodales
    if media_file_path:
        # Determinar el tipo de archivo por extensión
        file_ext = os.path.splitext(media_file_path)[1].lower()
        if file_ext in ['.wav', '.mp3', '.m4a', '.ogg', '.flac', '.aac']:
            # Es un archivo de audio
            all_tools = [
                transcribir_audio, 
                consultar_despensa, 
                actualizar_despensa, 
                consultar_reposicion_de_productos
            ]
        elif file_ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp']:
            # Es una imagen
            all_tools = [
                procesar_imagen, 
                consultar_despensa, 
                actualizar_despensa, 
                consultar_reposicion_de_productos
            ]
    
    # Preparar el prompt del sistema
    system_prompt = SYSTEM_PROMPT
    
    # Crear mensajes para el LLM con las herramientas disponibles
    llm_with_tools = llm.bind_tools(all_tools)
    
    # Si hay un archivo multimedia y aún no se ha procesado, agregar contexto
    if media_file_path and not any("transcribir_audio" in str(msg) or "procesar_imagen" in str(msg) for msg in messages):
        file_ext = os.path.splitext(media_file_path)[1].lower()
        if file_ext in ['.wav', '.mp3', '.m4a', '.ogg', '.flac', '.aac']:
            # Agregar contexto sobre el archivo de audio
            audio_context = f"El usuario ha enviado un archivo de audio: {media_file_path}. Debes transcribirlo primero usando 'transcribir_audio'."
            if messages:
                messages = [HumanMessage(content=audio_context)] + list(messages)
            else:
                messages = [HumanMessage(content=audio_context)]
        elif file_ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp']:
            # Agregar contexto sobre la imagen
            image_context = f"El usuario ha enviado una imagen: {media_file_path}. Debes procesarla primero usando 'procesar_imagen'."
            if messages:
                messages = [HumanMessage(content=image_context)] + list(messages)
            else:
                messages = [HumanMessage(content=image_context)]
    
    # Preparar mensajes con el prompt del sistema
    # Verificar si ya hay un SystemMessage en los mensajes
    has_system_message = any(isinstance(msg, SystemMessage) for msg in messages)
    
    if not has_system_message:
        # Agregar el prompt del sistema al inicio
        messages_with_system = [SystemMessage(content=system_prompt)] + list(messages)
    else:
        messages_with_system = list(messages)
    
    # Obtener respuesta del LLM
    response = llm_with_tools.invoke(messages_with_system)
    
    # Actualizar el estado con la respuesta del agente
    return {
        "messages": messages + [response],
        "user_input": state["user_input"],
        "media_file_path": state.get("media_file_path")
    }


# ============================================================================
# ENRUTADOR (Router/Decisor)
# ============================================================================
def should_continue(state: AgentState) -> Literal["tools", "end"]:
    """
    Decide si continuar ejecutando herramientas o terminar.
    
    Returns:
        "tools" si hay tool calls en el último mensaje
        "end" si no hay tool calls y el agente ha respondido
    """
    messages = state["messages"]
    last_message = messages[-1]
    
    # Si el último mensaje tiene tool calls, ejecutar herramientas
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"
    
    # Si no hay tool calls, terminar
    return "end"


# ============================================================================
# CONSTRUCCIÓN DEL GRAFO
# ============================================================================
def create_despensa_graph():
    """
    Crea y retorna el grafo de LangGraph para el agente de despensa.
    """
    # Crear el grafo
    workflow = StateGraph(AgentState)
    
    # Agregar nodos
    # Incluir todas las herramientas en el ToolNode
    all_tools = [
        consultar_despensa,
        actualizar_despensa,
        consultar_reposicion_de_productos,
        transcribir_audio,
        procesar_imagen,
        procesar_extracto_productos
    ]
    workflow.add_node("agent", agent_node)
    workflow.add_node("tools", ToolNode(all_tools))
    
    # Definir el punto de entrada
    workflow.set_entry_point("agent")
    
    # Agregar aristas condicionales desde el agente
    workflow.add_conditional_edges(
        "agent",
        should_continue,
        {
            "tools": "tools",
            "end": END
        }
    )
    
    # Después de ejecutar herramientas, volver al agente para generar respuesta final
    workflow.add_edge("tools", "agent")
    
    # Compilar el grafo
    app = workflow.compile()
    
    return app


# ============================================================================
# FUNCIÓN AUXILIAR PARA GENERAR RESPUESTAS MEJORADAS
# ============================================================================
def _generar_respuesta_desde_resultado(
    extracto: Dict[str, Any],
    resultado_procesado: Dict[str, Any],
    respuesta_original: str
) -> str:
    """
    Genera una respuesta más directa y útil basada en el resultado procesado.
    
    Args:
        extracto: Extracto estructurado original
        resultado_procesado: Resultado del procesamiento del extracto
        respuesta_original: Respuesta original del agente
    
    Returns:
        Respuesta mejorada y más directa
    """
    accion = extracto.get("accion")
    resultados = resultado_procesado.get("resultados", [])
    
    if accion == "SHOPPING_LIST" and resultados:
        # Generar lista de compras directa
        resultado = resultados[0] if resultados else {}
        
        # Si el resultado viene de consultar_reposicion_de_productos directamente
        if resultado.get("mensaje"):
            return resultado.get("mensaje")
        
        productos = resultado.get("productos", [])
        
        if productos:
            mensaje = "📋 **Lista de compras:**\n\n"
            for idx, producto in enumerate(productos, 1):
                nombre = producto.get("nombre", "")
                stock_actual = producto.get("stock_actual", 0)
                unidad = producto.get("unidad", "unidad")
                estado = producto.get("estado", "")
                prioridad = producto.get("prioridad", "")
                
                mensaje += f"{idx}. **{nombre.capitalize()}**"
                if stock_actual is not None:
                    mensaje += f" (tienes {stock_actual} {unidad})"
                if prioridad == "ALTA":
                    mensaje += " ⚠️ URGENTE"
                mensaje += "\n"
            
            mensaje += f"\n✅ Total: {len(productos)} producto(s) para comprar"
            return mensaje
        else:
            return "✅ ¡Excelente! Tienes todos los productos necesarios. No necesitas comprar nada por ahora."
    
    elif accion in ["UPDATE", "CREATE"] and resultados:
        # Generar resumen de actualizaciones
        mensaje = "✅ **Actualización de despensa:**\n\n"
        exitosos = [r for r in resultados if r.get("exito", False)]
        fallidos = [r for r in resultados if not r.get("exito", False)]
        
        if exitosos:
            for resultado in exitosos:
                producto = resultado.get("producto", "")
                stock = resultado.get("stock")
                unidad = resultado.get("unidad", "unidad")
                estado = resultado.get("estado", "")
                
                mensaje += f"• **{producto.capitalize()}**: {stock} {unidad} (estado: {estado})\n"
        
        if fallidos:
            mensaje += "\n⚠️ Algunos productos no pudieron ser actualizados."
        
        return mensaje
    
    elif accion == "QUERY" and resultados:
        # Generar respuesta de consulta directa
        resultado = resultados[0] if resultados else {}
        
        if resultado.get("tipo") == "todos":
            productos = resultado.get("productos", [])
            mensaje = f"📦 **Tu despensa tiene {len(productos)} producto(s):**\n\n"
            
            for producto in productos:
                nombre = producto.get("nombre", "")
                stock = producto.get("stock")
                unidad = producto.get("unidad", "unidad")
                estado = producto.get("estado", "")
                
                mensaje += f"• **{nombre.capitalize()}**: "
                if stock is not None:
                    mensaje += f"{stock} {unidad} - "
                mensaje += f"Estado: {estado}\n"
            
            return mensaje
        else:
            # Consulta específica
            producto = resultado.get("producto", "")
            encontrado = resultado.get("encontrado", False)
            
            if encontrado:
                stock = resultado.get("stock")
                unidad = resultado.get("unidad", "unidad")
                estado = resultado.get("estado", "")
                
                mensaje = f"📦 **{producto.capitalize()}**: "
                if stock is not None:
                    mensaje += f"{stock} {unidad} - "
                mensaje += f"Estado: {estado}"
                return mensaje
            else:
                return f"❌ No encontré '{producto}' en tu despensa."
    
    # Si no hay un formato específico, usar la respuesta original
    return respuesta_original


# ============================================================================
# FUNCIÓN PRINCIPAL PARA PROBAR EL AGENTE
# ============================================================================
def run_agent(user_input: str = "", chat_history: list[BaseMessage] = None, media_file_path: Optional[str] = None):
    """
    Ejecuta el agente con un input del usuario (texto, audio o imagen).
    
    Args:
        user_input: Mensaje del usuario en texto (simulado desde WhatsApp)
        chat_history: Historial previo de la conversación (opcional)
        media_file_path: Ruta al archivo multimedia (audio o imagen) (opcional)
    
    Returns:
        Respuesta del agente
    """
    # Crear el grafo
    app = create_despensa_graph()
    
    # Preparar el estado inicial
    initial_messages = chat_history if chat_history else []
    
    # Si hay un archivo multimedia, no necesariamente necesitamos texto
    if user_input:
        initial_messages.append(HumanMessage(content=user_input))
    elif media_file_path:
        # Si solo hay archivo multimedia, agregar un mensaje indicando que hay un archivo
        file_type = "audio" if os.path.splitext(media_file_path)[1].lower() in ['.wav', '.mp3', '.m4a', '.ogg', '.flac', '.aac'] else "imagen"
        initial_messages.append(HumanMessage(content=f"El usuario ha enviado un archivo {file_type}: {media_file_path}"))
    
    initial_state = {
        "messages": initial_messages,
        "user_input": user_input or "",
        "media_file_path": media_file_path
    }
    
    # Ejecutar el grafo
    result = app.invoke(initial_state)
    
    # Obtener la última respuesta del agente
    last_message = result["messages"][-1]
    respuesta_final = last_message.content if hasattr(last_message, "content") else str(last_message)
    
    # Buscar resultados directos de consultar_reposicion_de_productos
    resultado_reposicion = None
    for msg in reversed(result["messages"]):
        if hasattr(msg, "content"):
            contenido = msg.content
            # Buscar si hay un resultado de consultar_reposicion_de_productos
            if isinstance(contenido, str) and "SHOPPING_LIST" in contenido:
                try:
                    datos = json.loads(contenido)
                    if datos.get("accion") == "SHOPPING_LIST" and datos.get("mensaje"):
                        resultado_reposicion = datos
                        break
                except:
                    pass
    
    # Si hay resultado directo de reposición, usarlo
    if resultado_reposicion and resultado_reposicion.get("mensaje"):
        return {
            "respuesta": resultado_reposicion.get("mensaje"),
            "extracto_estructurado": {
                "accion": "SHOPPING_LIST",
                "productos": resultado_reposicion.get("productos", []),
                "intencion": "consulta de productos a reponer"
            },
            "resultado_procesado": resultado_reposicion,
            "formato": "JSON_READY"
        }
    
    # Buscar extractos estructurados en los mensajes de herramientas y verificar errores de procesamiento de imagen
    extracto_estructurado = None
    imagen_no_es_boleta = False
    mensaje_error_imagen = None
    
    for msg in reversed(result["messages"]):
        if hasattr(msg, "content"):
            contenido = msg.content
            
            # Verificar si es un error de imagen no boleta
            if isinstance(contenido, str):
                try:
                    datos = json.loads(contenido)
                    if isinstance(datos, dict) and datos.get("es_boleta") is False:
                        if datos.get("error") == "IMAGEN_NO_ES_BOLETA":
                            imagen_no_es_boleta = True
                            mensaje_error_imagen = datos.get("mensaje", "La imagen no es una boleta o factura.")
                            logger.warning("Imagen rechazada: no es boleta/factura")
                            break
                except (json.JSONDecodeError, AttributeError):
                    pass
            
            # Buscar si hay un extracto estructurado en el contenido (solo si no es error de imagen)
            if isinstance(contenido, str) and "extracto_estructurado" in contenido and not imagen_no_es_boleta:
                try:
                    datos = json.loads(contenido)
                    if "extracto_estructurado" in datos:
                        extracto_estructurado = datos["extracto_estructurado"]
                        break
                except:
                    pass
    
    # Si la imagen no es una boleta, retornar el mensaje de error directamente
    if imagen_no_es_boleta:
        return {
            "respuesta": mensaje_error_imagen or "Lo siento, solo puedo procesar imágenes de boletas o facturas.",
            "extracto_estructurado": None,
            "formato": "ERROR"
        }
    
    # Si hay extracto estructurado, procesarlo y retornar información completa
    if extracto_estructurado:
        try:
            resultado_procesado = json.loads(procesar_extracto_productos.invoke({
                "extracto_json": json.dumps(extracto_estructurado)
            }))
            
            # Generar respuesta más directa basada en el resultado procesado
            respuesta_mejorada = _generar_respuesta_desde_resultado(
                extracto_estructurado, resultado_procesado, respuesta_final
            )
            
            # Retornar respuesta con extracto procesado para integración con BD
            return {
                "respuesta": respuesta_mejorada,
                "extracto_estructurado": extracto_estructurado,
                "resultado_procesado": resultado_procesado,
                "formato": "JSON_READY"
            }
        except Exception as e:
            logger.error(f"Error procesando extracto: {e}")
            import traceback
            traceback.print_exc()
            # Retornar solo la respuesta si falla el procesamiento
            return respuesta_final
    
    return respuesta_final


# ============================================================================
# EJECUCIÓN PRINCIPAL (Para pruebas)
# ============================================================================
if __name__ == "__main__":
    # Verificar que existe la API key
    if not os.getenv("OPENAI_API_KEY"):
        print("⚠️  Error: OPENAI_API_KEY no encontrada en las variables de entorno.")
        print("   Por favor, crea un archivo .env con tu API key de OpenAI.")
        exit(1)
    
    print("🏪 Agente de Despensa - MVP Multimodal")
    print("=" * 50)
    print("\nEstado inicial de la despensa:")
    for item, estado in DESPENSA_DB.items():
        print(f"  - {item}: {estado}")
    print("\n" + "=" * 50)
    print("\n💬 Puedes hacer consultas o actualizaciones de tres formas:")
    print("\n1️⃣  TEXTO:")
    print("   - '¿Qué me falta?'")
    print("   - '¿Tengo leche?'")
    print("   - 'Compré huevos'")
    print("   - 'Se me acabó el pan'")
    print("\n2️⃣  AUDIO (simulado):")
    print("   - 'audio:compre_pan.wav'")
    print("   - 'audio:que_falta.mp3'")
    print("\n3️⃣  IMAGEN (simulado):")
    print("   - 'imagen:despensa.jpg'")
    print("   - 'imagen:compra_arroz.png'")
    print("\nEscribe 'salir' para terminar.\n")
    
    chat_history = []
    
    while True:
        user_input = input("\n👤 Tú: ").strip()
        
        if user_input.lower() in ["salir", "exit", "quit"]:
            print("\n👋 ¡Hasta luego!")
            break
        
        if not user_input:
            continue
        
        try:
            # Detectar si el input es un archivo multimedia
            media_file_path = None
            text_input = user_input
            
            # Detectar formato: "audio:archivo.wav" o "imagen:archivo.jpg"
            if user_input.startswith("audio:"):
                media_file_path = user_input.replace("audio:", "").strip()
                text_input = ""
            elif user_input.startswith("imagen:"):
                media_file_path = user_input.replace("imagen:", "").strip()
                text_input = ""
            elif os.path.exists(user_input) and os.path.isfile(user_input):
                # Si es una ruta de archivo válida
                media_file_path = user_input
                text_input = ""
            
            print("\n🤖 Agente: ", end="", flush=True)
            response = run_agent(text_input, chat_history, media_file_path)
            print(response)
            
            # Actualizar historial
            if text_input:
                chat_history.append(HumanMessage(content=text_input))
            elif media_file_path:
                file_type = "audio" if os.path.splitext(media_file_path)[1].lower() in ['.wav', '.mp3', '.m4a', '.ogg', '.flac', '.aac'] else "imagen"
                chat_history.append(HumanMessage(content=f"Archivo {file_type}: {media_file_path}"))
            chat_history.append(AIMessage(content=response))
            
        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback
            traceback.print_exc()

