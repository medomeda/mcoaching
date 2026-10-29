# Suivi du projet — Coaching BRVM (mcoaching)

Document de référence pour suivre l'avancement. À mettre à jour à chaque étape terminée (section 6).
Dernière mise à jour : 27/10/2026.

## 1. Le produit en bref

Plateforme de coaching sur la BRVM avec trois espaces :

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
| 6 | Déploiement Coolify | Pile Docker prête et **testée en local** (build, migrations au démarrage, connexion). Guide : [DEPLOIEMENT_COOLIFY.md](DEPLOIEMENT_COOLIFY.md). Reste : premier déploiement réel sur le VPS, vérification du domaine d'envoi d'e-mails, copie hors VPS des sauvegardes (base + pièces jointes). | En cours |
| 7 | Échec ponctuel du test SMTP | Un échec après démarrage à froid du serveur de dev, non reproduit (44/44 au rejeu). Cause non isolée. | À surveiller |

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
