FROM node:18-alpine AS base

# 1. Declaras los ARG que Railway va a inyectar en build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_OPTIMAL_STOCK_DAYS
ARG NEXT_PUBLIC_WARNING_STOCK_THRESHOLD
ARG NEXT_PUBLIC_CRITICAL_STOCK_THRESHOLD
ARG NEXT_PUBLIC_TOKEN_DURATION_MS

# 2. Los expones como ENV para que `pnpm nx build` los vea como process.env
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_OPTIMAL_STOCK_DAYS=$NEXT_PUBLIC_OPTIMAL_STOCK_DAYS
ENV NEXT_PUBLIC_WARNING_STOCK_THRESHOLD=$NEXT_PUBLIC_WARNING_STOCK_THRESHOLD
ENV NEXT_PUBLIC_CRITICAL_STOCK_THRESHOLD=$NEXT_PUBLIC_CRITICAL_STOCK_THRESHOLD
ENV NEXT_PUBLIC_TOKEN_DURATION_MS=$NEXT_PUBLIC_TOKEN_DURATION_MS

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

# Construir el frontend
RUN pnpm nx build frontend --configuration=production

# Etapa de producción
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Crear usuario non-root para seguridad
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copiar archivos necesarios para standalone
# La salida standalone de Nx/Next.js incluye node_modules mínimos necesarios
COPY --from=base /app/dist/apps/frontend/public ./public
COPY --from=base --chown=nextjs:nodejs /app/dist/apps/frontend/.next/standalone ./
COPY --from=base --chown=nextjs:nodejs /app/dist/apps/frontend/.next/static ./dist/apps/frontend/.next/static

# Cambiar al usuario non-root
USER nextjs

# Exponer puerto
EXPOSE 3000

# Comando de inicio
# Nota: En modo standalone con Nx, la estructura de carpetas se mantiene
CMD ["node", "apps/frontend/server.js"]

