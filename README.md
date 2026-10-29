# Coaching BRVM — MVP (phase frontend)

Application web de gestion du coaching individuel asynchrone pour une communauté d’investissement BRVM (cf. [docs/PRD.md](docs/PRD.md)).

**Phase actuelle** : frontend complet des trois espaces (administrateur, coach, apprenant), branché sur un **backend simulé dans le navigateur**. Les règles métier ne sont pas simulées visuellement : elles sont implémentées et testées dans des modules de domaine, derrière une façade d’API qui applique authentification, permissions, validation et transactions. Architecture et modèle de données : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Démarrage

Prérequis : Node.js ≥ 20.

```bash
npm install
cp .env.example .env.local      # NEXT_PUBLIC_DEMO_MODE=true pour la démonstration
npm run dev                     # http://localhost:3000
```

Production locale : `npm run build && npm start`.

## Prendre l’application en main

1. Ouvrez `/login`. La base est vide au premier lancement.
2. Choisissez l’une des deux options :
   - **Charger les données de démonstration** (mode démo). Le jeu est généré en rejouant les vraies opérations métier sur une horloge simulée : comptes, affectations, droits, demandes dans tous les statuts, retard avec escalade, réouverture, évaluations, échecs d’e-mail.
   - **Créer le premier administrateur** (`/setup`), puis créer les comptes depuis l’espace admin.
3. Comptes de démo (mot de passe commun `Demo-Coaching-2026`, affiché sur la page de connexion) :

| Compte | Situation illustrée |
|---|---|
| `admin@coaching-demo.example` | Administratrice |
| `moussa.diabate@…` / `fatou.ndiaye@…` | Coachs (une demande en retard et escaladée chez Moussa) |
| `kouadio.yao@…` | Droit sans quota, une demande réaffectée, une demande annulée |
| `mariam.traore@…` | Demande clôturée, évaluée puis réouverte (cycle 2), échéance proche |
| `ibrahim.sanogo@…` | Quota épuisé (3/3) : soumission impossible |
| `awa.coulibaly@…` | Demande en cours, demande évaluée 3/5 |
| `serge.nguessan@echec.test` | Adresse en échec : incidents d’envoi d’e-mail |
| `aminata.diallo@…` | Droit suspendu avec une demande ouverte toujours traitée |
| `jeanmarc.kouassi@…` | Droit actif mais aucun coach affecté |

**Astuce** : chaque onglet a sa propre session. Ouvrez un onglet apprenant et un onglet coach pour voir les échanges en direct.

### Outils de démonstration (bouton « Démo », en bas à gauche)

- **Horloge simulée** (+1 h, +4 h, +1 j, +3 j) : fait vivre les délais (rappels à 50 % et 75 %, retards, escalades). Elle ne concerne que le temps métier : sessions, jetons et verrouillages restent en heure réelle.
- **Tâches planifiées** : exécution immédiate.
- **Fournisseur e-mail** : fiable, 50 % d’échecs, ou en panne.
- **Boîte mail de démo** : e-mails réellement émis, avec liens d’activation et de réinitialisation cliquables. Ils ne contiennent jamais le contenu des échanges.

## Tests

```bash
npm test            # 49 tests unitaires et d’acceptation (Vitest)
npm run test:e2e    # 11 parcours navigateur (Playwright, après npm run build)
npm run typecheck
```

| Suite | Contenu | Résultat |
|---|---|---|
| `businessHours.test.ts` | Calcul des heures ouvrées : exemples du PRD, pause, fériés, fuseau avec heure d’été, cohérence aller-retour | 13/13 ✅ |
| `stateMachine.test.ts` | Transitions autorisées et interdites | 4/4 ✅ |
| `acceptance.test.ts` | **REC-01 à REC-20** + authentification (verrouillage, réinitialisation, expiration), quotas (remboursement, correction), confidentialité des e-mails, pièces jointes piégées | 31/31 ✅ |
| `seed.test.ts` | Cohérence du jeu de démonstration | 1/1 ✅ |
| `e2e/journeys.spec.ts` | Parcours apprenant → coach → apprenant, accès refusés, quota épuisé, supervision et réaffectation, activation par e-mail, horloge et escalade, toutes les pages des 3 espaces sans erreur console ni HTTP, mobile | 11/11 ✅ |

## Ce qui est réellement appliqué (et non simulé à l’écran)

