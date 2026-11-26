# Déploiement sur Coolify (auto-hébergé)

Deux façons de déployer, avec le même code :

| | **A. Base indépendante** (recommandé) | **B. Tout-en-un** |
|---|---|---|
| Fichier compose | `docker-compose.yml` | `docker-compose.with-db.yml` |
| Contenu | `app` seule | `db` + `app` (service `backup` fourni mais désactivé) |
| Base PostgreSQL | ressource PostgreSQL de Coolify (ou autre serveur) | conteneur dans le même déploiement |
| Sauvegardes | planifiées par Coolify vers du stockage S3 | **aucune par défaut** : à activer dans le fichier (voir section 3) |
| `DATABASE_URL` | **vous la saisissez** | générée automatiquement |

Dans les deux cas, les migrations de la base s'appliquent toutes seules au démarrage de `app`. Dans Coolify, le fichier utilisé se choisit avec **Docker Compose Location**.

---

## 1. Prérequis

- Coolify installé sur votre VPS, avec son serveur « localhost » validé.
- Un nom de domaine (ex. `app.mondomaine.com`) dont l'enregistrement **A** pointe vers l'IP du VPS (ports 80 et 443 ouverts).
- Le dépôt Git du projet accessible par Coolify, avec ces fichiers committés : `Dockerfile`, `docker-compose.yml`, `docker-compose.with-db.yml`, `docker-entrypoint.sh`, `scripts/migrate.mjs`, `drizzle/`, `public/.gitkeep`.

## 2. Mode A — Base PostgreSQL indépendante (Coolify)

### 2.1 Créer la base
1. Dans le **même projet et le même environnement** que l'application : **+ New → Database → PostgreSQL** (version 16).
2. Laissez Coolify générer l'utilisateur, le mot de passe et le nom de la base (ou choisissez `mentora`). **Ne cochez pas** « Make it publicly available » : la base ne doit pas être exposée sur Internet.
3. **Start**. Sur la page **General** de la base, copiez l'**URL de connexion interne** (« Postgres URL (internal) ») : de la forme `postgresql://utilisateur:motdepasse@<nom-interne>:5432/mentora`.
4. Si le mot de passe contient des caractères spéciaux, encodez-les dans l'URL : `@` → `%40`, `!` → `%21`, `#` → `%23`, `/` → `%2F`.

### 2.2 Planifier les sauvegardes (à ne pas sauter)
1. **Storages / S3** (menu de gauche de Coolify) : ajoutez votre stockage S3 (Backblaze B2, Scaleway, Cloudflare R2, AWS…).
2. Dans la ressource PostgreSQL, onglet **Backups** : créez une planification (par exemple chaque jour), cochez l'envoi vers S3 et définissez la rétention.
3. Faites un **Backup now** pour vérifier que le fichier arrive bien dans le stockage S3.

### 2.3 Créer l'application
1. **+ New → dépôt Git**, branche voulue, **Build Pack : Docker Compose**.
2. **Base Directory** `/` — **Docker Compose Location** `/docker-compose.yml`.
3. **Advanced → Docker compose → « Connect to Predefined Network »** : à **cocher**. C'est ce qui permet à `app` de joindre la base par son nom interne. Sans cela, l'application ne trouve pas la base (`ENOTFOUND`).
4. **Domains**, ligne du service `app` : `https://app.mondomaine.com:3600` (le `:3600` est le port interne, le public utilise le 443).
5. **Environment Variables** : voir la section 4. Saisissez en particulier `DATABASE_URL` avec l'URL interne copiée plus haut.
6. **Deploy**.

Pour une base **sur un autre serveur ou un service géré** : `DATABASE_URL` avec l'hôte public, et `DATABASE_SSL=require` (ou `no-verify` si le certificat est auto-signé). N'utilisez pas de pooler en mode « transaction » (PgBouncer, port 6543 de Supabase) : l'application s'appuie sur des verrous de session. Prenez la connexion directe ou le mode session.

## 3. Mode B — Tout-en-un

