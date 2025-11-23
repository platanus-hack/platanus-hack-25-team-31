"""
Servidor Flask para integrar el Agente de Despensa con WhatsApp.

Usa Meta WhatsApp Cloud API para recibir y enviar mensajes.
"""

import json
import asyncio
from flask import Flask, request, jsonify

from config.settings import Settings
from services.whatsapp_service import WhatsAppService
from services.media_service import MediaService
from handlers.message_handler import MessageHandler
from handlers.webhook_handler import WebhookHandler
from utils.logger import get_logger, setup_logging
from scrapper.jumbo_add_to_cart import add_to_cart

# Configurar logging
setup_logging(level="INFO")
logger = get_logger(__name__)

# Cargar configuración
try:
    settings = Settings.load()
except Exception as e:
    logger.error(f"Error cargando configuración: {e}")
    raise

# Inicializar servicios
whatsapp_service = WhatsAppService(settings.whatsapp)
media_service = MediaService(settings.whatsapp)

# Inicializar handlers
message_handler = MessageHandler(whatsapp_service, media_service)
webhook_handler = WebhookHandler(message_handler)

# Crear aplicación Flask
app = Flask(__name__)


@app.route("/webhook", methods=["GET"])
def verify_webhook():
    """
    Verifica el webhook de WhatsApp (requerido por Meta).

    Meta envía un GET request con:
    - hub.mode: "subscribe"
    - hub.verify_token: Token configurado
    - hub.challenge: String aleatorio a retornar
    """
    mode = request.args.get("hub.mode")
    token = request.args.get("hub.verify_token")
    challenge = request.args.get("hub.challenge")

    if mode == "subscribe" and token == settings.whatsapp.verify_token:
        logger.info("Webhook verificado correctamente")
        return challenge, 200
    else:
        logger.warning("Verificación de webhook fallida")
        return "Forbidden", 403


@app.route("/webhook", methods=["POST"])
def handle_webhook():
    """
    Maneja los mensajes entrantes de WhatsApp.

    Meta envía un POST request con los datos del mensaje.
    """
    response, status_code = webhook_handler.process_webhook(request)
    return jsonify(response), status_code


@app.route("/debug", methods=["GET", "POST"])
def debug_endpoint():
    """
    Endpoint de debug para ver los datos recibidos (similar a n8n).
    """
    if request.method == "GET":
        return jsonify({
            "status": "debug_endpoint_active",
            "message": "Envía un POST con datos para verlos aquí",
            "webhook_url": "/webhook"
        })

    # Mostrar datos recibidos de forma legible
    data = request.get_json() if request.is_json else request.form.to_dict()
    headers = dict(request.headers)

    debug_info = {
        "method": request.method,
        "headers": headers,
        "data": data,
        "raw_data": request.get_data(as_text=True) if not request.is_json else None
    }

    logger.info("DEBUG ENDPOINT - Datos recibidos")
    logger.debug(json.dumps(debug_info, indent=2, ensure_ascii=False))

    return jsonify(debug_info)


@app.route("/stats", methods=["GET"])
def get_stats():
    """
    Endpoint para ver estadísticas de webhooks recibidos.
    """
    stats = webhook_handler.get_stats()
    return jsonify(stats)


@app.route("/cart/fill", methods=["POST"])
def fill_cart():
    """
    Endpoint para llenar el carrito en Jumbo.
    Recibe una lista de productos: [{"name": "Arroz"}, ...]
    """
    data = request.get_json()
    if not data or not isinstance(data, list):
        return jsonify({"error": "Invalid input, expected list of products"}), 400

    try:
        normalized = []
        for item in data:
            if isinstance(item, str):
                normalized.append({"name": item})
            elif isinstance(item, dict) and "name" in item:
                normalized.append(item)

        logger.info(f"Filling cart with {len(normalized)} items...")
        url = asyncio.run(add_to_cart(normalized))
        return jsonify({"url": url})
    except Exception as e:
        logger.error(f"Error filling cart: {e}")
        return jsonify({"error": str(e)}), 500


@app.before_request
def log_request_info():
    """Log todas las requests para debugging."""
    if request.path == "/webhook" and request.method == "POST":
        logger.debug(f"{request.method} {request.path}")
        logger.debug(f"Headers: {dict(request.headers)}")
        logger.debug(f"Remote Addr: {request.remote_addr}")


def main():
    """Función principal para ejecutar el servidor."""
    logger.info("=" * 70)
    logger.info("🚀 Iniciando servidor de WhatsApp...")
    logger.info(f"📡 Webhook URL: https://tu-dominio.com/webhook")
    logger.info(f"🔐 Verify Token: {settings.whatsapp.verify_token}")
    logger.info(f"🌐 Puerto: {settings.server.port}")
    logger.info("=" * 70)
    logger.info("🔍 Endpoints disponibles:")
    logger.info("   - POST /webhook (webhook principal de WhatsApp)")
    logger.info("   - POST /cart/fill (llenar carrito jumbo)")
    logger.info("   - GET/POST /debug (endpoint de debug para ver datos)")
    logger.info("   - GET /stats (estadísticas de webhooks recibidos)")
    logger.info("=" * 70)
    logger.info("💡 Para desarrollo local, usa ngrok:")
    logger.info(f"   ngrok http {settings.server.port}")
    logger.info(
        "   Luego configura el webhook en Meta con: https://tu-url-ngrok.ngrok.io/webhook")
    logger.info("=" * 70)

    app.run(
        host=settings.server.host,
        port=settings.server.port,
        debug=settings.server.debug,
    )


if __name__ == "__main__":
    main()
