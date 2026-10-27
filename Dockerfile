# syntax=docker/dockerfile:1

# --- Dépendances complètes (compilation) ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --legacy-peer-deps : conflit de pairs connu (better-auth / vite)
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 5 && npm config set fetch-retry-mintimeout 20000 \
    && npm ci --legacy-peer-deps

# --- Compilation ---
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Ces variables sont figées dans le code client : à fournir à la compilation.
ARG NEXT_PUBLIC_DEMO_MODE=false
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE
ENV NEXT_TELEMETRY_DISABLED=1
# Valeur factice : la compilation n'ouvre aucune connexion, mais le module la vérifie.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run build

# --- Migrations : dépendances de production + script, exécuté une fois avant le démarrage ---
FROM node:22-alpine AS migrator
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 5 && npm config set fetch-retry-mintimeout 20000 \
    && npm ci --omit=dev --legacy-peer-deps
COPY drizzle ./drizzle
COPY scripts/migrate.mjs ./scripts/migrate.mjs
USER node
CMD ["node", "scripts/migrate.mjs"]

# --- Application (serveur autonome Next.js) ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3600 HOSTNAME=0.0.0.0
ENV PRIVATE_STORAGE_PATH=/data/storage
RUN mkdir -p /data/storage && chown -R node:node /data
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3600
CMD ["node", "server.js"]
