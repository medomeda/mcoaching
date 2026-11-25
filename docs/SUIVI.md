# Suivi du projet — Mentora (dépôt « mcoaching »)

Document de référence pour suivre l'avancement. À mettre à jour à chaque étape terminée (section 6).
Dernière mise à jour : 27/10/2026.

## 1. Le produit en bref

Plateforme d’accompagnement individuel (coachs, formateurs, mentors…, tous domaines) avec trois espaces :

| Espace | Rôle | Usage principal |
|---|---|---|
| `/admin` | Administrateur | Comptes, coachs, affectations, droits (quotas), demandes, rapports, paramètres, audit |
| `/coach` | Coach | Traiter les demandes de ses apprenants, disponibilités, absences |
| `/learner` | Apprenant | Créer et suivre ses demandes, échanger avec son coach, évaluer |

Spécification fonctionnelle : [PRD.md](PRD.md). Architecture : [ARCHITECTURE.md](ARCHITECTURE.md).

## 2. Stack technique

- **Front** : Next.js 15 (App Router), React 19, TanStack Query, Zod, Tailwind 4, Radix Dialog, sonner.
- **Serveur** : routes `POST /api/rpc/<module>/<fonction>`, session par cookie httpOnly.
- **Authentification** : BetterAuth 1.7 (pas d'inscription publique, mot de passe ≥ 10 caractères, session 2 h d'inactivité, verrouillage après 5 échecs en 15 min).
- **Base de données** : PostgreSQL + Drizzle ORM (migrations dans `drizzle/`, 0000 à 0005).
- **E-mails** : nodemailer en SMTP (Resend), file d'attente avec nouvelles tentatives (5 / 15 / 60 / 240 min).
- **Pièces jointes** : fichiers sur disque (`PRIVATE_STORAGE_PATH`), téléchargement via `GET /api/attachments/<id>`.

## 3. Ce qui est développé

### 3.1 Phase 1 — Application « frontend d'abord » (terminée)
Les trois espaces complets sur un backend **simulé dans le navigateur** (mode démo, `NEXT_PUBLIC_DEMO_MODE=true`) : données de démonstration, horloge simulée, boîte mail de démo. Les règles métier sont dans `src/modules/*` (machine à états des demandes, délais/SLA, droits et quotas, permissions, indicateurs), testées unitairement (49 tests) et **réutilisées telles quelles par le serveur**.

### 3.2 Phase 2 — Persistance réelle (terminée, étapes 1 à 7)

| Étape | Contenu |
|---|---|
| 1 | Schéma PostgreSQL (≈ 30 tables), migrations Drizzle, configuration par défaut en base |
| 2 | BetterAuth : connexion, déconnexion, mot de passe oublié, activation, changement de mot de passe, limitation des tentatives |
| 3 | Utilisateurs : création, modification, rôle, statut, réinitialisation d'accès |
| 4 | Coachs (profil, disponibilités, absences), affectations coach/apprenant, droits et quotas (écritures concurrentes sécurisées) |
| 5 | Demandes : brouillon, soumission, prise en charge, messages, notes, clôture, réouverture, réaffectation, évaluation, pièces jointes |
| 6 | Notifications, e-mails SMTP, paramètres de l'application |
| 7 | Tâches planifiées (échéances, disponibilité des coachs, purge, envoi d'e-mails), tableaux de bord, rapports, export CSV, journal d'audit |

Garanties de cohérence : verrous `SELECT … FOR UPDATE`, verrous consultatifs, index uniques partiels, `SKIP LOCKED` pour les tâches, clés uniques pour éviter les notifications en double.

### 3.3 Évolutions récentes
- **Création de compte sans e-mail** (`ACTIVATION_BY_EMAIL=false`, valeur actuelle) : le compte est actif tout de suite et l'administrateur reçoit **une fois** un mot de passe provisoire à transmettre (fenêtre avec bouton « Copier »). « Réinitialiser l'accès » en génère un nouveau. Raison : Resend refuse (`SMTP_550`) les destinataires autres que le propriétaire du compte tant qu'aucun domaine n'est vérifié.
- **Listes à jour automatiquement** après une création ou modification en mode serveur (avant : rafraîchissement manuel nécessaire).
- **Redirection après connexion** corrigée : l'adresse `?next=` n'est suivie que si elle appartient à l'espace du rôle connecté (avant : page « Accès refusé » fréquente).
- Liens de notification corrigés vers `/{admin|coach|learner}/notifications`.

### 3.4 Passage à un produit générique : Mentora (étape 1 terminée)
- Plus aucune référence à la bourse ou à la BRVM dans l'interface, les e-mails, les notifications, les données de démonstration et les tests. « Coaching » devient « accompagnement » (ex. « Droit d'accompagnement »).
- **Onglet Paramètres → Identité** : nom de la plateforme (interface, onglet du navigateur, e-mails ; par défaut *Mentora*), nom de l'entreprise / du coach / du formateur, présentation courte, e-mail, téléphone et site web (affichés sur l'écran de connexion), et mention facultative aux membres (connexion, menu, formulaire de demande). Le nom se règle aussi à la création de l'espace sur `/setup`.
- **Catégories** : remplacement de la liste par un modèle (les catégories utilisées par des demandes sont désactivées, jamais supprimées), ajout d'un modèle, création, modification, suppression (refusée si utilisée).
- **Modèles de catégories** : général, finance et investissement, développement personnel, formation, entrepreneuriat. Choisi à la création de l'espace ; d'autres modèles peuvent être ajoutés ensuite dans Paramètres.
- Migrations `0006_brand_and_notice` et `0007_organization_identity` (colonnes ajoutées à `app_settings`). Les instances existantes passent au nom *Mentora* et gardent leurs catégories actuelles, à modifier dans Paramètres.
- Vérifié : typecheck, 53 tests unitaires et d'acceptation, 11 parcours Playwright (mode démo), et un essai sur base jetable (migration, création d'espace avec modèle, changement de nom, titre de l'onglet).

