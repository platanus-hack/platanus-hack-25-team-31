FROM node:18-slim

# Install Python and pip
RUN apt-get update && apt-get install -y python3 python3-pip && \
    ln -s /usr/bin/python3 /usr/bin/python && \
    rm -rf /var/lib/apt/lists/*

# Install Playwright dependencies
# We need to install playwright globally or in the project, and its browsers
# Installing system deps for playwright is heavy. 
# Using a playwright-ready base image or installing deps is better.
# Since we use 'exec' to call python script which uses playwright, the environment needs it.

# Switch to a heavier base image that supports playwright or install deps
# Using microsoft/playwright:v1.40.0-focal if possible, but we need Node 18.
# Let's stick to node:18 and install python + playwright deps.
# Actually, installing playwright browsers requires npx playwright install-deps

RUN pip3 install playwright
RUN npx playwright install-deps
RUN python3 -m playwright install chromium

# Standard Node setup
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Build backend
RUN pnpm nx build backend --configuration=production

# Runner stage
FROM node:18-slim AS runner
WORKDIR /app

# Install Python in runner too
RUN apt-get update && apt-get install -y python3 python3-pip && \
    ln -s /usr/bin/python3 /usr/bin/python && \
    rm -rf /var/lib/apt/lists/*

# Install Playwright in runner
RUN pip3 install playwright
RUN npx playwright install-deps
RUN python3 -m playwright install chromium

RUN corepack enable && corepack prepare pnpm@latest --activate

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

# Copy the python script and data
COPY --from=0 /app/apps/despense-agent ./apps/despense-agent

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["sh", "-c", "pnpm db:migrate && ([ \"$RAILWAY_ENVIRONMENT\" = \"staging\" ] && pnpm db:seed || true) && node dist/apps/backend/main.js"]
