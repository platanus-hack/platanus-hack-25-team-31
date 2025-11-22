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

