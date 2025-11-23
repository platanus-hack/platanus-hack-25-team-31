FROM node:20-alpine AS base

# Instalar pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Setup de entorno
WORKDIR /app

# Copiar archivos de dependencias
COPY package.json pnpm-lock.yaml ./

# Instalar dependencias
RUN pnpm install --frozen-lockfile

# Copiar el código fuente
COPY . .

# Construir el backend
RUN pnpm nx build backend --configuration=production

# Etapa de producción
FROM node:20-alpine AS runner
WORKDIR /app

# Instalar pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copiar archivos necesarios desde el builder
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/dist/apps/backend ./dist/apps/backend
COPY --from=base /app/apps/backend/env.example ./apps/backend/env.example

# Copiar archivos de configuración de Nx necesarios para ejecutar comandos
COPY --from=base /app/nx.json ./nx.json
COPY --from=base /app/tsconfig.base.json ./tsconfig.base.json

# Copiar código fuente del backend necesario para migraciones (TypeORM usa ts-node)
COPY --from=base /app/apps/backend/src ./apps/backend/src
COPY --from=base /app/apps/backend/project.json ./apps/backend/project.json
COPY --from=base /app/apps/backend/tsconfig.app.json ./apps/backend/tsconfig.app.json
COPY --from=base /app/apps/backend/tsconfig.json ./apps/backend/tsconfig.json
COPY --from=base /app/apps/backend/webpack.config.js ./apps/backend/webpack.config.js

# Exponer puerto
EXPOSE 3000

# Variables de entorno por defecto
ENV PORT=3000
ENV NODE_ENV=production

# Comando de inicio: Ejecutar migraciones y luego iniciar la app
# Si es staging, también ejecutar seeds para reemplazar toda la información
CMD ["sh", "-c", "pnpm db:migrate && ([ \"$RAILWAY_ENVIRONMENT\" = \"staging\" ] && pnpm db:seed || true) && node dist/apps/backend/main.js"]

