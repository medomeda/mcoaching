# Déploiement sur Coolify (auto-hébergé)

Pile déployée par `docker-compose.yml` : **db** (PostgreSQL 16), **app** (Next.js, port 3600) et **backup** (sauvegardes `pg_dump` quotidiennes). Les migrations de la base s'appliquent toutes seules au démarrage de `app`.

## 1. Prérequis

- Coolify installé sur votre VPS, avec son serveur « localhost » validé.
- Un nom de domaine (ex. `coaching.mondomaine.com`) dont l'enregistrement **A** pointe vers l'IP du VPS (ports 80 et 443 ouverts).
- Le dépôt Git du projet accessible par Coolify (GitHub/GitLab/Gitea, clé de déploiement ou dépôt public). Fichiers à avoir committés : `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`, `scripts/migrate.mjs`, `drizzle/`, `public/.gitkeep`.

## 2. Créer la ressource

1. **Projet → Environment → + New → Public/Private Repository** (selon votre dépôt), choisir la branche.
2. **Build Pack : Docker Compose**.
3. **Base Directory** : `/` — **Docker Compose Location** : `/docker-compose.yml`.
4. Enregistrer : Coolify lit le fichier et crée les variables (section suivante).

## 3. Domaine

Onglet **General → Domains**, ligne du service **app** :

```
https://coaching.mondomaine.com:3600
```

Le `:3600` indique au proxy le port interne ; le public utilise bien le 443. Coolify obtient le certificat Let's Encrypt tout seul.
Ne renseignez **pas** de domaine pour `db` et `backup`.

## 4. Variables d'environnement

Onglet **Environment Variables**.

**Générées par Coolify, à ne pas toucher** : `SERVICE_USER_POSTGRES`, `SERVICE_PASSWORD_POSTGRES` (identifiants de la base), `SERVICE_HEX_64_AUTHSECRET` (secret de session). Elles sont conservées d'un déploiement à l'autre. Ne changez jamais le secret après la mise en service : toutes les sessions seraient fermées.

**À renseigner :**

| Variable | Valeur | Rôle |
|---|---|---|
| `APP_URL` | `https://coaching.mondomaine.com` | Adresse publique **exacte**, sans `/` final. Utilisée pour les liens des e-mails, les cookies et le contrôle d'origine. Un domaine différent de celui de l'interface provoque des erreurs « Origine non autorisée ». |
| `TRUSTED_ORIGINS` | (vide) ou `https://www.mondomaine.com` | Autres adresses autorisées à se connecter, séparées par des virgules. |
| `ACTIVATION_BY_EMAIL` | `false` (tant que le SMTP ne livre pas) puis `true` | `false` : compte actif d'emblée + mot de passe provisoire donné à l'administrateur. |
| `EMAIL_PROVIDER` | `smtp` (ou vide) | Vide = e-mails écrits dans les journaux seulement. |
| `EMAIL_FROM` | `Coaching BRVM <no-reply@mondomaine.com>` | Doit appartenir à un domaine **vérifié** chez le fournisseur SMTP. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | ex. `smtp.resend.com` / `465` / `resend` / clé API | Cochez **« Is Secret »** sur le mot de passe. |

**Optionnelles** (valeurs par défaut dans le fichier) : `APP_TIMEZONE` (`Africa/Abidjan`), `DISABLE_SCHEDULER` (`false`), `POSTGRES_DB` (`mcoaching`), `BACKUP_SCHEDULE` (`@daily`), `BACKUP_KEEP_DAYS` (7), `BACKUP_KEEP_WEEKS` (4), `BACKUP_KEEP_MONTHS` (3).

Aucune variable `NEXT_PUBLIC_*` à saisir : le mode serveur est figé dans l'image.

## 5. Premier déploiement

1. **Deploy**, puis suivre **Deployment Logs** (la compilation prend quelques minutes).
2. Dans les journaux de `app`, vous devez lire : `Migrations appliquées.` puis `Démarrage de l'application.`.
3. Ouvrir `https://coaching.mondomaine.com` : sur une base vide, la page **/setup** crée le premier administrateur. Créez-le immédiatement (tant qu'aucun administrateur n'existe, n'importe qui peut accéder à cette page).
4. Vérifier : connexion, création d'un coach (mot de passe provisoire affiché une fois), liste mise à jour sans rafraîchir.

## 6. Mises à jour

- Activer le **webhook** (onglet Webhooks du dépôt) ou cliquer **Deploy** après chaque `git push`.
- Les migrations sont rejouées automatiquement ; un échec arrête le conteneur `app` (le déploiement est marqué en erreur et l'ancienne version reste servie).
- Gardez **une seule instance** de `app` (le planificateur intégré tourne dans le processus). Pour en lancer plusieurs, mettez `DISABLE_SCHEDULER=true` et programmez `npm run jobs` par cron.

## 7. Sauvegardes (à prendre au sérieux)

- Le service `backup` écrit un dump compressé de la base chaque jour dans le volume `backup-data` (conservation 7 jours / 4 semaines / 3 mois). **Ce volume est sur le même VPS** : en cas de perte du serveur, il disparaît avec lui.
- Les **pièces jointes** sont dans le volume `storage-data` (non couvert par `backup`).
- À mettre en place : une copie régulière hors du VPS des volumes `backup-data` et `storage-data` (Coolify : **Scheduled Tasks** + `rclone`/`rsync` vers un stockage S3 ou un autre serveur, ou snapshot du VPS chez l'hébergeur).
- Restauration d'un dump (depuis le terminal du VPS) :
  ```bash
  docker exec -i <conteneur-db> sh -c 'gunzip -c | psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < dump.sql.gz
  ```
  Les dumps se trouvent dans `/backups/daily/` du conteneur `backup`.

## 8. Dépannage

| Symptôme | Cause probable |
|---|---|
| « No Available Server » | Le domaine n'a pas le suffixe `:3600`, ou `app` n'est pas encore « healthy » (voir Runtime Logs). |
| « Invalid origin » à la connexion, ou « Origine non autorisée » | `APP_URL` différent du domaine réellement utilisé (http/https, `www`, barre finale). |
| `app` redémarre en boucle, journal « Migration… erreur » | Base inaccessible ou migration en échec : lire le message dans les journaux. |
| `SMTP_550` dans les envois | Domaine d'expédition non vérifié chez le fournisseur : corriger `EMAIL_FROM`. |
| Connexion refusée après redéploiement | `SERVICE_HEX_64_AUTHSECRET` modifié (sessions invalidées, reconnexion simple) ou mot de passe oublié. |
| Pièces jointes perdues | Volume `storage-data` supprimé : ne jamais cocher la suppression des volumes en supprimant la ressource. |

## 9. Test local de la même pile

```bash
cp .env.docker.example .env.docker      # renseigner les 2 secrets (openssl rand -hex …)
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.docker up -d --build
```
