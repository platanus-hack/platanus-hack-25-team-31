"""Handler para procesar webhooks de WhatsApp."""

from typing import Dict, Any, Optional
from flask import Request

from handlers.message_handler import MessageHandler
from utils.logger import get_logger

logger = get_logger(__name__)


class WebhookHandler:
    """Maneja el procesamiento de webhooks de WhatsApp."""
    
    def __init__(self, message_handler: MessageHandler):
        """
        Inicializa el handler de webhooks.
        
        Args:
            message_handler: Handler para procesar mensajes
        """
        self.message_handler = message_handler
        self.processed_message_ids: set[str] = set()
        self.chat_histories: Dict[str, list] = {}
        self.stats = {
            "total_requests": 0,
            "from_meta": 0,
            "not_from_meta": 0,
            "with_messages": 0,
            "test_messages": 0,
            "real_messages": 0,
            "duplicate_messages": 0,
        }
    
    def process_webhook(self, request: Request) -> tuple[Dict[str, Any], int]:
        """
        Procesa un webhook de WhatsApp.
        
        Args:
            request: Request de Flask
        
        Returns:
            Tupla con (respuesta JSON, código de estado HTTP)
        """
        self.stats["total_requests"] += 1
        
        # Verificar si viene de Meta
        user_agent = request.headers.get("User-Agent", "")
        if "facebook" in user_agent.lower() or "meta" in user_agent.lower():
            self.stats["from_meta"] += 1
        else:
            self.stats["not_from_meta"] += 1
            logger.warning(f"Request NO viene de Meta (User-Agent: {user_agent})")
        
        try:
            data = request.get_json()
            
            if not data:
                logger.warning("No se recibieron datos en el webhook")
                return {"status": "error", "message": "No data received"}, 400
            
            # Validar objeto de WhatsApp
            if data.get("object") != "whatsapp_business_account":
                logger.debug(f"Objeto no es whatsapp_business_account: {data.get('object')}")
                return {"status": "ok"}, 200
            
            entries = data.get("entry", [])
            if not entries:
                logger.debug("No hay entradas en el webhook (puede ser notificación de estado)")
                return {"status": "ok"}, 200
            
            mensajes_procesados = 0
            
            for entry in entries:
                changes = entry.get("changes", [])
                
                for change in changes:
                    value = change.get("value", {})
                    messages = value.get("messages", [])
                    statuses = value.get("statuses", [])
                    
                    # Ignorar notificaciones de estado
                    if not messages:
                        if statuses:
                            logger.debug(
                                f"Notificación de estado recibida: "
                                f"{[s.get('status') for s in statuses]}"
                            )
                        continue
                    
                    self.stats["with_messages"] += 1
                    logger.info(f"Procesando {len(messages)} mensaje(s)...")
                    
                    for message in messages:
                        processed = self._process_message(message, value)
                        if processed:
                            mensajes_procesados += 1
            
            logger.info(f"Webhook procesado: {mensajes_procesados} mensaje(s)")
            return {
                "status": "ok",
                "messages_processed": mensajes_procesados
            }, 200
            
        except Exception as e:
            logger.exception(f"Error procesando webhook: {e}")
            return {"status": "error", "message": str(e)}, 500
    
    def _process_message(
        self,
        message: Dict[str, Any],
        value: Dict[str, Any],
    ) -> bool:
        """
        Procesa un mensaje individual.
        
        Args:
            message: Datos del mensaje
            value: Valor del cambio del webhook
        
        Returns:
            True si el mensaje fue procesado, False en caso contrario
        """
        from_number = message.get("from")
        message_id = message.get("id")
        message_type = message.get("type")
        
        if not from_number:
            logger.error("No se encontró número de teléfono en el mensaje")
            return False
        
        # Verificar duplicados
        if message_id and message_id in self.processed_message_ids:
            self.stats["duplicate_messages"] += 1
            logger.warning(f"Mensaje duplicado detectado - ID: {message_id}")
            return False
        
        # Marcar como procesado
        if message_id:
            self.processed_message_ids.add(message_id)
            # Limpiar mensajes antiguos
            if len(self.processed_message_ids) > 1000:
                self.processed_message_ids = set(
                    list(self.processed_message_ids)[-900:]
                )
        
        # Obtener o crear historial
        if from_number not in self.chat_histories:
            self.chat_histories[from_number] = []
            logger.info(f"Nuevo historial creado para {from_number}")
        else:
            logger.debug(
                f"Historial existente para {from_number} "
                f"({len(self.chat_histories[from_number])} mensajes)"
            )
        
        chat_history = self.chat_histories[from_number]
        
        # Detectar tipo de mensaje
        is_test = from_number in ["16315551181", "1234567890"]
        if is_test:
            self.stats["test_messages"] += 1
        else:
            self.stats["real_messages"] += 1
        
        # Procesar según el tipo
        try:
            if message_type == "text":
                text_body = message.get("text", {}).get("body", "")
                logger.info(f"Procesando mensaje de texto de {from_number}")
                self.message_handler.process_text_message(
                    from_number, text_body, chat_history
                )
                return True
            
            elif message_type in ["audio", "voice"]:
                audio_data = message.get("audio") or message.get("voice")
                if audio_data:
                    media_id = audio_data.get("id")
                    mime_type = audio_data.get("mime_type", "audio/ogg")
                    logger.info(f"Procesando mensaje de audio de {from_number}")
                    self.message_handler.process_audio_message(
                        from_number, media_id, mime_type, chat_history
                    )
                    return True
                else:
                    logger.warning("No se encontraron datos de audio en el mensaje")
                    return False
            
            elif message_type == "image":
                image_data = message.get("image", {})
                if image_data:
                    media_id = image_data.get("id")
                    mime_type = image_data.get("mime_type", "image/jpeg")
                    logger.info(f"Procesando mensaje de imagen de {from_number}")
                    self.message_handler.process_image_message(
                        from_number, media_id, mime_type, chat_history
                    )
                    return True
                else:
                    logger.warning("No se encontraron datos de imagen en el mensaje")
                    return False
            
            else:
                logger.warning(f"Tipo de mensaje no soportado: {message_type}")
                self.message_handler.whatsapp_service.send_text_message(
                    from_number,
                    "Lo siento, solo puedo procesar mensajes de texto, audio e imágenes."
                )
                return True
                
        except Exception as e:
            logger.exception(f"Error procesando mensaje: {e}")
            return False
    
    def get_stats(self) -> Dict[str, Any]:
        """Obtiene estadísticas del webhook handler."""
        return {
            "webhook_stats": self.stats,
            "chat_histories_count": len(self.chat_histories),
            "processed_messages_count": len(self.processed_message_ids),
        }

