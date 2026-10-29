# syntax=docker/dockerfile:1

# --- 1. Dépendances complètes (compilation) ---
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
# --legacy-peer-deps : conflit de pairs connu (better-auth / vite)
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 5 && npm config set fetch-retry-mintimeout 20000 \
    && npm ci --legacy-peer-deps

# --- 2. Compilation Next.js ---
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Figé dans le code client à la compilation : l'image de production est toujours en mode serveur.
ARG NEXT_PUBLIC_DEMO_MODE=false
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE
ENV NEXT_TELEMETRY_DISABLED=1
# Valeur factice : la compilation n'ouvre aucune connexion, mais le module vérifie sa présence.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run build

# --- 3. Dépendances de production (script de migration embarqué dans l'image finale) ---
FROM node:22-alpine AS prod-deps
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 5 && npm config set fetch-retry-mintimeout 20000 \
    && npm ci --omit=dev --legacy-peer-deps

# --- 4. Application (serveur autonome Next.js) ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3600 HOSTNAME=0.0.0.0
ENV PRIVATE_STORAGE_PATH=/data/storage
RUN mkdir -p /data/storage && chown -R node:node /data
COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# Migrations : appliquées au démarrage du conteneur, avant le serveur (voir docker-entrypoint.sh).
COPY --from=prod-deps --chown=node:node /app/node_modules /migrate/node_modules
COPY --chown=node:node drizzle /migrate/drizzle
COPY --chown=node:node scripts/migrate.mjs /migrate/migrate.mjs
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
USER node
EXPOSE 3600
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
