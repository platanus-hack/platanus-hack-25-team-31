"""Configuración centralizada del bot."""

import os
from dataclasses import dataclass
from dotenv import load_dotenv
from pathlib import Path

# Cargar variables de entorno
load_dotenv()
load_dotenv(dotenv_path=Path(__file__).parent.parent.parent / ".env")


@dataclass
class WhatsAppConfig:
    """Configuración de WhatsApp Cloud API."""
    
    token: str
    phone_number_id: str
    verify_token: str
    api_version: str
    
    @property
    def api_url(self) -> str:
        """URL base de la API de WhatsApp."""
        return f"https://graph.facebook.com/{self.api_version}/{self.phone_number_id}/messages"
    
    @classmethod
    def from_env(cls) -> "WhatsAppConfig":
        """Crea configuración desde variables de entorno."""
        token = os.getenv("WHATSAPP_TOKEN")
        phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
        verify_token = os.getenv("WHATSAPP_VERIFY_TOKEN", "mi_token_secreto")
        api_version = os.getenv("WHATSAPP_API_VERSION", "v22.0")
        
        if not token or not phone_number_id:
            raise ValueError(
                "WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID deben estar configurados en .env"
            )
        
        return cls(
            token=token,
            phone_number_id=phone_number_id,
            verify_token=verify_token,
            api_version=api_version,
        )


@dataclass
class OpenAIConfig:
    """Configuración de OpenAI."""
    
    api_key: str
    model: str = "gpt-4o-mini"
    temperature: float = 0.0
    
    @classmethod
    def from_env(cls) -> "OpenAIConfig":
        """Crea configuración desde variables de entorno."""
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY debe estar configurado en .env")
        
        return cls(
            api_key=api_key,
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            temperature=float(os.getenv("OPENAI_TEMPERATURE", "0.0")),
        )


@dataclass
class ServerConfig:
    """Configuración del servidor Flask."""
    
    host: str = "0.0.0.0"
    port: int = 5001
    debug: bool = False
    
    @classmethod
    def from_env(cls) -> "ServerConfig":
        """Crea configuración desde variables de entorno."""
        # Railway usa la variable PORT por defecto
        port = int(os.getenv("PORT", os.getenv("FLASK_PORT", "5001")))
        
        return cls(
            host=os.getenv("FLASK_HOST", "0.0.0.0"),
            port=port,
            debug=os.getenv("FLASK_DEBUG", "False").lower() == "true",
        )


@dataclass
class Settings:
    """Configuración global de la aplicación."""
    
    whatsapp: WhatsAppConfig
    openai: OpenAIConfig
    server: ServerConfig
    
    @classmethod
    def load(cls) -> "Settings":
        """Carga toda la configuración desde variables de entorno."""
        return cls(
            whatsapp=WhatsAppConfig.from_env(),
            openai=OpenAIConfig.from_env(),
            server=ServerConfig.from_env(),
        )

