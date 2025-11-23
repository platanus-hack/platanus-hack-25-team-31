# Usar una imagen base de Python oficial y ligera
FROM python:3.12-slim

# Establecer variables de entorno para evitar buffering y archivos .pyc
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Instalar dependencias del sistema
# ffmpeg es necesario para pydub (procesamiento de audio)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Establecer el directorio de trabajo
WORKDIR /app

# Copiar requirements e instalar dependencias
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código de la aplicación
COPY . .

# Exponer el puerto que usará la aplicación (Railway asigna uno dinámicamente, pero 5001 es nuestro default)
EXPOSE 5001

# Comando para ejecutar la aplicación usando Gunicorn
# Gunicorn es un servidor WSGI de producción, más robusto que el servidor de desarrollo de Flask
CMD ["gunicorn", "--bind", "0.0.0.0:5001", "whatsapp_server:app"]

