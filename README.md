# despens.ai

**Current project logo:** project-logo.png

<img src="./project-logo.png" alt="Project Logo" width="200" />

## Descripción del Proyecto

despens.ai es un bot de WhatsApp inteligente que ayuda a las personas a mantener un control completo del inventario de sus despensas domésticas. Utilizando modelos de lenguaje (LLMs), inteligencia artificial y técnicas de predicción, el sistema genera estimaciones precisas del stock de cada producto. Los usuarios interactúan con Despensin, un gestor de despensas amigable y motivado cuyo propósito principal es conocer el estado de cada producto y asegurarse de que nunca más se olvide comprar algo en el supermercado

## 🚀 Configuración Inicial

### Requisitos Previos

- **Node.js** (versión 18 o superior)
- **pnpm** (versión 9.14.2 o superior)
- **PostgreSQL** (versión 12 o superior)

### Pasos de Instalación

1. **Clonar el repositorio**
   ```bash
   git clone <url-del-repositorio>
   cd platanus-hack-25-team-31
   ```

2. **Instalar dependencias**
   ```bash
   pnpm install
   ```

3. **Configurar la base de datos**
   
   Asegúrate de tener PostgreSQL corriendo en tu máquina local. Luego:
   
   ```bash
   # Crear la base de datos
   createdb despens
   ```

4. **Configurar variables de entorno**
   
   Copia el archivo de ejemplo y configura las variables según tu entorno:
   
   ```bash
   cp apps/backend/env.example apps/backend/.env
   ```
   
   Edita `apps/backend/.env` con tus credenciales de PostgreSQL:
   ```
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=tu_contraseña
   DB_NAME=despens
   ```

5. **Ejecutar migraciones de base de datos**
   ```bash
   pnpm db:migrate
   ```

6. **Poblar la base de datos con datos de ejemplo (opcional)**
   ```bash
   pnpm db:seed
   ```

7. **Iniciar la aplicación**
   
   Para ejecutar tanto el backend como el frontend simultáneamente:
   ```bash
   pnpm start
   ```
   
   O ejecutar cada servicio por separado:
   ```bash
   # Terminal 1: Backend (puerto 3000)
   pnpm start:backend
   
   # Terminal 2: Frontend (puerto 4200)
   pnpm start:frontend
   ```

### Comandos Útiles

- `pnpm build` - Compilar todos los proyectos
- `pnpm lint` - Ejecutar linter en todos los proyectos
- `pnpm db:reset` - Resetear la base de datos (elimina esquema y ejecuta migraciones)
- `pnpm db:migrate` - Ejecutar migraciones pendientes
- `pnpm db:seed` - Poblar la base de datos con datos de ejemplo

### URLs de Desarrollo

- **Backend API**: http://localhost:3000
- **Frontend Dashboard**: El puerto se mostrará en la consola al iniciar (típicamente http://localhost:4200)

## Arquitectura del Sistema

El proyecto está compuesto por tres componentes principales:

### 🚀 Backend NestJS (Gestor de Información)

- **Tecnología**: NestJS con TypeORM
- **Base de Datos**: PostgreSQL
- **Funcionalidad**:
  - Gestor centralizado de información del sistema
  - Ejecución de modelos predictivos para estimar el stock de productos
  - API REST para comunicación entre componentes

### 📊 Dashboard Next.js (Visualización)

- **Tecnología**: Next.js
- **Funcionalidad**:
  - Interfaz web para visualizar información detallada de la despensa del usuario
  - Visualización de productos, stock estimado y predicciones
  - Dashboard interactivo con métricas y estadísticas

### 🤖 Backend Flask (LLM de Interacción)

- **Tecnología**: Flask
- **Funcionalidad**:
  - Ejecución del modelo de lenguaje (LLM) para interacción con el usuario
  - Procesamiento de mensajes de WhatsApp
  - Gestión de conversaciones con Despensin

## Equipo

**team-31**

- Nicolás Hörmann ([@NicoPuc](https://github.com/NicoPuc))
- Agustín Gallardo ([@agustin-gallardo](https://github.com/agustin-gallardo))
- Raimundo Mena ([@rmena1](https://github.com/rmena1))
- Gonzalo Perez ([@gonzaloperezreich](https://github.com/gonzaloperezreich))

## Información del Hackathon

**Track**: ✨ consumer AI

**Submission Deadline**: 23rd Nov, 9:00 AM, Chile time.

Have fun! 🚀
