# Mentora — vitrine, tableau de bord opérateur et passerelle `ops` : plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer le dossier `site/` (vitrine SEO + tableau de bord opérateur) et les points d'accès `ops` de l'application Mentora, pour vendre et superviser des instances clientes.

**Architecture:** `site/` est un projet Next.js indépendant (son `package.json`, sa base `mentora_site`, aucun import depuis `src/`). Un middleware route par nom d'hôte (public / administration). Le tableau de bord interroge chaque instance Mentora en HTTPS sur `/api/health` et `/api/ops/usage` avec une clé propre à l'instance ; `/api/ops/*` est ajouté à `src/` (compteurs uniquement).

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript strict (`noUncheckedIndexedAccess`), Tailwind 4, Drizzle + PostgreSQL, BetterAuth (plugin `twoFactor`), Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-24-mentora-site-saas-design.md` (les « § » ci-dessous y renvoient).

## Global Constraints

- Français uniquement, accents corrects, prix en FCFA ; `<html lang="fr">`.
- Style identique à l'application : jetons de couleur et typographie copiés de `src/app/globals.css` (bleu marine, or). Aucun import entre `site/` et `src/`.
- Aucun prix, limite ou durée d'essai en dur : tout vient de la table `plan` ; seules les formules `published = true` sont publiques ; aucune formule publiée → « Demandez un essai » sans prix et sans `offers` JSON-LD.
- Hôtes : `SITE_URL` (public), `ADMIN_HOST` (administration), `INSTANCE_DOMAIN` (instances `*.INSTANCE_DOMAIN`), `MASTER_KEY` (32 octets en base64, chiffrement des clés), `DATABASE_URL`. Hôte inconnu → 404.
- Pages `/admin` : `X-Robots-Tag: noindex, nofollow` ; `robots.txt` les exclut ; TOTP obligatoire ; verrouillage après échecs répétés.
- Clés d'instance : 32 octets aléatoires, affichées une seule fois, stockées chiffrées, jamais dans les journaux ni côté navigateur.
- `/api/ops/*` : absent (`OPS_API_KEY` non définie) → 404 ; comparaison à temps constant ; réponse d'usage limitée aux champs du contrat §6.5.
- Santé toutes les 5 min (purge à 30 j), usage 1 fois/jour (400 j, unicité client+jour). Seuils : hors ligne > 15 min, essai < 7 j, inactivité 14 j, limite à 90 %.
- Hors périmètre : paiement en ligne, e-mails de notification, mise en service automatique, multi-clients, anglais, blog.
- Chaque tâche : `npm run typecheck` et `npm test` verts (dans `site/` pour les tâches 1–12, 14–15 ; à la racine pour 13) avant le commit.

## Review Focus

- Hôte avec port, majuscules, point final ou `X-Forwarded-Host` forgé : jamais d'accès `/admin` depuis l'hôte public (Tâche 1).
- Aucune formule publiée, formule sans prix annuel, limites vides (= illimité) : pages Tarifs et JSON-LD valides, sans « 0 FCFA » ni `NaN` (Tâche 4).
- Même e-mail soumis deux fois, casse différente, honeypot rempli, consentement absent : un seul prospect, pas d'erreur 500 (Tâche 5).
- Adresse d'instance piégée (`https://client.mentora.app@evil.com`, IP, `localhost`, sous-domaine imbriqué, redirection 302) : refusée sans requête sortante (Tâche 14).
- Échéance : paiement le 31 janvier + 1 mois, paiement en avance, paiement antérieur à l'échéance en cours (Tâche 12).
- Suspension avec message vide, réactivation, session ouverte pendant la suspension, `/api/health` toujours 200 (Tâche 13).

---

## Phase 1 — Vitrine (`site/`)

### Task 1: Socle `site/` et routage par hôte

**Files:**
- Create: `site/package.json`, `site/tsconfig.json`, `site/next.config.ts` (`output: "standalone"`), `site/postcss.config.mjs`, `site/vitest.config.ts`, `site/.env.example`, `site/src/app/globals.css`, `site/src/app/layout.tsx`, `site/src/middleware.ts`, `site/src/lib/host.ts`, `site/src/lib/host.test.ts`
- Modify: `.gitignore` (ignorer `site/.next`, `site/node_modules`)

**Interfaces:**
- Produces: `type HostKind = "public" | "admin" | "unknown"`; `classifyHost(rawHost: string | null, env: { siteUrl: string; adminHost: string }): HostKind` (insensible à la casse, ignore port et point final).

- [ ] **Step 1: Écrire `host.test.ts`** : `classifyHost("MENTORA.app:443", …)` → `"public"` ; `"admin.mentora.app."` → `"admin"` ; `null`, `"evil.com"`, `"admin.mentora.app.evil.com"` → `"unknown"`.
- [ ] **Step 2: Lancer** `cd site && npx vitest run src/lib/host.test.ts` → échec attendu (module absent).
- [ ] **Step 3: Implémenter `classifyHost`** dans `site/src/lib/host.ts`.
- [ ] **Step 4: Middleware** `site/src/middleware.ts` : utilise le seul en-tête `host` (jamais `x-forwarded-host`) ; `unknown` → 404 ; `public` + chemin `/admin*` ou `/api/admin*` → 404 ; `admin` + chemin hors `/admin*`, `/api/admin*`, `/_next*`, `/api/health` → 404 ; ajoute `X-Robots-Tag: noindex, nofollow` sur l'hôte `admin`. Test de table dans `host.test.ts` sur une fonction pure `decide(kind, pathname): "next" | "notfound"` exportée de `host.ts`.
- [ ] **Step 5: Copier les jetons** de `src/app/globals.css` dans `site/src/app/globals.css` ; `layout.tsx` charge la police via `next/font` (même famille que l'application, lire `src/app/layout.tsx`).
- [ ] **Step 6: Vérifier** `npm run typecheck && npm test && npm run build` dans `site/` → verts.
- [ ] **Step 7: Commit** `feat(site): socle Next.js et routage par hôte`.

### Task 2: Base de données de `site/` (formules et prospects d'abord)

**Files:**
- Create: `site/drizzle.config.ts`, `site/src/db/client.ts`, `site/src/db/schema.ts`, `site/drizzle/0000_*.sql` (généré), `site/scripts/migrate.mjs` (même comportement que `scripts/migrate.mjs` de la racine : attente, SSL), `site/src/test/db.ts`
- Test: `site/src/db/schema.test.ts`

**Interfaces:**
- Produces (tables Drizzle, §6.4 — toutes les tables dès maintenant pour une seule migration initiale) : `plan`, `client`, `payment`, `prospect`, `healthCheck`, `usageSnapshot`, `auditLog` ; `db` ; enum `clientStatus` (`ESSAI|ACTIF|IMPAYE|SUSPENDU|RESILIE`), `prospectStatus` (`NOUVEAU|CONTACTE|CONVERTI|PERDU`) ; `usageSnapshot` unique `(clientId, day)` ; `prospect.emailNormalized` ; montants en entiers FCFA ; `plan.maxCoaches`, `plan.maxMembers` nullables (= illimité) ; `plan.trialDays` défaut 30 ; `plan.annualDiscountPercent` entier 0–100.
- `src/test/db.ts` : `withTestDb(fn)` crée une base jetable à partir de `SITE_TEST_DATABASE_URL`, applique les migrations, supprime la base ensuite.

- [ ] **Step 1: Test** : `schema.test.ts` insère deux relevés `usageSnapshot` pour le même `(clientId, day)` et attend une violation d'unicité ; insère un `plan` sans prix annuel (accepté).
- [ ] **Step 2: Échec attendu**, puis écrire le schéma, `npx drizzle-kit generate`, implémenter `withTestDb`.
- [ ] **Step 3: Vérifier** le test vert ; `node scripts/migrate.mjs` s'exécute deux fois sans erreur.
- [ ] **Step 4: Commit** `feat(site): schéma de données et migrations`.

### Task 3: Pages publiques statiques et composants

**Files:**
- Create: `site/src/components/{site-header,site-footer,hero,benefits,how-it-works,audiences,faq,cta-band}.tsx`, `site/src/content/{home,features,audiences,faq}.ts` (textes), `site/src/app/(public)/{page.tsx,fonctionnalites/page.tsx,pour-qui/page.tsx,faq/page.tsx,mentions-legales/page.tsx,conditions/page.tsx,confidentialite/page.tsx}`
- Test: `site/src/content/content.test.ts`

**Interfaces:**
- Consumes: `/essai` (Tâche 5) comme cible des boutons « Demander un essai gratuit » ; `/tarifs` (Tâche 4).
- Produces: `faqItems: { question: string; answer: string }[]` (réutilisé par JSON-LD, Tâche 6).

- [ ] **Step 1: Test** `content.test.ts` : le hero contient exactement le slogan, le sous-titre et les pastilles « Demandes centralisées », « Suivi des délais » (§2) ; aucun texte ne contient « BRVM », « bourse » ni un chiffre suivi de « FCFA » ; `faqItems.length >= 6`.
- [ ] **Step 2: Écrire** les contenus (rédaction libre, ton de l'application, mots-clés §6.2) et les composants ; un seul `h1` par page ; l'accueil suit l'ordre §6.1 (le formulaire est un lien vers `/essai`, l'extrait des tarifs arrive en Tâche 4).
- [ ] **Step 3: Pages légales** : texte avec champs `À compléter` lus dans `site/src/content/legal.ts` (raison sociale, adresse, e-mail via variables d'environnement `LEGAL_*`, jamais inventés) ; le test échoue si une valeur absente produit « undefined ».
- [ ] **Step 4: Vérifier** `npm test` vert et `npm run build` : les pages listées sont statiques (`○` dans la sortie).
- [ ] **Step 5: Commit** `feat(site): pages publiques`.

### Task 4: Tarifs lus en base

**Files:**
- Create: `site/src/lib/plans.ts`, `site/src/lib/plans.test.ts`, `site/src/app/(public)/tarifs/page.tsx`, `site/src/components/pricing-table.tsx`, `site/src/components/pricing-teaser.tsx`
- Modify: `site/src/app/(public)/page.tsx` (extrait des tarifs)

**Interfaces:**
- Produces: `listPublishedPlans(): Promise<PublicPlan[]>` (tag de cache `"plans"`, ordre `position`) ; `type PublicPlan = { id: string; name: string; description: string; monthlyPrice: number | null; annualPrice: number | null; maxCoaches: number | null; maxMembers: number | null; trialDays: number; features: string[]; highlighted: boolean }` ; `formatFcfa(n: number): string` (`"15 000 FCFA"`, espace insécable) ; `limitLabel(n: number | null, noun: string): string` (`null` → `"Illimité"`) ; `annualPriceOf(plan): number | null` (prix annuel saisi, sinon `monthly × 12 × (1 − remise/100)` arrondi à l'entier, sinon `null`).

- [ ] **Step 1: Tests** (`plans.test.ts`, `withTestDb`) : une formule non publiée n'est jamais renvoyée ; `formatFcfa(15000)` = `"15 000 FCFA"` ; `limitLabel(null, "membres")` = `"Membres illimités"` ; `annualPriceOf` avec remise 20 % sur 10 000 → 96 000 ; aucun prix → `null`.
- [ ] **Step 2: Implémenter** et la page `tarifs` (`revalidate = false`, régénérée par `revalidateTag("plans")` appelé par les actions de la Tâche 10) ; aucune formule publiée → bloc « Demandez un essai » sans prix.
- [ ] **Step 3: Vérifier** tests verts ; en navigateur local avec 0 puis 3 formules publiées, la page est cohérente.
- [ ] **Step 4: Commit** `feat(site): page tarifs pilotée par la base`.

### Task 5: Formulaire de demande d'essai

**Files:**
- Create: `site/src/lib/trial.ts`, `site/src/lib/trial.test.ts`, `site/src/lib/rate-limit.ts`, `site/src/lib/rate-limit.test.ts`, `site/src/app/(public)/essai/{page.tsx,trial-form.tsx,actions.ts}`

**Interfaces:**
- Produces: `zTrialRequest` (nom ≥ 2, e-mail valide, téléphone facultatif, activité, message ≤ 2000, `consent: true` obligatoire, `website` honeypot vide) ; `normalizeEmail(s: string): string` (trim + minuscules) ; `createRateLimiter({ max: number; windowMs: number }): (key: string, now?: number) => boolean` ; `submitTrial(formData): Promise<{ ok: true } | { ok: false; fieldErrors: Record<string, string> }>`.

- [ ] **Step 1: Tests** : consentement absent → erreur de champ ; honeypot rempli → `ok: true` sans insertion (réponse identique à un succès) ; même e-mail en casse différente → un seul prospect (mise à jour du message, pas de doublon) ; le 6ᵉ envoi dans l'heure depuis la même IP → refusé ; une fenêtre écoulée → accepté.
- [ ] **Step 2: Implémenter** ; IP lue dans `x-forwarded-for` (premier élément) ; clé d'unicité `prospect.emailNormalized`.
- [ ] **Step 3: Vérifier** tests verts ; écran de confirmation en français.
- [ ] **Step 4: Commit** `feat(site): demande d'essai`.

### Task 6: SEO (métadonnées, plan du site, données structurées)

**Files:**
- Create: `site/src/lib/seo.ts`, `site/src/lib/seo.test.ts`, `site/src/app/sitemap.ts`, `site/src/app/robots.ts`, `site/src/components/json-ld.tsx`
- Modify: chaque `page.tsx` public (export `metadata` via `pageMetadata`)

**Interfaces:**
- Produces: `pageMetadata({ path, title, description }): Metadata` (canonique = `SITE_URL + path`, Open Graph, Twitter) ; `organizationLd()`, `faqLd(items)`, `softwareLd(plans: PublicPlan[])` (`offers` omis si `plans` vide ou sans prix).

- [ ] **Step 1: Tests** : `softwareLd([])` n'a pas de clé `offers` ; un plan sans prix mensuel n'ajoute pas d'offre ; `faqLd` reflète `faqItems` ; `sitemap` ne contient aucun chemin `/admin` ; `robots` interdit `/admin` et référence le sitemap.
- [ ] **Step 2: Implémenter** ; titres ≤ 60 caractères, descriptions ≤ 160 (assertion dans le test sur toutes les pages publiques).
- [ ] **Step 3: Vérifier** avec `npm run build && npx next start` puis `curl` de `/`, `/sitemap.xml`, `/robots.txt` ; JSON-LD valide (`JSON.parse` sur chaque bloc dans un test).
- [ ] **Step 4: Commit** `feat(site): SEO`.

### Task 7: Image Docker et déploiement Coolify de `site/`

**Files:**
- Create: `site/Dockerfile`, `site/docker-entrypoint.sh`, `site/docker-compose.yml` (application seule, base externe), `site/src/app/api/health/route.ts`, `docs/DEPLOIEMENT_SITE.md`
- Modify: `docs/SUIVI.md` (état d'avancement)

**Interfaces:** `GET /api/health` → 200 `{status:"ok"}` si la base répond, 503 sinon (accessible sur les deux hôtes).

- [ ] **Step 1: Calquer** le `Dockerfile` et l'entrypoint de la racine (même schéma : migration au démarrage, `node server.js`), port 3601.
- [ ] **Step 2: Doc** : variables (`DATABASE_URL`, `SITE_URL`, `ADMIN_HOST`, `INSTANCE_DOMAIN`, `MASTER_KEY`, `AUTH_SECRET`, `LEGAL_*`), deux domaines sur le même conteneur dans Coolify, création de la base `mentora_site`.
- [ ] **Step 3: Vérifier** `docker build` de `site/` et un lancement avec une base jetable : `/api/health` 200, la page d'accueil répond avec `Host: <SITE_URL>`, `/admin` répond 404 avec cet hôte.
- [ ] **Step 4: Commit** `feat(site): déploiement Docker et Coolify`.

---

## Phase 2 — Tableau de bord : accès et saisie

### Task 8: Authentification de l'opérateur (mot de passe + TOTP)

**Files:**
- Create: `site/src/server/auth.ts`, `site/src/server/audit.ts`, `site/scripts/create-admin.ts` (`npm run create-admin`), `site/src/app/admin/(auth)/{login,two-factor}/page.tsx`, `site/src/server/auth.test.ts`
- Modify: `site/src/db/schema.ts` + migration (tables BetterAuth `user`, `session`, `account`, `verification`, `twoFactor`, `rateLimit`)

**Interfaces:**
- Produces: `auth` (BetterAuth, `baseURL = https://ADMIN_HOST`, `trustedOrigins` = cet hôte seul, inscription désactivée, plugin `twoFactor` avec 10 codes de secours, session courte 8 h) ; `requireOperator(headers: Headers): Promise<{ userId: string }>` (lève si pas de session **ou** TOTP non activé) ; `audit(action: string, target?: string): Promise<void>`.
- `create-admin` : crée le compte (`--email`, mot de passe demandé sans écho) ou, avec `--reset-2fa`, réinitialise le second facteur ; refuse un second compte.

- [ ] **Step 1: Tests** (`withTestDb`) : sans session → `requireOperator` rejette ; session sans TOTP activé → rejette ; la route d'inscription publique est absente ; 5 échecs de connexion → verrouillage.
- [ ] **Step 2: Implémenter**, l'écran de connexion (e-mail + mot de passe, puis code), l'inscription obligatoire du TOTP au premier accès (QR code + 10 codes de secours affichés une fois).
- [ ] **Step 3: Vérifier** manuellement : `npm run create-admin`, connexion, activation TOTP, déconnexion/reconnexion avec code et avec un code de secours.
- [ ] **Step 4: Commit** `feat(site): authentification opérateur avec TOTP`.

### Task 9: Coque du tableau de bord et garde d'accès

**Files:**
- Create: `site/src/app/admin/layout.tsx`, `site/src/app/admin/page.tsx` (squelette des alertes), `site/src/components/admin/{nav,page-header,status-badge,data-table}.tsx`
- Test: `site/e2e/admin-access.spec.ts` (Playwright, `site/playwright.config.ts`)

**Interfaces:** `layout.tsx` appelle `requireOperator` et redirige vers `/admin/login` ; navigation : Accueil, Clients, Prospects, Formules, Journal ; reprend la coque visuelle de `src/components/layout/app-shell.tsx` (lecture seule de ce fichier).

- [ ] **Step 1: Test e2e** : hôte public + `/admin` → 404 ; hôte admin sans session → redirection vers la connexion ; en-tête `X-Robots-Tag` présent ; hôte admin + `/tarifs` → 404.
- [ ] **Step 2: Implémenter**, vérifier le test vert, **Commit** `feat(site): coque du tableau de bord`.

### Task 10: Gestion des formules

**Files:**
- Create: `site/src/app/admin/formules/{page.tsx,plan-form.tsx,actions.ts}`, `site/src/server/plans-admin.ts`, `site/src/server/plans-admin.test.ts`

**Interfaces:**
- Produces: `zPlanInput` ; `savePlan(input): Promise<Plan>` et `setPublished(id, published)` et `reorderPlans(ids: string[])` : chacun appelle `audit(...)` puis `revalidateTag("plans")`.

- [ ] **Step 1: Tests** : enregistrer un plan l'ajoute aux publiés seulement si `published` ; passer `published` à faux le retire de `listPublishedPlans` ; prix négatif refusé ; `maxCoaches` vide enregistré `null` ; remise > 100 refusée ; chaque action écrit une ligne `audit_log`.
- [ ] **Step 2: Implémenter** liste, formulaire (avantages = lignes), publication, ordre. **Commit** `feat(site): gestion des formules`.

### Task 11: Prospects

**Files:**
- Create: `site/src/app/admin/prospects/{page.tsx,actions.ts}`, `site/src/server/prospects.ts`, `site/src/server/prospects.test.ts`

**Interfaces:** `setProspectStatus(id, status)` ; `prospectToClientDraft(id): { name; contactName; contactEmail; contactPhone }` (préremplissage, utilisé par la Tâche 12) ; une conversion marque `CONVERTI` et renseigne `prospect.clientId` à la création du client.

- [ ] **Step 1: Tests** : transitions de statut journalisées ; `prospectToClientDraft` renvoie les coordonnées sans le message ; un prospect `CONVERTI` ne peut pas être converti deux fois.
- [ ] **Step 2: Implémenter** la liste filtrée par statut, le bouton « Convertir en client ». **Commit** `feat(site): prospects`.

### Task 12: Clients, clés chiffrées et paiements

**Files:**
- Create: `site/src/lib/secret-box.ts`, `site/src/lib/secret-box.test.ts`, `site/src/lib/billing.ts`, `site/src/lib/billing.test.ts`, `site/src/server/clients.ts`, `site/src/server/clients.test.ts`, `site/src/app/admin/clients/{page.tsx,nouveau/page.tsx,[id]/page.tsx,actions.ts}`

**Interfaces:**
- `encryptSecret(plain: string, masterKey: Buffer): string` / `decryptSecret(token: string, masterKey: Buffer): string` (AES-256-GCM, jeton `v1.<iv>.<tag>.<data>` en base64url) ; `generateInstanceKey(): string` (32 octets aléatoires, base64url).
- `nextDueDate(current: Date | null, paidOn: Date, period: "MONTHLY" | "ANNUAL"): Date` : part de `max(current, paidOn)`, ajoute une période en **mois calendaires** (le 31 janvier + 1 mois = 28/29 février) ; pour `current = null` part de `paidOn`.
- `createClient(input): Promise<{ client: Client; instanceKey: string }>` (clé renvoyée **une seule fois**) ; `recordPayment(clientId, input)` met à jour `nextDueDate` ; `setClientStatus(id, status)` ; `changePlan(id, planId, period)`.

- [ ] **Step 1: Tests** : aller-retour chiffrement ; jeton altéré → rejet ; `nextDueDate(null, 2027-01-31, MONTHLY)` = 2027-02-28 ; paiement antérieur à l'échéance en cours part de l'échéance ; paiement annuel ajoute 12 mois ; `createClient` ne stocke jamais la clé en clair (relire la ligne en base) ; la fiche client ne renvoie jamais la clé.
- [ ] **Step 2: Implémenter** ; formulaire d'instance : l'adresse est saisie en sous-domaine, validée en Tâche 14 ; liste et fiche (informations, paiements, notes, actions de statut/formule, saisie de paiement) ; affichage unique de la clé après création avec explication « à copier dans `OPS_API_KEY` ».
- [ ] **Step 3: Vérifier** `npm test` vert ; parcours manuel : prospect → client → paiement → échéance mise à jour. **Commit** `feat(site): clients, paiements et clés d'instance`.

---

## Phase 3 — Supervision

### Task 13: Mentora — points d'accès `ops` et suspension (dossier `src/`, racine du dépôt)

**Files:**
- Create: `drizzle/0008_suspension.sql` (via `npm run db:generate`), `src/server/ops/auth.ts`, `src/server/ops/usage.ts`, `src/app/api/ops/usage/route.ts`, `src/app/api/ops/suspension/route.ts`, `src/tests/ops.test.ts`
- Modify: `src/server/pg/schema/domain.ts` (`app_settings.suspended boolean default false`, `suspension_message text`), `src/server/live/context.ts` (`authenticate`), `src/server/auth.ts` (hook de connexion), `src/server/live/auth.ts` (`systemStatus` : `suspended`, `suspensionMessage`), `src/app/(auth)/login/page.tsx` (affiche le message), `src/server/live/jobs.ts` (`processEmails`, rappels : sortie immédiate si suspendue), `.env.docker.example`, `package.json` (`APP_VERSION` : lecture de `process.env.APP_VERSION ?? version`)

**Interfaces:**
- Produces: `checkOpsKey(header: string | null): boolean` (404 si `OPS_API_KEY` vide ; `timingSafeEqual`) ; `computeUsage(now: Date): Promise<OpsUsage>` avec `type OpsUsage = { version: string; generated_at: string; suspended: boolean; coaches_active: number; members_active: number; requests_this_month: number; requests_overdue: number; last_activity_at: string | null }` — **exactement ces clés** ; `setSuspension(suspended: boolean, message: string | null): Promise<void>` ; `AppError` code `SERVICE_SUSPENDED` (statut 503) levé par `authenticate` et le hook de connexion ; les sessions sont supprimées à la suspension.
- `coaches_active` = utilisateurs `COACH` au statut `ACTIVE` ; `members_active` = `LEARNER` `ACTIVE` ; `requests_this_month` = demandes non brouillon créées dans le mois civil ; `requests_overdue` réutilise `slaResolver` (`src/server/live/sla.ts`) sur les demandes ouvertes ; `last_activity_at` = max(`user.lastLoginAt`, dernier `coaching_message.createdAt`).

- [ ] **Step 1: Tests** (`src/tests/ops.test.ts`, mode serveur sur base jetable, comme les tests existants qui en utilisent ; sinon appeler directement `computeUsage` / `setSuspension` / `checkOpsKey` et le handler `GET`) : sans clé configurée → 404 ; mauvaise clé → 401 ; bonne clé → réponse dont `Object.keys` est exactement l'ensemble du contrat (test de non-fuite) ; un utilisateur suspendu ou en attente n'est pas compté ; une demande en retard est comptée ; avec la suspension, `authenticate` lève `SERVICE_SUSPENDED` avec le message, `systemStatus` l'expose, `/api/health` répond toujours 200, `processEmails` n'envoie rien ; réactivation immédiate ; message `null` → message par défaut en français.
- [ ] **Step 2: Implémenter** et appliquer `npm run db:migrate`.
- [ ] **Step 3: Vérifier** `npm run typecheck && npm test` (les 56 tests existants restent verts) et un test manuel : `curl -H "Authorization: Bearer …" localhost:3600/api/ops/usage`.
- [ ] **Step 4: Documenter** `OPS_API_KEY` et `APP_VERSION` dans `.env.docker.example` et `docs/DEPLOIEMENT_COOLIFY.md`. **Commit** `feat: points d'accès ops et suspension d'instance`.

### Task 14: Surveillance des instances (santé, usage, planificateur)

**Files:**
- Create: `site/src/lib/instance-url.ts`, `site/src/lib/instance-url.test.ts`, `site/src/server/instance-client.ts`, `site/src/server/instance-client.test.ts`, `site/src/server/monitoring.ts`, `site/src/server/monitoring.test.ts`, `site/src/instrumentation.ts`

**Interfaces:**
- `parseInstanceUrl(input: string, instanceDomain: string): URL | null` : accepte uniquement `https://<label>.<instanceDomain>` (un seul niveau, sans identifiants, port, chemin imposé ni point final ; IP, `localhost`, `@` → `null`).
- `fetchHealth(client): Promise<{ ok: boolean; status: number | null; latencyMs: number; version: string | null }>` ; `fetchUsage(client): Promise<OpsUsage | null>` : `redirect: "manual"`, délai 5 s, jamais de clé dans les erreurs journalisées.
- `runHealthChecks(now)` (insère `health_check`, purge > 30 j) ; `runUsageSnapshots(now)` (un relevé par client et par jour, `onConflictDoNothing`, rattrape un jour manquant au passage suivant) ; `startMonitoring()` appelé depuis `instrumentation.ts` (5 min / vérification quotidienne), sans effet si `MONITORING=off` (tests).
- `testConnection(clientId)` : action de la fiche client, affiche santé et usage.

- [ ] **Step 1: Tests** : table d'URL — `https://acme.mentora.app` accepté ; `https://acme.mentora.app@evil.com`, `http://acme.mentora.app`, `https://a.b.mentora.app`, `https://127.0.0.1`, `https://localhost`, `https://acme.mentora.app.evil.com`, `https://mentora.app` → `null` ; un serveur de test local qui répond 302 : `fetchHealth` renvoie `ok: false` sans suivre ; une instance qui dépasse le délai → `ok: false` ; deux `runUsageSnapshots` le même jour → une seule ligne ; la purge supprime les contrôles de plus de 30 jours.
- [ ] **Step 2: Implémenter**, relier la validation au formulaire client (Tâche 12) et à chaque appel sortant (re-validation avant requête).
- [ ] **Step 3: Vérifier** `npm test` vert. **Commit** `feat(site): supervision des instances`.

### Task 15: Alertes et accueil du tableau de bord, fiche client enrichie

**Files:**
- Create: `site/src/lib/alerts.ts`, `site/src/lib/alerts.test.ts`, `site/src/components/admin/{alert-list,usage-chart}.tsx`
- Modify: `site/src/app/admin/page.tsx`, `site/src/app/admin/clients/[id]/page.tsx`, `site/src/app/admin/clients/page.tsx` (colonne « En ligne »), `site/src/app/admin/journal/page.tsx` (création si absent)

**Interfaces:**
- `computeAlerts(input: { now: Date; clients: ClientWithState[]; newProspects: number; plans: Map<string, Plan> }): Alert[]` avec `type Alert = { kind: "OFFLINE" | "TRIAL_ENDING" | "OVERDUE" | "NEW_PROSPECT" | "NEAR_LIMIT" | "INACTIVE"; severity: "critical" | "warning" | "info"; clientId?: string; message: string }` ; fonction pure, ordre : critical, warning, info.

- [ ] **Step 1: Tests** (seuils des contraintes globales) : hors ligne 14 min → pas d'alerte, 16 min → `OFFLINE` ; essai finissant dans 6 jours → alerte, dans 8 → non ; limite `null` → jamais d'alerte `NEAR_LIMIT`, 9 sur 10 → alerte, 8 sur 10 → non ; échéance passée d'un client `RESILIE` → pas d'alerte ; instance suspendue → pas d'`OFFLINE` ni d'`INACTIVE` ; aucune activité depuis 14 jours → `INACTIVE`.
- [ ] **Step 2: Implémenter** l'accueil (alertes), le graphique d'usage (SVG sans dépendance : membres actifs et demandes par jour) et le journal ; boutons suspendre/réactiver appellent `POST /api/ops/suspension` de l'instance (clé déchiffrée côté serveur uniquement) puis mettent à jour le statut `SUSPENDU` ; l'échec de l'appel est affiché et le statut inchangé.
- [ ] **Step 3: Vérifier** `npm test` vert. **Commit** `feat(site): alertes et fiche client enrichie`.

---

## Phase 4 — Mise en service et vérification

### Task 16: Procédure de mise en service et sauvegarde

**Files:**
- Create: `docs/MISE_EN_SERVICE_CLIENT.md`, `scripts/ops/create-client-db.sql` (variables `:db`, `:user`, `:password`), `scripts/ops/backup-all.sh`

**Interfaces:** `backup-all.sh <DATABASE_URL_ADMIN> <dossier>` exporte chaque base non-système du serveur (dont `mentora_site`) dans `<dossier>/<date>/<base>.sql.gz` et sort en erreur si une base échoue.

- [ ] **Step 1: Rédiger** le document (§6.7) : base et utilisateur, duplication du modèle Coolify, variables (`DATABASE_URL` encodée, `APP_URL`, `AUTH_SECRET`, `OPS_API_KEY`), domaine, création de l'administrateur du client, enregistrement dans le tableau de bord, vérifications, résiliation et suppression.
- [ ] **Step 2: Vérifier** : exécuter le SQL et le script de sauvegarde sur un PostgreSQL jetable avec deux bases, restaurer un export dans une base vide et compter les tables.
- [ ] **Step 3: Commit** `docs: mise en service client et sauvegarde`.

### Task 17: Parcours de bout en bout avec deux instances

**Files:**
- Create: `site/e2e/saas-journey.spec.ts`, `site/e2e/support/two-instances.ts` (lance deux instances Mentora sur des ports et bases jetables avec deux `OPS_API_KEY`), mise à jour de `docs/SUIVI.md`

- [ ] **Step 1: Écrire le parcours** (§8) : essai demandé sur la vitrine → prospect visible → converti en client → instance enregistrée (clé affichée une fois) → santé et usage affichés → suspension → l'écran de connexion de l'instance montre le message → réactivation → connexion à nouveau possible ; second client indépendant : ses compteurs ne se mélangent pas à ceux du premier.
- [ ] **Step 2: Lancer** `cd site && npx playwright test` → vert ; relancer les tests de la racine (`npm test`, `npm run test:e2e`) → inchangés.
- [ ] **Step 3: Audit SEO** : exécuter Lighthouse mobile sur `/`, `/tarifs`, `/fonctionnalites` ; consigner scores et corrections dans `docs/SUIVI.md`. **Commit** `test(site): parcours de bout en bout`.
