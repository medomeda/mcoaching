# Mise en service d'un nouveau client Mentora

Un client = **une instance** de l'application (image Docker commune) + **une base** sur le PostgreSQL partagé + **une adresse** `client.<domaine>`. Compter une trentaine de minutes la première fois, dix ensuite.

Prérequis : le tableau de bord (`site/`) est déployé (voir `docs/DEPLOIEMENT_SITE.md`), et l'image de l'application est disponible dans Coolify.

## 1. Préparer l'enregistrement dans le tableau de bord

1. Tableau de bord → **Clients → Nouveau client** (ou **Prospects → Convertir en client**).
2. Saisissez le nom, le contact, le **sous-domaine** (ex. `acme` pour `acme.mentora.app`), la formule et la période de facturation.
3. À la création, la **clé d'accès de l'instance** s'affiche **une seule fois** : copiez-la (elle servira à `OPS_API_KEY`, étape 3). Perdue ? Fiche client → *Régénérer la clé*.

## 2. Créer la base et l'utilisateur

Sur le PostgreSQL partagé, avec un compte administrateur :

```bash
psql "postgresql://admin:MOT_DE_PASSE@hote:5432/postgres" \
  -v db=client_acme -v dbuser=client_acme -v dbpassword='UN_MOT_DE_PASSE_LONG' \
  -f scripts/ops/create-client-db.sql
```

Le script crée l'utilisateur et la base, et interdit à tout autre utilisateur d'ouvrir cette base. URL à utiliser ensuite (encoder `@` en `%40`, `!` en `%21`, `#` en `%23` dans le mot de passe) :
`postgresql://client_acme:MOT_DE_PASSE_ENCODE@hote:5432/client_acme`

## 3. Créer l'instance dans Coolify

1. Dupliquer la ressource modèle (ou en créer une depuis l'image commune, voir `docs/DEPLOIEMENT_COOLIFY.md`, mode « base indépendante »).
2. Variables d'environnement (toutes « Available at runtime ») :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | l'URL de l'étape 2 |
| `APP_URL` | `https://acme.mentora.app` (exactement l'adresse publique) |
| `AUTH_SECRET` | une valeur aléatoire propre à ce client (`openssl rand -hex 32`) |
| `OPS_API_KEY` | la clé copiée à l'étape 1 |
| `APP_VERSION` | facultatif (ex. `1.0.0`) |

3. Domaine : `https://acme.mentora.app` (enregistrement DNS `*.mentora.app` vers le serveur, une fois pour toutes).
4. Déployer. Les migrations s'appliquent au démarrage ; l'échec d'une migration arrête le conteneur.

## 4. Créer l'administrateur du client

Ouvrir `https://acme.mentora.app/setup` : saisir le nom de la plateforme, le modèle de catégories, puis le compte administrateur du client. Transmettre ensuite l'adresse et les accès au client (le guide `docs/GUIDE_UTILISATION.md` est destiné à ses membres).

## 5. Vérifier

- Fiche client → **Tester la connexion** : santé « en ligne » et compteurs (version, coachs, membres) affichés. Si les compteurs sont indisponibles : clé différente de `OPS_API_KEY`, ou variable non disponible à l'exécution.
- Après 5 minutes, un contrôle de santé apparaît dans « Derniers contrôles ». Le premier relevé d'usage arrive dans la journée.
- Passer le statut du client à **Actif** quand l'essai se transforme en abonnement ; saisir les paiements à la main (l'échéance se met à jour seule).

## Suspension et réactivation

Fiche client → **Suspendre l'instance** (message facultatif affiché aux utilisateurs). Les sessions ouvertes sont fermées, la connexion est refusée avec le message, les rappels et e-mails sont interrompus ; **aucune donnée n'est supprimée**. **Réactiver** rétablit tout immédiatement. Si l'instance ne répond pas, le statut du tableau de bord n'est pas modifié et l'erreur est affichée.

## Résiliation

1. Fiche client → statut **Résilié** (les alertes cessent).
2. Laisser au client le temps de récupérer ses données, puis supprimer la ressource Coolify, la base et l'utilisateur :
   `DROP DATABASE client_acme WITH (FORCE); DROP ROLE client_acme;`
3. Supprimer le volume `storage-data` de l'instance (pièces jointes).

## Sauvegardes

Un seul script sauvegarde **toutes** les bases du serveur partagé, `mentora_site` comprise (paiements et clés chiffrées) :

```bash
scripts/ops/backup-all.sh "postgresql://admin:MOT_DE_PASSE@hote:5432/postgres" /var/backups/mentora
```

- Planifier une exécution quotidienne (cron ou tâche planifiée Coolify) et **copier le dossier hors du serveur**.
- À sauvegarder à part : la variable `MASTER_KEY` de `site/` (sans elle, les clés d'instance enregistrées sont inutilisables : il faudrait les régénérer) et le volume `storage-data` de chaque instance (pièces jointes).
- Restauration d'une base : `gunzip -c client_acme.sql.gz | psql "<url de la base vide>"`.
- Le script sort en erreur si une base échoue : brancher cette sortie sur une alerte.
