#!/bin/sh
# Applique les migrations (idempotent) puis démarre le site.
set -e
echo "[entrypoint] Migrations de la base de données…"
(cd /migrate && node migrate.mjs)
echo "[entrypoint] Démarrage du site."
exec "$@"
