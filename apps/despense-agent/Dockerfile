# Usar una imagen base de Python oficial y ligera
FROM python:3.12-slim

# Establecer variables de entorno para evitar buffering y archivos .pyc
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Instalar dependencias del sistema
# ffmpeg es necesario para pydub
# git y otros tools pueden ser necesarios
RUN apt-get update && apt-get install -y \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

# Establecer el directorio de trabajo
WORKDIR /app

# Copiar requirements e instalar dependencias
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Instalar Playwright y sus dependencias (Chromium)
RUN playwright install --with-deps chromium

# Copiar el código de la aplicación
COPY . .

# Exponer el puerto
EXPOSE 5001

# Comando para ejecutar la aplicación
CMD ["gunicorn", "--bind", "0.0.0.0:5001", "whatsapp_server:app", "--timeout", "300"]
