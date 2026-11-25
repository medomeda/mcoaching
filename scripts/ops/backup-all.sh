#!/usr/bin/env bash
# Sauvegarde de TOUTES les bases du PostgreSQL partagé (clients + mentora_site) dans un dossier daté.
#   scripts/ops/backup-all.sh <URL_ADMIN_POSTGRES> <dossier_de_sortie>
# Exemple : scripts/ops/backup-all.sh "postgresql://admin:mdp@127.0.0.1:5432/postgres" /var/backups/mentora
# Nécessite psql et pg_dump (ou lancez-le dans un conteneur postgres). Sort en erreur si UNE base échoue.
# Rappel : la clé MASTER_KEY de `site/` et les pièces jointes (volume `storage-data` de chaque instance) se sauvegardent à part.
set -uo pipefail

if [ $# -ne 2 ]; then
  echo "usage: $0 <URL_ADMIN_POSTGRES> <dossier>" >&2
  exit 2
fi
URL=$1
OUT="$2/$(date +%Y-%m-%d_%H%M%S)"
mkdir -p "$OUT"

# Même serveur, une connexion par base : on remplace seulement le nom de la base dans l'URL.
with_db() { printf '%s' "$URL" | sed -E "s#/[^/?]*(\\?.*)?\$#/$1\\1#"; }

DBS=$(psql "$URL" -At -c "select datname from pg_database where not datistemplate and datname <> 'postgres' order by 1") || { echo "Connexion impossible." >&2; exit 1; }
[ -n "$DBS" ] || { echo "Aucune base à sauvegarder." >&2; exit 1; }

status=0
for db in $DBS; do
  if pg_dump "$(with_db "$db")" --no-owner | gzip > "$OUT/$db.sql.gz" && [ "${PIPESTATUS[0]}" -eq 0 ] && gzip -t "$OUT/$db.sql.gz"; then
    echo "OK    $db ($(du -h "$OUT/$db.sql.gz" | cut -f1))"
  else
    echo "ECHEC $db" >&2
    rm -f "$OUT/$db.sql.gz"
    status=1
  fi
done
echo "Dossier : $OUT"
exit $status