### 3.5 Site Mentora (vitrine + tableau de bord opérateur) et supervision des instances
- **Dossier `site/`** (projet indépendant, base `mentora_site`) : vitrine publique (accueil, fonctionnalités, pour qui, tarifs, FAQ, essai gratuit, pages légales, SEO : métadonnées, plan du site, robots, JSON-LD), tableau de bord opérateur sur un second nom de domaine (connexion + double authentification obligatoire, formules, prospects, clients, paiements, alertes, journal), supervision (santé toutes les 5 min, usage quotidien, suspension d'une instance). Guide : `docs/DEPLOIEMENT_SITE.md`.
- **Dans Mentora** : `GET /api/ops/usage` (compteurs uniquement) et `POST /api/ops/suspension`, actifs seulement si `OPS_API_KEY` est définie ; migration `0008_suspension` ; une instance suspendue refuse connexions et appels (message affiché), n'envoie plus rappels ni e-mails, garde ses données ; `/api/health` reste en 200.
- **Procédure d'un nouveau client** : `docs/MISE_EN_SERVICE_CLIENT.md` ; sauvegarde de toutes les bases : `scripts/ops/backup-all.sh`.
- **Vérifié** : 113 tests unitaires et d'intégration dans `site/`, 63 dans la racine (dont 7 sur les points d'accès `ops`, sur base jetable), 5 parcours Playwright dans `site/` dont le parcours complet « demande d'essai → client → deux instances réelles → suspension → réactivation ». Pour relancer ce parcours : `export MENTORA_STANDALONE_DIR=$(site/scripts/build-mentora-for-e2e.sh)` puis `cd site && npx playwright test`.
- **Limites connues** : les instances existantes doivent être mises à jour (nouvelle image + `OPS_API_KEY`) pour être supervisées ; paiement et facturation restent manuels ; pas d'e-mail de notification (le tableau de bord est la seule voie d'alerte).

## 4. Deux modes de fonctionnement

| | Démo | Serveur |
|---|---|---|
| Variable | `NEXT_PUBLIC_DEMO_MODE=true` | `NEXT_PUBLIC_DEMO_MODE=false` |
| Données | navigateur (localStorage) | PostgreSQL |
| Usage | démonstration, tests rapides | développement réel, production |

**Ne jamais activer la démo en production.**

## 5. Prise en main

```bash
npm install --legacy-peer-deps     # conflit de dépendances connu (better-auth / vite)
cp .env.example .env.local         # puis renseigner DATABASE_URL, AUTH_SECRET, etc.
npm run db:migrate                 # applique les migrations
npm run dev                        # http://localhost:3600
```

- `DATABASE_URL` : encoder les caractères spéciaux du mot de passe (`@` → `%40`, `!` → `%21`).
- `AUTH_SECRET` : `openssl rand -hex 32`.
- Premier administrateur : page `/setup` sur une base vide.
- Commandes utiles : `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`, `npm run jobs` (tâches planifiées hors serveur), `npm run db:studio`.
- Les variables sont documentées dans `.env.example` ; le détail du backend est dans le README (« Backend serveur (PostgreSQL) »).

