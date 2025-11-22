# despens.ai

**Current project logo:** project-logo.png

<img src="./project-logo.png" alt="Project Logo" width="200" />

## Descripción del Proyecto

despens.ai es un bot de WhatsApp inteligente que ayuda a las personas a mantener un control completo del inventario de sus despensas domésticas. Utilizando modelos de lenguaje (LLMs), inteligencia artificial y técnicas de predicción, el sistema genera estimaciones precisas del stock de cada producto. Los usuarios interactúan con Despensin, un gestor de despensas amigable y motivado cuyo propósito principal es conocer el estado de cada producto y asegurarse de que nunca más se olvide comprar algo en el supermercado

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
