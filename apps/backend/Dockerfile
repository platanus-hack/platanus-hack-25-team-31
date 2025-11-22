FROM node:18-alpine AS base

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
FROM node:18-alpine AS runner
WORKDIR /app

# Instalar pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copiar archivos necesarios desde el builder
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/dist/apps/backend ./dist/apps/backend
COPY --from=base /app/apps/backend/env.example ./apps/backend/env.example

# Exponer puerto
EXPOSE 3000

# Variables de entorno por defecto
ENV PORT=3000
ENV NODE_ENV=production

# Comando de inicio: Ejecutar migraciones y luego iniciar la app
CMD ["sh", "-c", "pnpm db:migrate && node dist/apps/backend/main.js"]

