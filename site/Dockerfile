# syntax=docker/dockerfile:1
# Contexte de compilation : le dossier site/ (docker build -f site/Dockerfile site)

FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 5 && npm config set fetch-retry-mintimeout 20000 \
    && npm ci --legacy-peer-deps

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Aucune base n'est ouverte à la compilation (pages statiques sans données).
RUN npm run build
# Commande de création du compte opérateur (sans tsx dans l'image finale) : empaquetée, les dépendances viennent de /migrate/node_modules.
RUN npx esbuild scripts/create-admin.ts --bundle --platform=node --format=esm --packages=external --outfile=/app/create-admin.mjs

FROM node:22-alpine AS prod-deps
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 5 && npm config set fetch-retry-mintimeout 20000 \
    && npm ci --omit=dev --legacy-peer-deps

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3601 HOSTNAME=0.0.0.0
COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=prod-deps --chown=node:node /app/node_modules /migrate/node_modules
COPY --chown=node:node drizzle /migrate/drizzle
COPY --chown=node:node scripts/migrate.mjs /migrate/migrate.mjs
COPY --from=builder --chown=node:node /app/create-admin.mjs /migrate/create-admin.mjs
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
USER node
EXPOSE 3601
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
