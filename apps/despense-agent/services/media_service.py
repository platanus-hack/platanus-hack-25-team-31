"""Servicio para descargar archivos multimedia de WhatsApp."""

import tempfile
import requests
from pathlib import Path
from typing import Optional
from config.settings import WhatsAppConfig
from utils.logger import get_logger

logger = get_logger(__name__)


class MediaService:
    """Servicio para descargar archivos multimedia desde WhatsApp Cloud API."""
    
    # Mapeo de tipos MIME a extensiones de archivo
    MIME_TO_EXTENSION = {
        "audio/ogg": ".ogg",
        "audio/ogg; codecs=opus": ".ogg",
        "audio/mpeg": ".mp3",
        "audio/mp4": ".m4a",
        "audio/wav": ".wav",
        "audio/x-m4a": ".m4a",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }
    
    def __init__(self, config: WhatsAppConfig):
        """
        Inicializa el servicio de media.
        
        Args:
            config: Configuración de WhatsApp
        """
        self.config = config
        self.headers = {"Authorization": f"Bearer {config.token}"}
    
    def download_media(self, media_id: str, mime_type: str) -> Optional[str]:
        """
        Descarga un archivo multimedia desde WhatsApp Cloud API.
        
        Args:
            media_id: ID del archivo multimedia en WhatsApp
            mime_type: Tipo MIME del archivo (ej: "audio/ogg", "image/jpeg")
        
        Returns:
            Ruta al archivo descargado temporalmente, o None si falla
        """
        media_url = (
            f"https://graph.facebook.com/{self.config.api_version}/{media_id}"
        )
        
        try:
            logger.info(f"Descargando media: {media_id} ({mime_type})")
            
            # Obtener URL de descarga
            response = requests.get(media_url, headers=self.headers, timeout=30)
            response.raise_for_status()
            media_data = response.json()
            download_url = media_data.get("url")
            
            if not download_url:
                logger.error("No se encontró URL de descarga en la respuesta")
                logger.debug(f"Respuesta completa: {media_data}")
                return None
            
            # Descargar el archivo
            logger.debug(f"Descargando archivo desde: {download_url[:100]}...")
            download_response = requests.get(
                download_url, headers=self.headers, timeout=60
            )
            download_response.raise_for_status()
            
            file_size = len(download_response.content)
            logger.info(f"Archivo descargado: {file_size} bytes ({file_size / 1024:.2f} KB)")
            
            # Determinar extensión
            extension = self.MIME_TO_EXTENSION.get(mime_type, ".tmp")
            logger.debug(f"MIME Type: {mime_type}, Extensión: {extension}")
            
            # Guardar en archivo temporal
            with tempfile.NamedTemporaryFile(
                delete=False, suffix=extension
            ) as tmp_file:
                tmp_file.write(download_response.content)
                tmp_path = tmp_file.name
                logger.info(f"Archivo guardado en: {tmp_path}")
                return tmp_path
                
        except requests.exceptions.Timeout:
            logger.error("Timeout descargando archivo multimedia")
            return None
        except requests.exceptions.RequestException as e:
            logger.error(f"Error descargando archivo multimedia: {e}")
            if hasattr(e, "response") and e.response is not None:
                logger.error(f"Status Code: {e.response.status_code}")
                logger.error(f"Response: {e.response.text[:500]}")
            return None
        except Exception as e:
            logger.exception(f"Error inesperado descargando archivo: {e}")
            return None