- **Permissions vérifiées à chaque opération** par la façade : l’URL d’une ressource ne contourne rien (REC-09, 16, 17). Le compte et le rôle sont revérifiés à l’intérieur de chaque transaction.
- **Transactions atomiques** : verrou exclusif entre onglets (Web Locks API), état relu dans le verrou, annulation complète en cas d’erreur. **Quotas** : registre signé append-only, clé d’idempotence par soumission (REC-03, REC-20).
- **Échéances** figées à la soumission avec la version de politique appliquée. Recalcul uniquement par une action admin motivée et auditée (REC-15).
- **Retard calculé**, jamais stocké comme statut. Rappels et escalades idempotents (clés d’événement uniques).
- **Historiques non modifiables** : statuts, réaffectations, cycles, affectations, registre de quota, journal d’audit. Aucun message ne peut être supprimé ni modifié.
- **Pièces jointes** : liste blanche, taille maximale, vérification de la signature binaire, clé de stockage générée, téléchargement après contrôle, sans URL permanente.
- **Sécurité** : mots de passe hachés en PBKDF2-SHA256, jetons stockés sous forme de hash et à usage unique, verrouillage après 5 échecs, expiration de session (2 h d’inactivité, 12 h au maximum), messages d’erreur sans divulgation, export CSV protégé contre l’injection de formules.

## Décisions d’interprétation à valider (PRD §21 et ajouts)

Toutes sont paramétrables dans **Paramètres** ou documentées dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §5.

1. **« Enregistrement initial »** (`SUBMITTED → WAITING_FOR_COACH`) : déclenché à la première consultation de la demande par le coach responsable. L’apprenant peut annuler tant que la demande est « Soumise ».
2. **Clôture par l’apprenant** : désactivée par défaut, comme le propose le PRD (paramètre).
3. **Relance après réponse finale** (ajout) : un message de l’apprenant sur une demande « Réponse apportée » la repasse « En cours » (paramètre, activé par défaut).
4. **Réponse finale depuis « En attente de l’apprenant »** : interdite par le tableau de transitions du PRD. Le coach doit attendre la réponse de l’apprenant.
5. **Priorité** : fixée à « Normale » à la création, modifiable par le coach responsable ou l’administrateur (tracé). Sans effet sur le délai.
6. **Après réaffectation**, l’ancien coach perd tout accès à la demande, y compris en lecture (moindre privilège).
7. **Une nouvelle attribution de droit** remplace le droit en cours (conservé dans l’historique) et repart avec un registre de quota vierge.
8. **Administrateur** : il supervise les échanges sans y écrire. Il dispose de « Relancer le coach ». Sa consultation d’une demande est journalisée une fois par jour.
9. **E-mails** : 4 tentatives au maximum (5 min, 15 min, 1 h, 4 h), puis alerte de l’administrateur et relance manuelle possible.
10. **Pièces jointes par défaut** : 5 Mo, 5 fichiers, formats pdf, png, jpg, txt, csv, docx, xlsx.

Restent à arbitrer par le produit : durées de conservation des données et des journaux, fournisseur d’e-mails, hébergement et sauvegardes.

## Limites connues de cette phase

- **Pas de serveur** : les données vivent dans le navigateur (localStorage, et IndexedDB pour les fichiers), par navigateur et par profil. Les règles sont appliquées par une façade qui s’exécute côté client. Elles ne sont donc pas inviolables face à un utilisateur qui modifie le stockage local. **Ne pas utiliser avec de vraies données.**
- Les tâches planifiées s’exécutent lors de l’activité de l’application (rattrapage au plus toutes les 15 s, ou à la demande), et non dans un worker indépendant.
- Les e-mails partent vers une boîte simulée.
- Le contenu des pièces jointes n’est pas analysé par un antivirus.

## Backend serveur (PostgreSQL)

Stack : **PostgreSQL + Drizzle ORM + BetterAuth**. Le contrat est inchangé : `src/lib/api.ts` expose les mêmes fonctions, qui ciblent soit la façade simulée (démo), soit le serveur.

| Mode | Activation | Données | Session |
|---|---|---|---|
| Démo | `NEXT_PUBLIC_DEMO_MODE=true` | localStorage / IndexedDB (navigateur) | jeton en sessionStorage |
| Serveur | `NEXT_PUBLIC_DEMO_MODE=false` | PostgreSQL (`DATABASE_URL`) | cookie httpOnly BetterAuth |

**Mise en route du mode serveur**

1. Renseigner `DATABASE_URL` (caractères spéciaux du mot de passe encodés : `@` → `%40`, `!` → `%21`), `AUTH_SECRET` (`openssl rand -hex 32`) et `APP_URL`.
2. `npm run db:migrate` (migrations dans `drizzle/`, dont `0005_seed_default_config.sql` qui insère la configuration par défaut : calendrier, politique d’échéance, catégories, paramètres). Après une modification du schéma : `npm run db:generate` puis `npm run db:migrate`. `npm run db:studio` pour explorer la base.
3. `npm run dev`, puis `/setup` pour créer le premier administrateur.

Les pièces jointes sont stockées sur disque dans `PRIVATE_STORAGE_PATH` (par défaut `storage/private`, ignoré par git), sous une clé générée ; seuls leurs métadonnées sont en base. Elles sont envoyées en base64 dans le JSON du RPC et téléchargées par `GET /api/attachments/<id>` après contrôle de la session et du droit d’accès à la demande. À sauvegarder avec la base.

