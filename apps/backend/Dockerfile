FROM node:18-slim

# Setup de entorno
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copiar archivos de dependencias
COPY package.json pnpm-lock.yaml ./

# Instalar dependencias
RUN pnpm install --frozen-lockfile

# Copiar el código fuente
COPY . .

# Construir el backend
RUN pnpm nx build backend --configuration=production

# Etapa de producción
FROM node:18-slim AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copiar archivos necesarios desde el builder
COPY --from=0 /app/node_modules ./node_modules
COPY --from=0 /app/package.json ./package.json
COPY --from=0 /app/dist/apps/backend ./dist/apps/backend
COPY --from=0 /app/apps/backend/env.example ./apps/backend/env.example
COPY --from=0 /app/nx.json ./nx.json
COPY --from=0 /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=0 /app/apps/backend/src ./apps/backend/src
COPY --from=0 /app/apps/backend/project.json ./apps/backend/project.json
COPY --from=0 /app/apps/backend/tsconfig.app.json ./apps/backend/tsconfig.app.json
COPY --from=0 /app/apps/backend/tsconfig.json ./apps/backend/tsconfig.json
COPY --from=0 /app/apps/backend/webpack.config.js ./apps/backend/webpack.config.js

# Exponer puerto
EXPOSE 3000

# Variables de entorno por defecto
ENV PORT=3000
ENV NODE_ENV=production

# Comando de inicio
CMD ["sh", "-c", "pnpm db:migrate && ([ \"$RAILWAY_ENVIRONMENT\" = \"staging\" ] && pnpm db:seed || true) && node dist/apps/backend/main.js"]
