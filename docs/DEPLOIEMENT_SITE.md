# Déploiement du site Mentora (vitrine + tableau de bord)

Le dossier `site/` est une application Next.js **indépendante** de l'application Mentora (`src/`). Un seul conteneur sert deux noms de domaine :

| Nom de domaine | Rôle | Variable |
|---|---|---|
| `mentora.app` (exemple) | vitrine publique | `SITE_URL=https://mentora.app` |
| `admin.mentora.app` (exemple) | tableau de bord de l'opérateur (double authentification) | `ADMIN_HOST=admin.mentora.app` |

Tout autre nom de domaine reçoit une erreur 404. Seule la sonde `/api/health` répond sur n'importe quel nom (contrôle interne de Docker/Coolify).

## 1. Base de données dédiée

Sur le serveur PostgreSQL partagé, créez une base `mentora_site` et son propre utilisateur (jamais les identifiants d'un client) :

```sql
CREATE USER mentora_site WITH PASSWORD '…';
CREATE DATABASE mentora_site OWNER mentora_site;
```

Cette base contient les paiements et les clés d'instance chiffrées : elle fait partie des sauvegardes (voir `scripts/ops/backup-all.sh`).

## 2. Variables d'environnement

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | `postgresql://mentora_site:MOT_DE_PASSE_ENCODÉ@hôte:5432/mentora_site` (encoder `@` en `%40`, `!` en `%21`…) |
| `DATABASE_SSL` | vide, `disable`, `require` ou `no-verify` |
| `SITE_URL` | adresse publique, avec `https://` |
| `ADMIN_HOST` | nom de domaine du tableau de bord, sans schéma |
| `INSTANCE_DOMAIN` | domaine des instances clientes (`*.INSTANCE_DOMAIN`) |
| `MASTER_KEY` | 32 octets en base64 (`openssl rand -base64 32`) : chiffre les clés des instances. **À sauvegarder à part : sans elle, les clés enregistrées sont perdues.** |
| `AUTH_SECRET` | secret de session (`openssl rand -base64 32`) |
| `LEGAL_COMPANY_NAME`, `LEGAL_ADDRESS`, `LEGAL_EMAIL`, `LEGAL_PHONE` | mentions légales (affichées « À compléter » tant qu'elles sont vides) |

Dans Coolify, chaque variable doit être « Available at runtime » (voir `docs/DEPLOIEMENT_COOLIFY.md`).

## 3. Coolify

1. Nouvelle ressource → dépôt Git → **Dockerfile**, répertoire de base `site`, fichier `Dockerfile`, port **3601**.
2. Domaines : `https://mentora.app` **et** `https://admin.mentora.app` sur la même ressource (séparés par une virgule).
3. Renseignez les variables ci-dessus, déployez : les migrations s'appliquent au démarrage, l'échec d'une migration arrête le conteneur.
4. Vérifiez : `https://mentora.app` affiche la vitrine, `https://mentora.app/admin` répond 404, `https://admin.mentora.app/` répond 404 (seul `/admin` existe sur cet hôte).

Une seule réplique : la limitation de débit du formulaire d'essai est en mémoire.

## 4. En local

```bash
cd site
cp .env.example .env.local     # puis adapter
npm install --legacy-peer-deps
npm run db:migrate
npm run dev                    # http://localhost:3601 ; le tableau de bord : http://admin.localhost:3601/admin
```

Tests : `SITE_TEST_DATABASE_URL` (dans `site/.env.local`) doit pointer vers la base `postgres` d'un serveur où l'utilisateur peut créer des bases ; chaque test crée et supprime sa propre base.
