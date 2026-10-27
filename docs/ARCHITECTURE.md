# Architecture — MVP Coaching individuel BRVM (phase frontend)

> Phase actuelle : **frontend complet des 3 espaces** (admin, coach, apprenant) branché sur un
> **backend simulé dans le navigateur**. Les règles métier ne sont pas « maquettées » : elles sont
> implémentées dans des modules de domaine purs et testés, exécutés derrière une façade d'API
> qui applique authentification, autorisations, validation et transactions — exactement comme le
> fera le futur serveur.

## 1. Analyse des exigences — points structurants

| Exigence PRD | Conséquence d'architecture |
|---|---|
| Règles métier centralisées côté serveur (§1.1, §11.4) | Domaine pur dans `src/modules/*` (aucune dépendance UI ni stockage). L'UI n'appelle **que** `src/server/api` (façade). Le jour du vrai backend, ces modules sont déplacés côté serveur sans réécriture. |
| Permissions vérifiées à chaque opération (§9.1, §13.1) | Chaque opération de la façade : `session → rôle/statut → politique d'accès sur la ressource → validation Zod → transaction`. Masquer un bouton n'est jamais le contrôle. |
| Quotas non dépassables, idempotence (§7.2, REC-03, REC-20) | Registre `coaching_quota_ledger` signé, clé d'idempotence unique `submit:<requestId>`, transaction exclusive (Web Locks API inter-onglets + mutex local) avec relecture de l'état dans le verrou. |
| Délais en heures ouvrées (§7.3) | Service `deadlines/businessHours.ts` (fuseau configurable, pauses, fériés). Échéance **figée** à la soumission avec l'identifiant de politique appliquée. Recalcul uniquement par action admin motivée et auditée. |
| Retard ≠ statut (§7.4, §8.1) | `isOverdue` calculé (cycle courant, pas de première réponse, `now > due_at`). Jamais stocké comme statut. |
| Cycles (§7.6) | Table `coaching_request_cycles` ; réouverture = nouveau cycle (nouvelle échéance, nouvelle première réponse, nouvelle évaluation possible). |
| Notifications idempotentes + e-mails avec relance (§7.4, §9.11, §14) | Table `notification_events` (clé unique d'événement), `notifications` (in-app), `email_delivery_logs` (PENDING → SENT / RETRY / FAILED). Le « fournisseur e-mail » simulé dépose dans une boîte de démo et peut être configuré pour échouer. |
| Tâches planifiées (§14) | `src/server/jobs` : fonctions pures et idempotentes `runScheduledJobs(now)`. Dans la simulation, elles tournent à chaque appel d'API (rattrapage) + un déclenchement manuel. En production elles seront exécutées par un worker serveur. |
| Traçabilité (§8.3, §12.20) | Historiques append-only : statuts, affectations, réaffectations de demandes, registre de quota, audit. Aucun message supprimable/éditable dans le MVP. |
| Pièces jointes privées (§9.9) | Binaire en IndexedDB sous clé générée ; métadonnées en base ; validation de taille, extension **et signature binaire (magic bytes)** côté façade ; téléchargement via l'API après contrôle, URL d'objet éphémère révoquée immédiatement. |
| Données de démo (§18) | Aucune donnée au démarrage. Seed **explicite** (bouton « Mode démonstration »), généré en rejouant les vraies opérations métier sur une horloge simulée → données cohérentes (historiques, registre, notifications). Écran « Créer le premier administrateur » quand la base est vide. |

## 2. Stack

- **Next.js 15 (App Router) + React 19 + TypeScript strict**
- **Tailwind CSS v4**, composants maison accessibles (Radix Dialog pour modales/tiroir), icônes `lucide-react`, toasts `sonner`
- **TanStack Query** : états chargement / erreur / vide, invalidation après mutation et entre onglets
- **Zod** : validation des entrées dans la façade (même schéma réutilisable côté serveur demain)
- **Vitest** : tests unitaires du domaine + tests d'acceptation REC-01 → REC-20 contre la façade

## 3. Organisation

```text
src/
  app/                    Routes Next.js
    (auth)/               connexion, mot de passe oublié, réinitialisation, activation, premier admin
    admin/ coach/ learner/  espaces par rôle (layout + garde de rôle)
  components/
    ui/                   design system (Button, Card, Dialog, Table, Badge, états…)
    layout/               shell responsive, navigation, cloche de notifications
    requests/             liste, détail, fil de discussion, notes, historique (partagés entre rôles)
    demo/                 barre d'outils de démonstration (horloge, tâches, boîte mail)
  modules/                DOMAINE PUR — aucune dépendance UI/stockage
    deadlines/            calcul heures ouvrées, fuseaux
    requests/             machine à états, références, retard, cycles
    quotas/               registre, solde, contrôles
    entitlements/         statut effectif du droit
    permissions/          politiques d'accès par rôle/ressource
    reporting/            indicateurs
    ...
  server/                 BACKEND SIMULÉ (à remplacer par des routes API)
    db/                   schéma, stockage (localStorage / mémoire), transactions, verrous
    api/                  façade : 1 fichier par domaine, contrôle session + permissions
    jobs/                 rappels, retards, escalades, e-mails, relances
    mail/                 fournisseur e-mail simulé + gabarits (sans contenu privé)
    files/                stockage privé des pièces jointes (IndexedDB / mémoire)
    seed/                 jeu de démonstration explicite
  lib/                    client API (hooks), formatage, libellés FR
  tests/
```

## 4. Modèle de données

Conforme au §12 du PRD, avec les ajouts nécessaires à la traçabilité :

| Table | Rôle | Contraintes clés (appliquées par la façade) |
|---|---|---|
| `users` | comptes | e-mail normalisé unique ; statut `PENDING_ACTIVATION / ACTIVE / SUSPENDED` ; jamais supprimé |
| `credentials` | hash PBKDF2-SHA256 + sel | jamais exposé |
| `sessions`, `auth_tokens`, `login_attempts` | sessions expirantes, jetons activation/reset à usage unique (hash), anti-bruteforce | |
| `coach_profiles` | bio, spécialités | |
| `coach_assignments` | historique d'affectation principale | ≤ 1 active par apprenant |
| `coaching_entitlements` | droit (statut, période, quota) | statut effectif calculé (expiré si `expires_at` dépassé) |
| `coaching_quota_ledger` | `CONSUME (-1)`, `REFUND (+n)`, `CORRECTION (±n)` | **solde = limite + Σ quantités** ; clé d'idempotence unique |
| `coach_availability`, `coach_absences` | disponibilités / absences | n'affectent pas les échéances |
| `coaching_categories` | catégories administrables | |
| `coaching_requests` | entité principale | référence `COA-AAAA-NNNNNN` unique ; statut contrôlé |
| `coaching_request_cycles` | cycles de traitement | échéance + politique figées par cycle |
| `request_status_history` | historique des statuts | append-only |
| `request_assignment_history` | **ajout** : réaffectations de demandes (ancien/nouveau coach, auteur, motif) | append-only |
| `coaching_messages` | fil (types `USER` / `SYSTEM`) | `SYSTEM` ne compte jamais comme 1ʳᵉ réponse |
| `message_attachments` + stockage privé | métadonnées + clé de stockage générée | pas d'URL publique |
| `request_reads` | **ajout** : dernier passage par utilisateur → messages non lus | |
| `coaching_notes` | notes internes | jamais renvoyées à un apprenant |
| `service_calendars`, `service_holidays`, `service_policies` | calendrier, fériés, politique **versionnée** (`effective_from`) | |
| `app_settings` | pièces jointes, décisions configurables (§21) | audité |
| `notification_events` | **ajout** : clé unique d'événement → anti-doublon | |
| `notifications`, `email_delivery_logs` | in-app, e-mails (tentatives, prochain essai, code erreur) | pas de contenu privé |
| `coaching_ratings` | évaluations | 1 par (demande, cycle), note 1–5, apprenant concerné, cycle clôturé |
| `audit_logs` | journal d'audit | append-only, lecture admin uniquement |

## 5. Cycle de vie d'une demande (décisions d'interprétation)

```
DRAFT ──soumettre──▶ SUBMITTED ──1ʳᵉ consultation coach (« enregistrement initial »)──▶ WAITING_FOR_COACH
  │                     │  └──prendre en charge / répondre──▶ IN_PROGRESS ◀──répondre/prendre en charge── WAITING_FOR_COACH
  └─abandonner─▶ CANCELLED ◀─annuler (apprenant, avant toute action du coach)
IN_PROGRESS ──demander des précisions──▶ WAITING_FOR_LEARNER ──réponse apprenant──▶ IN_PROGRESS
IN_PROGRESS ──réponse finale──▶ RESPONSE_PROVIDED ──clôturer──▶ CLOSED ──réouverture admin motivée──▶ nouveau cycle (WAITING_FOR_COACH)
RESPONSE_PROVIDED ──relance de l'apprenant (paramètre, activé par défaut)──▶ IN_PROGRESS   ← ajout signalé
```

- 1ʳᵉ réponse humaine = premier message du coach (réponse, précision ou réponse finale) dans le cycle.
- L'accusé de réception automatique est un message `SYSTEM` (REC-05).
- Clôture : coach responsable ou admin ; apprenant seulement si le paramètre `learnerCanClose` est activé (désactivé par défaut, §21).
- Annulation : pas de remboursement automatique de quota (§7.2) ; remboursement = action admin tracée.

## 6. Ordre de développement

1. Socle : projet, design system, stockage simulé, transactions, erreurs, horloge.
2. Domaine pur + tests : heures ouvrées, machine à états, quotas, droits, permissions.
3. Façade API : auth (sessions, activation, reset, anti-bruteforce), utilisateurs, coachs, affectations, droits/quotas, disponibilités.
4. Demandes, messagerie, pièces jointes, notes, historiques.
5. Notifications, e-mails, tâches planifiées (rappels, retards, escalades, relances).
6. Clôture, réouverture, cycles, évaluations, rapports, exports, audit, paramètres.
7. Écrans des 3 espaces + outils de démo + seed.
8. Tests d'acceptation REC-01 → REC-20, vérification navigateur, documentation.
