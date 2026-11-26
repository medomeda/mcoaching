# PWA de l'application Mentora : installation, mises à jour, notifications push

Date : 26/11/2026. Statut : en attente d'approbation. Périmètre : l'application principale (`src/`), pas le site (`site/`).

## Intention

Les coachs et les apprenants doivent pouvoir **installer Mentora** sur leur téléphone ou leur ordinateur, **être prévenus quand une nouvelle version est déployée**, et **recevoir des notifications push** pour les événements qui comptent (nouveau message, échéance proche, etc.). Le modèle est le projet koti (`claudeapps/koti`), dont l'implémentation est éprouvée et validée par l'utilisateur.

## Objectifs

- Application installable (Android, iPhone, ordinateur), avec invitation claire à l'installer.
- Détection des nouvelles versions après chaque déploiement, avec choix de l'utilisateur : jamais de rechargement imposé (quelqu'un peut être en train d'écrire un message).
- Push pour toutes les notifications internes, activé appareil par appareil, sur clic.
- Écran verrouillé sans contenu privé : **le type d'événement seulement** (choix de l'utilisateur).

## Hors périmètre

- Mode hors ligne des données : aucune page ni donnée n'est mise en cache. Seule une page « hors ligne » de secours existe.
- Catégories de push au choix, horaires de silence, push groupés : peuvent suivre plus tard.
- Le site `site/` et le mode démonstration (`NEXT_PUBLIC_DEMO_MODE=true`) : pas de service worker, pas de push.

## À éviter à tout prix

- Qu'un titre de demande, un nom, ou un extrait de message apparaisse sur un écran verrouillé.
- Qu'une page ou une réponse d'API soit stockée sur l'appareil (appareils partagés).
- Qu'un échec d'envoi de push bloque ou fasse échouer une opération métier.
- Qu'une instance **suspendue** envoie des push (comme pour les e-mails).

## Approches considérées

- **Service worker** : (A) écrit à la main et servi par une route, comme koti ; (B) bibliothèque Serwist. **Retenu : A.** Sans dépendance, contrôle total du cache (rien de privé stocké), push sans détour. B pré-cache des pages par défaut et ne supprime pas le besoin d'un worker manuel pour le push.
- **Envoi des push** : (A) direct, après validation de la transaction ; (B) par file avec nouvelles tentatives, comme les e-mails. **Retenu : A.** Un push tardif n'a aucune valeur ; les abonnements morts (404/410) sont supprimés.
- **Texte sur l'écran verrouillé** : (A) générique unique ; (B) le type seulement ; (C) titre et résumé. **Retenu : B.**

## Conception