1. **Docker Compose Location** : `/docker-compose.with-db.yml`.
2. Rien à saisir pour la base : Coolify génère `SERVICE_USER_POSTGRES` et `SERVICE_PASSWORD_POSTGRES`.
3. Ne renseignez **pas** de domaine pour `db` (ni pour `backup`, si vous l'activez).
4. **Ce mode ne sauvegarde rien par défaut** : le service `backup` et le volume `backup-data` sont commentés dans `docker-compose.with-db.yml`. Sans eux, la base n'a aucune copie. Pour les activer, décommentez le service `backup` et la ligne `#backup-data:` de la section `volumes`. Il écrit alors un dump compressé chaque jour (7 jours, 4 semaines, 3 mois) dans le volume `backup-data`, **sur le même VPS** : prévoyez une copie hors serveur. Pour des sauvegardes vers S3 gérées par Coolify, utilisez le mode A.
5. Restauration d'un dump (si `backup` est activé) :
   ```bash
   docker exec -i <conteneur-db> sh -c 'gunzip -c | psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < dump.sql.gz
   ```
   Les dumps sont dans `/backups/daily/` du conteneur `backup`.

## 4. Variables d'environnement (onglet Environment Variables)

**Générée par Coolify, à ne pas modifier** : `SERVICE_HEX_64_AUTHSECRET` (secret de session). Ne la changez jamais après la mise en service : toutes les sessions seraient fermées. (En mode B, `SERVICE_USER_POSTGRES` et `SERVICE_PASSWORD_POSTGRES` aussi.)

| Variable | Valeur | Rôle |
|---|---|---|
| `DATABASE_URL` *(mode A)* | URL interne de la base | **Obligatoire en mode A.** Mot de passe encodé si caractères spéciaux. |
| `DATABASE_SSL` *(mode A, optionnelle)* | vide, `require`, `no-verify` ou `disable` | Vide pour une base interne à Coolify. `require` pour une base distante avec SSL. |
| `APP_URL` | `https://app.mondomaine.com` | Adresse publique **exacte**, sans `/` final. Liens des e-mails, cookies, contrôle d'origine. |
| `TRUSTED_ORIGINS` | vide ou `https://www.mondomaine.com` | Autres adresses autorisées, séparées par des virgules. |
| `OPS_API_KEY` | vide, ou la clé générée par le tableau de bord de l'opérateur (Mentora SaaS) | Active `GET /api/ops/usage` (compteurs d'usage uniquement, jamais de contenu) et `POST /api/ops/suspension`. Vide : ces adresses répondent 404. Une clé par instance. |
| `APP_VERSION` | vide ou ex. `1.4.0` | Version affichée dans le tableau de bord de l'opérateur (par défaut : version du `package.json`). |
| `ACTIVATION_BY_EMAIL` | `false`, puis `true` quand le SMTP livre | `false` : compte actif d'emblée + mot de passe provisoire donné à l'administrateur. |
| `EMAIL_PROVIDER` | `smtp` (ou vide) | Vide : e-mails écrits dans les journaux seulement. |
| `EMAIL_FROM` | `Mentora <no-reply@mondomaine.com>` | Domaine **vérifié** chez le fournisseur SMTP. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | ex. `smtp.resend.com` / `465` / `resend` / clé API | Cochez « Is Secret » sur le mot de passe. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | *(vides)* | Notifications push : paire de clés générée **une seule fois** par `npm run push:keys` (en local), à conserver (gestionnaire de mots de passe). **Une paire par instance.** Vides : le profil indique « Non disponible sur cette instance ». Cochez « Is Secret » sur la clé privée. Ne les changez pas ensuite : les appareils déjà abonnés cesseraient de recevoir les notifications. |
| `VAPID_SUBJECT` | `mailto:contact@mondomaine.com` | Contact de l'exploitant transmis aux services push. |

**Optionnelles** : `APP_TIMEZONE` (`Africa/Abidjan`), `DISABLE_SCHEDULER` (`false`). Mode B : `POSTGRES_DB` (défaut `mentora`) ; et, seulement si vous activez le service `backup` : `BACKUP_SCHEDULE`, `BACKUP_KEEP_DAYS`, `BACKUP_KEEP_WEEKS`, `BACKUP_KEEP_MONTHS`.

> **Important.** Pour chaque variable que vous créez à la main, vérifiez que **Runtime** est sur « Available at runtime ». Sur « Not available in the container », la variable n'arrive pas dans l'application.

Aucune variable `NEXT_PUBLIC_*` : le mode serveur est figé dans l'image.

## 5. Premier déploiement

1. **Deploy**, puis suivre **Deployment Logs**.
2. Dans les journaux de `app` : `Migrations appliquées.` puis `Démarrage de l'application.`. Si la base démarre après l'application, vous verrez « pas encore joignable… nouvelle tentative » pendant jusqu'à une minute : c'est normal.
3. La sonde `https://app.mondomaine.com/api/health` répond `{"status":"ok"}` quand la base est joignable (503 sinon). Coolify s'en sert pour savoir si `app` est « healthy ».
4. Ouvrez le site : sur une base vide, **/setup** crée le premier administrateur. Faites-le tout de suite (tant qu'il n'existe pas, cette page est accessible à tous).
5. Vérifiez : connexion, création d'un coach (mot de passe provisoire affiché une fois), liste mise à jour sans rafraîchir.