Pièges connus :
- Après de nombreuses modifications, le rechargement à chaud peut produire `__webpack_modules__[moduleId] is not a function` ou des 404/500 transitoires : **redémarrer `npm run dev`**.
- Une modification de `.env.local` n'est prise en compte qu'au redémarrage.
- Le serveur Postgres local héberge d'autres bases : ne toucher qu'à `exemple_db`.

## 6. Reste à faire (par priorité)

| # | Chantier | Détail | Statut |
|---|---|---|---|
| 1 | **Envoi d'e-mails réel** | Vérifier un domaine chez Resend (ou autre SMTP), changer `EMAIL_FROM`, puis repasser `ACTIVATION_BY_EMAIL=true`. **Remplacer la clé Resend** : elle a été partagée en clair. | À faire |
| 2 | Changement de mot de passe obligatoire à la première connexion | Non implémenté : aujourd'hui l'utilisateur est seulement invité à le changer depuis son profil. | À faire |
| 3 | Suite de tests du mode serveur | Les scénarios e2e (45, 63, 55, 54, 37, 44 vérifications) ont tourné depuis un dossier temporaire et ne sont pas dans le dépôt. Les intégrer comme vraie suite (base jetable). | À faire |
| 4 | Tests Playwright / acceptation | `e2e/journeys.spec.ts` vise le mode démo ; à adapter au mode serveur. | À faire |
| 5 | Vérification visuelle | Fenêtre du mot de passe provisoire, mise à jour automatique des listes et redirection après connexion : vérifiés par le code et le typecheck, **pas encore dans le navigateur**. | À faire |
| 6 | Déploiement Coolify | Deux variantes prêtes et **testées en local** : base indépendante (`docker-compose.yml`, défaut) et tout-en-un (`docker-compose.with-db.yml`). Guide : [DEPLOIEMENT_COOLIFY.md](DEPLOIEMENT_COOLIFY.md). Reste : bascule de l'instance Coolify vers la base indépendante (+ reprise éventuelle des données), sauvegardes S3 de la base et des pièces jointes, domaine d'envoi d'e-mails. | En cours |
| 7 | Échec ponctuel du test SMTP | Un échec après démarrage à froid du serveur de dev, non reproduit (44/44 au rejeu). Cause non isolée. | À surveiller |

### 6.b Feuille de route produit (SaaS)
| # | Chantier | Statut |
|---|---|---|
| P1 | Produit neutre : nom, mention, catégories par modèle | **Fait** |
| P2 | **Vocabulaire par espace** (coach/apprenant → formateur/participant, consultant/client…). Non fait : « coach » et « apprenant » restent écrits en dur dans environ 150 textes d'interface, dans les notifications et dans les e-mails, et les accords du français imposent de réécrire chaque phrase. À traiter avec des modèles de vocabulaire. | À faire |
| P3 | Procédure de mise en service d'un client (une instance par client) — `docs/MISE_EN_SERVICE_CLIENT.md`, `scripts/ops/` | **Fait** |
| P4 | Site vitrine (`site/`), offre et tarifs, tableau de bord opérateur — plan : `docs/superpowers/plans/2026-11-25-mentora-site-saas.md` | **Fait** (reste à fournir : domaine, mentions légales, prix et limites des formules, e-mail de contact ; puis déploiement) |
| P5 | Multi-client (espaces de travail) quand le seuil est atteint | Plus tard |

## 7. État de qualité (dernière vérification)

- Typecheck : OK.
- Tests unitaires : 49/49.
- `next build` : OK (avant les trois derniers correctifs d'interface, à rejouer).
- Scénarios serveur : tous passés sur base jetable.

## 8. Comptes présents dans la base `exemple_db`

| E-mail | Rôle | Statut |
|---|---|---|
| atraoreweb@gmail.com | Administrateur | Actif |
| atraoreshop@gmail.com | Coach | Actif |
| atraoremedia@gmail.com | Coach | Actif |

## 9. Où trouver quoi

| Besoin | Emplacement |
|---|---|
| Règles métier pures | `src/modules/*` |
| Backend serveur (une fonction par action) | `src/server/live/*` |
| Schéma et migrations | `src/server/pg/schema/*`, `drizzle/` |
| Configuration BetterAuth | `src/server/auth.ts` |
| Bascule démo / serveur | `src/lib/api.ts` |
| Backend simulé (démo) | `src/server/api/*`, `src/server/db/*` |
| E-mails | `src/server/mail/sender.ts` |
| Tâches planifiées | `src/server/live/jobs.ts`, `src/instrumentation.ts`, `scripts/run-jobs.ts` |
