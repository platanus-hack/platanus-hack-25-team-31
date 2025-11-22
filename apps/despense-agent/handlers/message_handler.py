"""Handler para procesar diferentes tipos de mensajes de WhatsApp."""

import os
from typing import Optional, Dict, Any
from langchain_core.messages import HumanMessage, AIMessage

import sys
from pathlib import Path

# Agregar el directorio padre al path para importaciones
sys.path.insert(0, str(Path(__file__).parent.parent))

from agent.despensa_agent import run_agent
from services.whatsapp_service import WhatsAppService
from services.media_service import MediaService
from utils.logger import get_logger

logger = get_logger(__name__)


class MessageHandler:
    """Maneja el procesamiento de mensajes de WhatsApp."""
    
    def __init__(
        self,
        whatsapp_service: WhatsAppService,
        media_service: MediaService,
    ):
        """
        Inicializa el handler de mensajes.
        
        Args:
            whatsapp_service: Servicio para enviar mensajes a WhatsApp
            media_service: Servicio para descargar archivos multimedia
        """
        self.whatsapp_service = whatsapp_service
        self.media_service = media_service
    
    def process_text_message(
        self,
        from_number: str,
        text: str,
        chat_history: list,
    ) -> None:
        """
        Procesa un mensaje de texto.
        
        Args:
            from_number: Número de teléfono del remitente
            text: Texto del mensaje
            chat_history: Historial de conversación
        """
        try:
            logger.info(f"Mensaje de texto recibido de {from_number}: {text}")
            
            # Ejecutar el agente
            response = run_agent(text, chat_history, None)
            
            # Manejar respuesta estructurada o simple
            respuesta_texto = self._extract_response_text(response)
            extracto_estructurado = self._extract_structured_data(response)
            
            if extracto_estructurado:
                self._log_structured_extract(extracto_estructurado, response)
            
            # Enviar respuesta
            self.whatsapp_service.send_text_message(from_number, respuesta_texto)
            
            # Actualizar historial
            chat_history.append(HumanMessage(content=text))
            chat_history.append(AIMessage(content=respuesta_texto))
            
            logger.info("Mensaje de texto procesado correctamente")
            
        except Exception as e:
            logger.exception(f"Error procesando mensaje de texto: {e}")
            self.whatsapp_service.send_text_message(
                from_number,
                "Lo siento, ocurrió un error procesando tu mensaje. Por favor, intenta de nuevo."
            )
    
    def process_audio_message(
        self,
        from_number: str,
        media_id: str,
        mime_type: str,
        chat_history: list,
    ) -> None:
        """
        Procesa un mensaje de audio.
        
        Args:
            from_number: Número de teléfono del remitente
            media_id: ID del archivo de audio en WhatsApp
            mime_type: Tipo MIME del archivo
            chat_history: Historial de conversación
        """
        audio_path = None
        try:
            logger.info(f"Mensaje de audio recibido de {from_number}")
            
            # Descargar archivo de audio
            audio_path = self.media_service.download_media(media_id, mime_type)
            
            if not audio_path:
                self.whatsapp_service.send_text_message(
                    from_number,
                    "Lo siento, no pude descargar el archivo de audio. Por favor, intenta de nuevo."
                )
                return
            
            # Verificar que el archivo existe y no está vacío
            if not os.path.exists(audio_path) or os.path.getsize(audio_path) == 0:
                logger.error("El archivo de audio está vacío o no existe")
                self.whatsapp_service.send_text_message(
                    from_number,
                    "Lo siento, el archivo de audio está vacío. Por favor, intenta de nuevo."
                )
                return
            
            # Ejecutar el agente con el archivo de audio
            logger.info(f"Ejecutando agente con archivo de audio: {audio_path}")
            response = run_agent("", chat_history, audio_path)
            
            # Manejar respuesta estructurada o simple
            respuesta_texto = self._extract_response_text(response)
            extracto_estructurado = self._extract_structured_data(response)
            
            if extracto_estructurado:
                self._log_structured_extract(extracto_estructurado, response)
            
            # Enviar respuesta
            self.whatsapp_service.send_text_message(from_number, respuesta_texto)
            
            # Actualizar historial
            chat_history.append(HumanMessage(content=f"Archivo audio: {audio_path}"))
            chat_history.append(AIMessage(content=respuesta_texto))
            
            logger.info("Mensaje de audio procesado correctamente")
            
        except Exception as e:
            logger.exception(f"Error procesando mensaje de audio: {e}")
            self.whatsapp_service.send_text_message(
                from_number,
                "Lo siento, ocurrió un error procesando tu audio. Por favor, intenta de nuevo."
            )
        finally:
            # Limpiar archivo temporal
            if audio_path and os.path.exists(audio_path):
                try:
                    os.remove(audio_path)
                    logger.debug(f"Archivo temporal eliminado: {audio_path}")
                except Exception as e:
                    logger.warning(f"No se pudo eliminar archivo temporal: {e}")
    
    def process_image_message(
        self,
        from_number: str,
        media_id: str,
        mime_type: str,
        chat_history: list,
    ) -> None:
        """
        Procesa un mensaje de imagen.
        
        Args:
            from_number: Número de teléfono del remitente
            media_id: ID del archivo de imagen en WhatsApp
            mime_type: Tipo MIME del archivo
            chat_history: Historial de conversación
        """
        image_path = None
        try:
            logger.info(f"Mensaje de imagen recibido de {from_number}")
            
            # Descargar archivo de imagen
            image_path = self.media_service.download_media(media_id, mime_type)
            
            if not image_path:
                self.whatsapp_service.send_text_message(
                    from_number,
                    "Lo siento, no pude descargar la imagen. Por favor, intenta de nuevo."
                )
                return
            
            # Ejecutar el agente con la imagen
            logger.info(f"Ejecutando agente con imagen: {image_path}")
            response = run_agent("", chat_history, image_path)
            
            # Manejar respuesta estructurada o simple
            respuesta_texto = self._extract_response_text(response)
            extracto_estructurado = self._extract_structured_data(response)
            
            if extracto_estructurado:
                self._log_structured_extract(extracto_estructurado, response)
            
            # Enviar respuesta
            self.whatsapp_service.send_text_message(from_number, respuesta_texto)
            
            # Actualizar historial
            chat_history.append(HumanMessage(content=f"Archivo imagen: {image_path}"))
            chat_history.append(AIMessage(content=respuesta_texto))
            
            logger.info("Mensaje de imagen procesado correctamente")
            
        except Exception as e:
            logger.exception(f"Error procesando mensaje de imagen: {e}")
            self.whatsapp_service.send_text_message(
                from_number,
                "Lo siento, ocurrió un error procesando tu imagen. Por favor, intenta de nuevo."
            )
        finally:
            # Limpiar archivo temporal
            if image_path and os.path.exists(image_path):
                try:
                    os.remove(image_path)
                    logger.debug(f"Archivo temporal eliminado: {image_path}")
                except Exception as e:
                    logger.warning(f"No se pudo eliminar archivo temporal: {e}")
    
    @staticmethod
    def _extract_response_text(response: Any) -> str:
        """Extrae el texto de respuesta del agente."""
        if isinstance(response, dict):
            return response.get("respuesta", str(response))
        return str(response)
    
    @staticmethod
    def _extract_structured_data(response: Any) -> Optional[Dict[str, Any]]:
        """Extrae datos estructurados de la respuesta del agente."""
        if isinstance(response, dict):
            return response.get("extracto_estructurado")
        return None
    
    @staticmethod
    def _log_structured_extract(
        extracto: Dict[str, Any],
        response: Any,
    ) -> None:
        """Registra el extracto estructurado para integración con BD."""
        import json
        
        logger.info("=" * 70)
        logger.info("EXTRACTO ESTRUCTURADO - LISTO PARA INTEGRACIÓN CON BD")
        logger.info("=" * 70)
        logger.info(f"Acción: {extracto.get('accion')}")
        logger.info(f"Productos: {len(extracto.get('productos', []))}")
        logger.info(f"Intención: {extracto.get('intencion')}")
        
        if extracto.get('productos'):
            logger.info("Productos extraídos:")
            for idx, producto in enumerate(extracto.get('productos', []), 1):
                nombre = producto.get('nombre', 'N/A')
                cantidad = producto.get('cantidad', 'N/A')
                unidad = producto.get('unidad', 'unidad')
                logger.info(f"  {idx}. {nombre}: {cantidad} {unidad}")
        
        logger.info(f"JSON completo: {json.dumps(extracto, ensure_ascii=False, indent=2)}")
        
        if isinstance(response, dict) and response.get("resultado_procesado"):
            logger.info(f"Resultado procesado: {json.dumps(response.get('resultado_procesado'), ensure_ascii=False, indent=2)}")
        
        logger.info("Este JSON está listo para enviar a tu endpoint de BD")
        logger.info("=" * 70)