### 1. Installation
- **Manifeste** (`src/app/manifest.ts`) : nom lu dans les paramètres de l'instance (nom de la plateforme défini par l'administrateur, « Mentora » par défaut ; valeur fixe en démo), `display: standalone`, couleur `#0e2340`, fond `#f5f7fa`, icônes 192, 512 et « maskable » 512.
- **Icônes** : PNG générés une fois depuis `icon.svg` (fond or, bulles bleu nuit) et versionnés dans `public/icons/` ; `apple-icon.png` pour iPhone.
- **Carte d'installation** sur l'accueil des trois espaces, masquable (mémorisé sur l'appareil), avec les deux étapes à suivre sur iPhone (Partager, puis « Sur l'écran d'accueil ») ; section « Application » dans les trois pages de profil, toujours disponible. L'invite native est interceptée et déclenchée sur clic.

### 2. Service worker et mises à jour
- **Route `/sw.js`** qui renvoie le script avec l'**identifiant de build** injecté : son contenu change à chaque déploiement, ce qui déclenche la mise à jour sur les appareils installés. Réponse en `no-cache`, avec une politique de sécurité qui n'autorise que ses propres scripts.
- **Identifiant de build** : `SOURCE_COMMIT` (Coolify), sinon horodatage ; injecté par `next.config.ts` ; `ARG SOURCE_COMMIT` ajouté au `Dockerfile` (et transmis par les deux fichiers compose).
- **Règles de cache** : fichiers techniques versionnés (`/_next/static`, `/icons`) en cache d'abord ; pages (navigation) toujours par le réseau, avec la page `/offline` en secours ; tout le reste (`/api/*`, appels RPC, pièces jointes) non intercepté.
- **Gestionnaire côté navigateur** (monté dans le layout racine) : enregistre le worker en production seulement (en développement, il désinscrit tout worker existant) ; vérifie les mises à jour à l'ouverture, au retour sur l'application et toutes les heures ; affiche « Nouvelle version disponible » avec le bouton « Mettre à jour » (notification `sonner` déjà présente) ; sur accord, la nouvelle version est activée puis la page se recharge une seule fois.
- **Page `/offline`** publique, sans appel à la base, avec le logo et un bouton « Réessayer ».

### 3. Notifications push
- **Clés VAPID** par instance : `npm run push:keys` (une fois, à conserver) ; variables `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Clés absentes : la fonction est indiquée « non disponible » dans le profil, sans erreur.
- **Données** : table des appareils abonnés (un point d'accès par appareil, réattribué à la personne qui s'y connecte, purgé sur 404/410), nouvelle migration Drizzle.
- **Activation** : carte « Notifications » du profil ; l'autorisation du navigateur n'est demandée qu'au clic ; bouton de test ; désactivation. Sur iPhone, seulement si l'application est installée (message explicatif sinon). À la déconnexion : l'appareil est retiré du serveur et les caches de l'application sont vidés.
- **Accrochage serveur** : `notify()` (`src/server/live/helpers.ts`) est le point central (24 appels). Il consigne les notifications créées ; **après la fin de l'appel ou de la tâche planifiée**, l'envoi relit ces notifications dans la base (une transaction annulée n'envoie donc rien), ignore les utilisateurs suspendus et les instances suspendues, puis envoie sans jamais lever d'erreur vers l'appelant.
- **Contenu** : titre et phrase fixes par type (tableau ci-dessous), lien interne ouvert au clic (jamais un lien externe), regroupement par notification. Aucun nom, titre de demande ni extrait de message.

| Type | Titre affiché |
|---|---|
| REQUEST_SUBMITTED | Nouvelle demande |
| REQUEST_ASSIGNED / REASSIGNMENT | Demande affectée |
| NEW_MESSAGE | Nouveau message |
| CLARIFICATION_REQUESTED | Précisions demandées |
| COACH_RESPONSE | Réponse de votre coach |
| REQUEST_CLOSED / REQUEST_REOPENED | Demande clôturée / réouverte |
| RATING_AVAILABLE / RATING_RECEIVED | Évaluation |
| DEADLINE_REMINDER | Échéance proche |
| REQUEST_OVERDUE / ESCALATION | Demande en retard |
| COACH_UNAVAILABLE / NOTIFICATION_FAILURE / ACCOUNT | Information de la plateforme |

Corps commun : « Ouvrez {nom de la plateforme} pour les détails. » (Les libellés exacts sont à ajuster par le constructeur, en gardant la règle : le type seulement.)

### 4. Déploiement et documentation
- Variables `VAPID_*` ajoutées aux deux fichiers compose et au guide Coolify (génération, conservation, rôle de `SOURCE_COMMIT`). Chaque instance a sa paire de clés.
- Aucune tâche planifiée Coolify nécessaire : le planificateur intégré à l'application envoie les rappels d'échéance.

## Vérification attendue

- Tests : texte du push par type (aucun contenu privé), enregistrement/remplacement/purge des abonnements, envoi après validation et absence d'envoi après annulation, instance suspendue, clés absentes ; sur base jetable, comme les tests existants.
- Navigateur (build de production) : manifeste valide, enregistrement du worker, détection d'une nouvelle version après un second build, installation.
- **À valider sur un vrai téléphone** après déploiement : réception d'un push (Android, puis iPhone installé), affichage de l'écran verrouillé.

## Laissé au constructeur

Emplacement exact des composants et des tables, libellés définitifs, génération des icônes, choix du dispositif qui consigne les notifications par appel (par exemple un stockage lié à l'appel), et détail des tests.

## Mes choix (à confirmer à la relecture)

- Pas de catégories de push : un interrupteur par appareil, tous les types (koti propose trois catégories ; peut suivre).
- Nom de l'application du manifeste tiré des paramètres de l'instance plutôt que fixe.
- Pas de PWA en démonstration.
- `SOURCE_COMMIT` transmis explicitement par les compose, en plus du `Dockerfile`.