**Création des comptes.** `ACTIVATION_BY_EMAIL=true` : le compte est « en attente » et reçoit un lien d’activation (72 h) par e-mail. `ACTIVATION_BY_EMAIL=false` (défaut actuel, tant qu’un expéditeur d’e-mails n’est pas opérationnel) : le compte est actif d’emblée et l’administrateur reçoit, une seule fois, un **mot de passe provisoire** à transmettre à l’utilisateur ; « Réinitialiser l’accès » en génère un nouveau (l’ancien est remplacé, les sessions ouvertes sont fermées, un compte resté « en attente » est activé). Le mot de passe provisoire n’est stocké nulle part en clair (ni base, ni audit). La démo reste en activation par e-mail.

**E-mails et tâches planifiées.** Une fois par minute : rappels au coach à 50 % et 75 % du délai de 1ʳᵉ réponse, passage en retard, escalade aux administrateurs, alerte si le coach responsable est suspendu ou absent, envoi des e-mails, nettoyage des sessions et jetons expirés. Chaque notification met un e-mail en file ; la file est traitée par le planificateur intégré au serveur (`src/instrumentation.ts`), ou par `npm run jobs` (cron ou processus dédié, avec `DISABLE_SCHEDULER=true`). Nouvelles tentatives à 5, 15, 60 puis 240 min ; au-delà du nombre maximal (paramètre), l’envoi passe en échec et les administrateurs sont alertés. Plusieurs instances peuvent tourner en parallèle (verrous `SKIP LOCKED`, clés d’événement uniques : aucun doublon). En développement, après modification d’un fichier chargé par `instrumentation.ts` (`src/server/live/jobs.ts` et ses dépendances), redémarrer `npm run dev` si le serveur répond `__webpack_modules__[moduleId] is not a function`. Les e-mails d’accès (activation, réinitialisation) partent immédiatement ; leur lien contient un jeton et n’est jamais conservé : en cas d’échec, utiliser « Renvoyer l’accès ».

Sans fournisseur d’e-mail (`EMAIL_PROVIDER` vide), les e-mails (activation, réinitialisation) sont écrits dans la console du serveur avec leur lien.

**Organisation**

- `src/server/pg/` : client Drizzle et schéma (`schema/auth.ts` = tables BetterAuth étendues, `schema/domain.ts` = modèle métier).
- `src/server/auth.ts` : configuration BetterAuth (pas d’inscription publique, session de 2 h glissante, verrou de 15 min après 5 échecs par adresse, garde-fou par IP).
- `src/server/live/` : implémentations PostgreSQL des modules, exposées par `POST /api/rpc/<module>/<fonction>` (`registry.ts`).
- Connexion, déconnexion et demande de réinitialisation passent directement par `/api/auth/*` (BetterAuth).

**Avancement**

| Module | État |
|---|---|
| Authentification, profil, mot de passe, activation | ✅ migré |
| Utilisateurs (admin) | ✅ migré |
| Coachs (profil, disponibilités, absences), affectations, droits/quota | ✅ migré |
| Demandes : brouillon, soumission (quota, échéance), messages, prise en charge, annulation, clôture | ✅ migré |
| Demandes : pièces jointes, évaluation, réouverture, notes internes, réaffectation, priorité, relance, recalcul d’échéance | ✅ migré |
| Paramètres de service (politique versionnée, fériés, catégories, réglages) | ✅ migré |
| Notifications in-app, e-mails SMTP (file d’envoi, nouvelles tentatives, supervision) | ✅ migré |
| Tâches planifiées : rappels 50/75 %, retards, escalades, alertes coach indisponible, nettoyage | ✅ migré |
| Tableaux de bord, rapports, export CSV, journal d’audit | ✅ migré |

Tous les modules tournent sur PostgreSQL en mode serveur. Les modules `src/modules/*` (domaine pur) et les schémas Zod sont réutilisés tels quels.

**Écarts connus par rapport à la simulation** : pas de plafond absolu de 12 h sur la session (seule l’inactivité de 2 h s’applique) ; les notifications créées côté serveur sont in-app uniquement, en attendant le module e-mail .

Les règles d’unicité sont garanties par la base (index uniques partiels : une affectation active et un droit en vigueur par apprenant) et les opérations concurrentes sont sérialisées par verrous de ligne (`SELECT … FOR UPDATE`).

## Déploiement avec Docker / Coolify

`docker-compose.yml` déploie PostgreSQL 16, l'application (port 3600) et des sauvegardes quotidiennes de la base. Les migrations s'appliquent au démarrage du conteneur `app` (`docker-entrypoint.sh`).

- **Coolify (VPS auto-hébergé)** : guide pas à pas dans [docs/DEPLOIEMENT_COOLIFY.md](docs/DEPLOIEMENT_COOLIFY.md).
- **Test local** : `cp .env.docker.example .env.docker` (renseigner les deux secrets), puis `docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.docker up -d --build`. Premier administrateur : page `/setup`.
- Une seule instance de `app` (planificateur intégré) ; le mode démo n'existe pas dans l'image.