## 6. Passer du mode B au mode A en conservant les données

À faire **avant** de changer de fichier, le plus tôt possible. Gardez l'ancien volume `db-data` tant que tout n'est pas validé : ne supprimez pas les volumes.

1. Créez la base PostgreSQL de Coolify (section 2.1), **sans** déployer encore l'application avec le nouveau fichier.
2. Sur le VPS, exportez l'ancienne base :
   ```bash
   docker exec <ancien-conteneur-db> sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > mentora.dump
   ```
3. Importez-la dans la nouvelle (base vide) :
   ```bash
   docker exec -i <nouveau-conteneur-db> sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' < mentora.dump
   ```
4. Dans l'application : **Docker Compose Location** → `/docker-compose.yml`, cochez « Connect to Predefined Network », ajoutez `DATABASE_URL`, puis **Redeploy**.
5. Vérifiez l'accès avec un compte existant. Les pièces jointes restent en place si la ressource est la même (le volume `storage-data` garde son nom). Si vous préférez repartir de zéro, sautez les étapes 2 et 3.

*Point non vérifié :* je n'ai pas testé ce que Coolify fait des anciens conteneurs `db` et `backup` au redéploiement. Contrôlez la liste des conteneurs après coup et arrêtez à la main ceux qui restent.

## 7. Mises à jour

- Activez le **webhook** du dépôt, ou cliquez **Deploy** après chaque `git push`.
- **Application installée (PWA)** : après chaque déploiement, les appareils où l'application est installée affichent « Nouvelle version disponible » avec un bouton « Mettre à jour » (vérification à l'ouverture, au retour sur l'application et toutes les heures). Cette détection repose sur l'identifiant de build `SOURCE_COMMIT`, que Coolify transmet au build. **À vérifier au premier déploiement** : `https://app.mondomaine.com/sw.js` doit contenir un identifiant stable (pas `dev`), différent après un nouveau commit.
- Les migrations sont rejouées automatiquement. Un échec arrête le conteneur `app` : le déploiement est marqué en erreur et l'ancienne version reste servie.
- Gardez **une seule instance** de `app` (le planificateur intégré tourne dans le processus). Pour en lancer plusieurs, mettez `DISABLE_SCHEDULER=true` et programmez `npm run jobs` par cron.

## 8. Sauvegardes : ce qu'il faut couvrir

| Donnée | Où | Sauvegarde |
|---|---|---|
| Base PostgreSQL | ressource PostgreSQL (mode A) | Backups planifiés de Coolify vers S3 |
| Pièces jointes | volume `storage-data` de `app` | **À prévoir** : copie régulière hors VPS (`rclone`/`rsync` via **Scheduled Tasks**, ou snapshot du VPS) |
| Secret de session | variable Coolify | Notez-le dans un gestionnaire de mots de passe |

## 9. Dépannage

| Symptôme | Cause probable |
|---|---|
| « No Available Server » | Domaine sans `:3600`, ou `app` pas encore « healthy » (voir Runtime Logs). |
| « Invalid origin » ou « Origine non autorisée » | `APP_URL` différent du domaine utilisé (http/https, `www`, barre finale), ou variable non disponible à l'exécution. |
| Journal : `ENOTFOUND` sur la base | « Connect to Predefined Network » non coché, ou base dans un autre environnement/réseau. |
| Journal : `28P01 password authentication failed` | Mauvais mot de passe dans `DATABASE_URL` (ou caractères spéciaux non encodés). |
| Journal : `3D000 database … does not exist` | La base indiquée dans l'URL n'existe pas : la créer. |
| Journal : `The server does not support SSL` | `DATABASE_SSL=require` sur une base sans SSL : le laisser vide. |
| `/api/health` en 503 | Base arrêtée ou injoignable : démarrer la base. |
| `SMTP_550` dans les envois | Domaine d'expédition non vérifié : corriger `EMAIL_FROM`. |
| Tout le monde déconnecté après un redéploiement | `SERVICE_HEX_64_AUTHSECRET` modifié. |
| Pièces jointes perdues | Volume `storage-data` supprimé : ne jamais cocher la suppression des volumes. |

## 10. Test local

Mode B (tout-en-un) :
```bash
cp .env.docker.example .env.docker      # renseigner les secrets (openssl rand -hex …)
docker compose -f docker-compose.with-db.yml -f docker-compose.local.yml --env-file .env.docker up -d --build
```
Mode A : fournissez une `DATABASE_URL` vers un PostgreSQL de votre choix (voir `.env.docker.example`) et utilisez `docker-compose.yml` à la place de `docker-compose.with-db.yml`.
