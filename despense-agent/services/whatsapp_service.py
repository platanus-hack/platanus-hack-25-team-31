"""Servicio para interactuar con WhatsApp Cloud API."""

import requests
from typing import Optional
from config.settings import WhatsAppConfig
from utils.logger import get_logger

logger = get_logger(__name__)


class WhatsAppService:
    """Servicio para enviar mensajes a través de WhatsApp Cloud API."""
    
    def __init__(self, config: WhatsAppConfig):
        """
        Inicializa el servicio de WhatsApp.
        
        Args:
            config: Configuración de WhatsApp
        """
        self.config = config
        self.headers = {
            "Authorization": f"Bearer {config.token}",
            "Content-Type": "application/json",
        }
    
    def send_text_message(self, to: str, message: str) -> bool:
        """
        Envía un mensaje de texto a través de WhatsApp Cloud API.
        
        Args:
            to: Número de teléfono del destinatario (formato: 1234567890)
            message: Mensaje de texto a enviar
        
        Returns:
            True si el mensaje se envió correctamente, False en caso contrario
        """
        phone_number = self._format_phone_number(to)
        
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone_number,
            "type": "text",
            "text": {
                "preview_url": False,
                "body": message,
            },
        }
        
        try:
            logger.info(f"Enviando mensaje a WhatsApp: {phone_number}")
            logger.debug(f"Mensaje: {message[:100]}...")
            
            response = requests.post(
                self.config.api_url,
                headers=self.headers,
                json=payload,
                timeout=30,
            )
            
            if response.status_code == 200:
                logger.info("Mensaje enviado correctamente")
                logger.debug(f"Respuesta: {response.json()}")
                return True
            else:
                logger.error(
                    f"Error enviando mensaje: {response.status_code} - {response.text}"
                )
                return False
                
        except requests.exceptions.Timeout:
            logger.error("Timeout enviando mensaje a WhatsApp")
            return False
        except requests.exceptions.RequestException as e:
            logger.error(f"Error enviando mensaje a WhatsApp: {e}")
            if hasattr(e, "response") and e.response is not None:
                logger.error(f"Status Code: {e.response.status_code}")
                logger.error(f"Respuesta: {e.response.text}")
            return False
        except Exception as e:
            logger.exception(f"Error inesperado enviando mensaje: {e}")
            return False
    
    @staticmethod
    def _format_phone_number(phone: str) -> str:
        """
        Formatea el número de teléfono removiendo caracteres especiales.
        
        Args:
            phone: Número de teléfono con o sin formato
        
        Returns:
            Número de teléfono formateado (solo dígitos)
        """
        return phone.replace("+", "").replace(" ", "").replace("-", "")

