#!/bin/sh
# Applique les migrations (idempotent) puis démarre l'application.
# Un échec de migration arrête le conteneur : le déploiement est signalé en erreur au lieu de tourner sur un schéma incomplet.
set -e
echo "[entrypoint] Migrations de la base de données…"
(cd /migrate && node migrate.mjs)
echo "[entrypoint] Démarrage de l'application."
exec "$@"
