# syntax=docker/dockerfile:1

# --- 1. Dépendances complètes (compilation) ---
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
# --legacy-peer-deps nécessaire pour le conflit de pairs better-auth / vite
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 5 && npm config set fetch-retry-mintimeout 20000 \
    && npm ci --legacy-peer-deps

# --- 2. Compilation Next.js ---
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_DEMO_MODE=false
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE
ENV NEXT_TELEMETRY_DISABLED=1
# Valeur factice requise par Next.js au build sans ouvrir de connexion
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build

RUN npm run build

# --- 3. Migrations Drizzle : exécuté une fois au déploiement ---
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

# --- 4. Application (Serveur Next.js Standalone) ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3600
ENV HOSTNAME=0.0.0.0
ENV PRIVATE_STORAGE_PATH=/data/storage

RUN mkdir -p /data/storage && chown -R node:node /data

COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3600

CMD ["node", "server.js"]
