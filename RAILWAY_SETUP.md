# 🚀 Guía de Despliegue en Railway

Este proyecto está configurado como un monorepo Nx y utiliza Docker para el despliegue en Railway. A continuación se detallan los pasos para desplegar tanto el Backend como el Frontend.

## Prerrequisitos

1. Tener una cuenta en [Railway](https://railway.app/).
2. Tener este repositorio conectado a tu cuenta de GitHub.
3. Tener el CLI de Railway instalado (opcional, pero recomendado).

## Paso 1: Crear un Nuevo Proyecto

1. En el dashboard de Railway, haz clic en **"New Project"**.
2. Selecciona **"Deploy from GitHub repo"**.
3. Elige el repositorio de `platanus-hack-25-team-31`.

## Paso 2: Configurar la Base de Datos

1. En la vista del proyecto (Canvas), haz clic derecho o en "New" y selecciona **Database** -> **PostgreSQL**.
2. Espera a que se cree el servicio de base de datos.
3. Haz clic en la tarjeta de PostgreSQL y ve a la pestaña **Variables**. Aquí encontrarás `DATABASE_URL` y otras credenciales.

## Paso 3: Configurar el Backend

1. Railway creará automáticamente un servicio al conectar el repo. Vamos a configurarlo como el **Backend**.
2. Haz clic en la tarjeta del servicio del repositorio.
3. Ve a **Settings** -> **Build**.
    - **Builder**: Select `Dockerfile`.
    - **Dockerfile Path**: Ingresa `apps/backend/Dockerfile`.
    - **Watch Paths** (Opcional): `apps/backend/**`, `libs/**`.
4. Ve a la pestaña **Variables**.
    - Agrega las variables necesarias para conectar a la base de datos. Railway expone las variables de otros servicios si los "linkeas", o puedes copiarlas manualmente.
    - Usando "Reference Variable" de Railway (Recomendado):
        - `DB_HOST`: `${Postgres.PGHOST}`
        - `DB_PORT`: `${Postgres.PGPORT}`
        - `DB_USER`: `${Postgres.PGUSER}`
        - `DB_PASSWORD`: `${Postgres.PGPASSWORD}`
        - `DB_NAME`: `${Postgres.PGDATABASE}`
    - Railway asigna automáticamente la variable `PORT`, nuestro código ya está preparado para leerla.
5. **Deploy**: Railway debería redeployar automáticamente al guardar los cambios. Si no, fuerza un redeploy.

## Paso 4: Configurar el Frontend

1. En el Canvas, haz clic en **"New"** -> **"GitHub Repo"**.
2. Selecciona **el mismo repositorio** nuevamente. Esto creará un segundo servicio.
3. Haz clic en el nuevo servicio (puedes renombrarlo a "Frontend" en Settings).
4. Ve a **Settings** -> **Build**.
    - **Builder**: Select `Dockerfile`.
    - **Dockerfile Path**: Ingresa `apps/frontend/Dockerfile`.
    - **Watch Paths** (Opcional): `apps/frontend/**`, `libs/**`.
5. Ve a la pestaña **Networking**.
    - Haz clic en **"Generate Domain"** para obtener una URL pública (ej. `frontend-production.up.railway.app`).
6. Ve a la pestaña **Variables**.
    - Si tu frontend necesita comunicarse con el backend, agrega la URL del backend:
        - `NEXT_PUBLIC_API_URL`: `https://<url-de-tu-backend>.up.railway.app` (Obtén esta URL del servicio de Backend en Networking).

## Paso 5: Configurar el Agente de Despensa (Flask)

1. En el Canvas, haz clic en **"New"** -> **"GitHub Repo"**.
2. Selecciona **el mismo repositorio** nuevamente. Esto creará un tercer servicio.
3. Haz clic en el nuevo servicio (puedes renombrarlo a "Despense Agent" en Settings).
4. Ve a **Settings** -> **Build**.
    - **Builder**: Select `Dockerfile`.
    - **Dockerfile Path**: Ingresa `apps/despense-agent/Dockerfile`.
    - **Watch Paths** (Opcional): `apps/despense-agent/**`.
    - **Root Directory**: `/apps/despense-agent` (Importante: establece el contexto en el subdirectorio de la app).
5. Ve a la pestaña **Variables**.
    - Agrega las variables de entorno necesarias para el agente:
        - `OPENAI_API_KEY`: Tu API key de OpenAI.
        - `WHATSAPP_TOKEN`: Token de acceso de Meta WhatsApp Cloud API.
        - `WHATSAPP_PHONE_NUMBER_ID`: ID del número de teléfono de WhatsApp.
        - `WHATSAPP_VERIFY_TOKEN`: Token de verificación para el webhook (definido por ti).
    - Opcionales:
        - `FLASK_DEBUG`: `false` (recomendado para producción).
        - `OPENAI_MODEL`: Modelo a usar (ej: `gpt-4o-mini`).
6. Ve a la pestaña **Networking**.
    - Haz clic en **"Generate Domain"** para obtener una URL pública (ej. `despense-agent-production.up.railway.app`).
    - Esta URL pública debe configurarse en el **App Dashboard de Meta** como la URL del Webhook (agregando `/webhook` al final).

## Notas Importantes

- **Migraciones**: El Dockerfile del backend está configurado para ejecutar `pnpm db:migrate` automáticamente al iniciar el contenedor. Esto asegura que la base de datos esté siempre actualizada.
- **Puertos**:
    - Backend escucha en el puerto que Railway le asigne (variable `PORT`).
    - Frontend escucha en el puerto 3000 internamente, pero Railway mapea el tráfico HTTP automáticamente.
    - Despense Agent escucha en el puerto que Railway le asigne (variable `PORT`), internamente mapeado en el código.
