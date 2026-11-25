#!/usr/bin/env bash
# Compile l'application Mentora (racine du dépôt) dans une COPIE temporaire pour les tests de bout en bout de `site/`,
# sans toucher au `.next` de développement. Affiche le dossier du serveur autonome :
#   export MENTORA_STANDALONE_DIR=$(site/scripts/build-mentora-for-e2e.sh)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="${E2E_BUILD_DIR:-$(mktemp -d)}"
mkdir -p "$TMP"
rsync -a --delete --exclude node_modules --exclude .next --exclude site --exclude .git --exclude .superpowers --exclude storage "$ROOT/" "$TMP/" >&2
ln -sfn "$ROOT/node_modules" "$TMP/node_modules"
(cd "$TMP" && DATABASE_URL=postgresql://build:build@localhost:5432/build NEXT_TELEMETRY_DISABLED=1 npx next build >&2)
mkdir -p "$TMP/.next/standalone/.next"
cp -R "$TMP/.next/static" "$TMP/.next/standalone/.next/"
[ -d "$TMP/public" ] && cp -R "$TMP/public" "$TMP/.next/standalone/public"
echo "$TMP/.next/standalone"
