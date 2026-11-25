# Mentora — vitrine, tableau de bord opérateur et passerelle vers les instances clientes

Date : 24 novembre 2026. Statut : à approuver.

## 1. Intention et pourquoi

Mentora est aujourd'hui une application d'accompagnement individuel (demandes, échanges, délais, droits, rapports) déployée pour un seul client. Le propriétaire veut en faire un **SaaS vendu à des coachs indépendants, formateurs et mentors**, principalement en **Afrique francophone**, en **français**, avec trois formules (**Solo, Pro, Équipe**) et **un mois d'essai gratuit**.

Ce document couvre ce qui manque pour vendre et exploiter ce SaaS : une **vitrine publique référencée** (Google), un **tableau de bord de l'opérateur** (le propriétaire, seul utilisateur) et le **minimum à ajouter dans l'application Mentora** pour que ce tableau de bord puisse la superviser.

Le propriétaire veut savoir, d'un coup d'œil : qui sont ses clients, quelle formule ils ont, si leur espace fonctionne, s'ils l'utilisent, quand ils doivent payer, et qui demande un essai.

## 2. Décisions du propriétaire (reprises telles quelles)

- Nom : **Mentora**. Slogan : « L'accompagnement individuel, enfin structuré. » Sous-titre : « Centralisez les demandes, suivez les échanges et pilotez la qualité de votre accompagnement. » Promesses d'accroche : « Demandes centralisées », « Suivi des délais ».
- Cible : coachs indépendants. Marché : Afrique francophone. Langue : français uniquement, prix en FCFA.
- **Une instance par client** : chaque client a sa propre copie de l'application Mentora et sa propre base de données, à une adresse de la forme `client.<domaine>` sur le domaine du propriétaire. La création d'une instance reste **manuelle**.
- Un seul serveur PostgreSQL partagé entre les instances (une base et un utilisateur par client) et une image Docker commune (décision d'infrastructure du propriétaire, à documenter).
- Formules : **Solo, Pro, Équipe**, **1 mois d'essai gratuit**, le reste **paramétrable** (nom, prix, mensuel/annuel, limites, durée d'essai). Le propriétaire m'a laissé le choix de l'axe de facturation (voir §5).
- **Vitrine et tableau de bord dans une seule application**, dans un dossier `site/` du dépôt actuel.
- **Style** : identique à l'application Mentora (bleu marine, or, même ton sobre et rassurant). Maquette « A » retenue.
- Tableau de bord : « manuel » côté saisie commerciale, **automatique** côté état technique et usage ; compteurs d'usage **validés**, sans jamais exposer le contenu des échanges.

## 3. Objectifs, non-objectifs, anti-objectifs

**Objectifs**
1. Une vitrine rapide, indexable, qui explique le produit et mène à une **demande d'essai**.
2. Un tableau de bord protégé : clients, formules, prospects, paiements saisis, état technique, usage, alertes.
3. Les points d'accès nécessaires dans Mentora : compteurs d'usage, suspension réversible, version.
4. Une procédure écrite de mise en service d'une instance (base partagée, image commune, adresse).

**Non-objectifs (volontairement hors de cette étape)**
- Paiement en ligne et facturation automatique (le propriétaire facture à la main).
- Mise en service automatique d'instances (via l'API de Coolify) et mise à jour automatique de toutes les instances.
- Application multi-clients (espaces de travail partagés) : c'est « l'option 2 », plus tard, quand il y aura environ 15 à 20 clients.
- Anglais, blog, espace client côté site, envoi d'e-mails fiables (le SMTP n'est pas encore opérationnel pour les destinataires externes : le tableau de bord est la seule voie de notification).

**Anti-objectifs (un échec même si « ça marche »)**
- L'opérateur voit des noms de membres, des messages ou des pièces jointes d'un client.
- Un prix publié qui n'a pas été saisi par le propriétaire.
- Le tableau de bord indexé par Google ou accessible sans double authentification.
- Une vitrine lente ou illisible sur téléphone (cible principale : réseaux mobiles, écrans de petite taille).

## 4. Contraintes

- Même technologie que l'application : Next.js 15 (App Router), React 19, TypeScript strict (`noUncheckedIndexedAccess`), Tailwind 4, Drizzle, PostgreSQL, BetterAuth, Zod. Réutiliser les jetons de design et la logique de l'application, sans créer de dépendance de code entre `site/` et `src/` (deux projets indépendants avec chacun son `package.json`, copier ce qui est partagé).
- Déploiement par **Coolify** auto-hébergé : image Docker, migrations appliquées au démarrage (même schéma que l'application : `docker-entrypoint.sh` + script de migration), base PostgreSQL indépendante via `DATABASE_URL`. **Un seul déploiement** pour `site/`, avec deux domaines pointés sur le même conteneur.
- Les identifiants de connexion vers les instances (clés) ne doivent jamais apparaître dans les journaux ni dans le navigateur.
- Interface en français, accents corrects. Responsive, accessibilité de base (contrastes, focus, libellés).
- Les caractères spéciaux de mots de passe dans les URL de base de données doivent être encodés (déjà documenté pour Mentora).

## 5. Approches envisagées

| | A. Une seule application `site/` | B. Deux applications | C. Vitrine Astro + tableau de bord Next.js |
|---|---|---|---|
| Déploiements | 1 | 2 | 2 |
| Sécurité | surface mixte, à cloisonner | meilleure isolation | idem B |
| Coût de maintenance | faible | moyen | plus élevé (deux outils) |
| SEO | bon (pages générées) | bon | très bon |

**Choix du propriétaire : A.** Raisons : propriétaire seul à exploiter, un seul build, style partagé. Le cloisonnement se fait par le nom d'hôte (§6.1).

**Axe de facturation (mon choix, modifiable car paramétrable)** : par formule, avec une limite de **coachs** et de **membres actifs**, facturation **mensuelle ou annuelle** (réduction annuelle en pourcentage, paramétrable). Les limites informent et alertent ; elles ne bloquent pas techniquement l'instance à cette étape.

## 6. Conception

### 6.1 Application `site/`

- **Routage par hôte** : l'hôte public (variable `SITE_URL`) ne sert que les pages publiques ; l'hôte d'administration (variable `ADMIN_HOST`, ex. `admin.mentora.app`) ne sert que `/admin` et l'API associée ; un hôte inconnu reçoit une 404. Un middleware applique la règle avant tout rendu. Les pages d'administration envoient `X-Robots-Tag: noindex, nofollow` et `robots.txt` les exclut.
- **Pages publiques** : Accueil, Fonctionnalités, Pour qui (coachs, formateurs, entrepreneurs), Tarifs, Questions fréquentes, Demander un essai, Mentions légales, Conditions d'utilisation, Politique de confidentialité.
- **Contenu de l'accueil** (ordre) : en-tête avec navigation et bouton « Essai gratuit » ; hero (slogan, sous-titre, deux boutons « Demander un essai gratuit » / « Voir les fonctionnalités », deux pastilles « Demandes centralisées » et « Suivi des délais ») ; bandeau de bénéfices ; « Comment ça marche » en trois étapes ; « Pour qui » ; extrait des tarifs ; FAQ ; formulaire d'essai.
- **Tarifs** : lus dans la base, **uniquement les formules publiées**. S'il n'y en a aucune, la page affiche « Demandez un essai » sans prix. Toute modification d'une formule invalide le cache de la page.
- **Formulaire d'essai** : nom, e-mail, téléphone (facultatif), activité ou domaine, message (facultatif), case de consentement obligatoire. Protection : champ piège (honeypot), limitation de débit par adresse IP, validation Zod. Enregistré comme **prospect**. Pas d'e-mail de notification (voir non-objectifs).

### 6.2 SEO

- Un `<title>`, une description, une URL canonique et des balises Open Graph/Twitter propres à chaque page ; un plan du site (`sitemap.xml`) et `robots.txt`.
- Données structurées JSON-LD : `Organization`, `SoftwareApplication` (avec `offers` issus des formules publiées, uniquement s'il y en a), `FAQPage`.
- Pages générées à l'avance (statiques) avec régénération sur modification des formules ; HTML sémantique (un seul `h1` par page), `lang="fr"`, polices auto-hébergées (`next/font`), images optimisées, aucun script tiers bloquant. Objectif : bons scores Core Web Vitals sur mobile.
- Mots-clés visés (français) : logiciel de coaching, plateforme d'accompagnement individuel, suivi des demandes de coaching, outil pour coach indépendant, formateur, en Afrique francophone. La rédaction exacte relève du constructeur (§9).

### 6.3 Authentification de l'opérateur

BetterAuth, **un seul compte administrateur**, sans inscription publique : le premier compte est créé par une procédure de démarrage protégée (variable d'environnement ou commande), pas par une page ouverte. Mot de passe + **code temporaire (TOTP)** obligatoire. Verrouillage après échecs répétés, session courte, cookies sécurisés. Toute action de l'opérateur est écrite dans un journal d'audit.

### 6.4 Modèle de données (base propre à `site/`)

- `plan` : nom, identifiant court, description, prix mensuel et annuel en FCFA, limites (coachs, membres actifs), durée d'essai (30 par défaut), liste d'avantages, ordre, mise en avant, **publié**.
- `client` : nom, contact (nom, e-mail, téléphone), adresse de l'instance, formule, période de facturation, statut (`ESSAI`, `ACTIF`, `IMPAYE`, `SUSPENDU`, `RESILIE`), fin d'essai, prochaine échéance, clé d'accès à l'instance **chiffrée** (clé maître en variable d'environnement), notes.
- `payment` : client, date, montant FCFA, mode, période couverte, note. Saisi à la main.
- `prospect` : coordonnées, domaine, message, consentement, statut (`NOUVEAU`, `CONTACTE`, `CONVERTI`, `PERDU`), date, lien vers le client créé.
- `health_check` : client, date, succès, latence, code HTTP, version. Purge après 30 jours.
- `usage_snapshot` : client, date, compteurs (§6.5). Un relevé par jour conservé 400 jours.
- `audit_log` : action, cible, date.

### 6.5 Contrat avec l'application Mentora (dossier `src/`)

Nouvelle variable `OPS_API_KEY` (absente = points d'accès désactivés, réponse 404). Chaque instance a sa propre clé. Comparaison à temps constant, limitation de débit, aucun contenu dans les journaux.

- `GET /api/ops/usage`, en-tête `Authorization: Bearer <clé>`. Réponse JSON : `version` (variable `APP_VERSION`, sinon la version du `package.json`), `generated_at`, `suspended`, `coaches_active`, `members_active`, `requests_this_month` (mois civil, fuseau de l'application), `requests_overdue` (demandes ouvertes dont l'échéance de première réponse est dépassée, selon le même calcul que les rapports), `last_activity_at` (dernière connexion réussie ou dernier message). **Compteurs uniquement.**
- `POST /api/ops/suspension`, même authentification, corps `{ "suspended": boolean, "message": string|null }`. Enregistré dans `app_settings` (migration). Instance suspendue : l'écran de connexion et tout appel authentifié affichent le message (code `SERVICE_SUSPENDED`), aucune donnée n'est supprimée, la levée est immédiate. `/api/health` reste en 200 pour distinguer « suspendue » de « en panne ».
- Le tableau de bord appelle l'état technique (`/api/health`) et l'usage toutes les 5 minutes (health) et une fois par jour (relevé d'usage), via une tâche planifiée dans `site/` (même principe que `instrumentation.ts` de Mentora, une seule instance de `site/`).

### 6.6 Tableau de bord (hôte d'administration)

- **Accueil** : alertes calculées — instance hors ligne depuis plus de 15 minutes, essai finissant sous 7 jours, échéance dépassée, nouvelle demande d'essai, instance proche d'une limite de sa formule, aucune activité depuis 14 jours.
- **Clients** : liste (nom, adresse, formule, statut, état en ligne, prochaine échéance) et fiche (informations, historique des paiements, derniers contrôles, graphique d'usage simple, actions : changer de formule, saisir un paiement, suspendre/réactiver, tester la connexion, notes).
- **Prospects** : liste, changement de statut, bouton « Convertir en client » (pré-remplit la fiche).
- **Formules** : création, modification, publication, ordre.
- **Journal** : actions de l'opérateur.
- Aucune vue ne montre de contenu d'échange (le contrat §6.5 ne le permet pas).

### 6.7 Mise en service d'une instance (documentation)

Document `docs/MISE_EN_SERVICE_CLIENT.md` : créer la base et l'utilisateur sur le PostgreSQL partagé (script SQL fourni), dupliquer le modèle Coolify (image commune, `DATABASE_URL`, `APP_URL`, `AUTH_SECRET`, `OPS_API_KEY`), domaine `client.<domaine>`, création de l'administrateur du client, enregistrement de l'instance et de sa clé dans le tableau de bord, vérification de l'état et de l'usage. Sauvegarde : un script unique qui exporte toutes les bases du serveur partagé.

## 7. Ordre de réalisation

1. `site/` : socle, style, vitrine complète, formules en base, formulaire d'essai, SEO, déploiement Coolify.
2. Tableau de bord : authentification + double authentification, formules, prospects, clients (saisie), paiements.
3. Mentora : points d'accès `ops`, suspension, version ; tableau de bord : contrôles de santé, relevés d'usage, alertes.
4. Documentation de mise en service, script de sauvegarde, vérification de bout en bout avec deux instances de test.

## 8. Vérification

- Tests unitaires des règles (alertes, calculs d'échéance, validation, chiffrement des clés) et tests d'accès : un hôte public ne sert jamais `/admin`, l'hôte d'administration ne sert jamais les pages publiques, `/api/ops/*` refuse toute requête sans la bonne clé.
- Test de non-fuite : les réponses `/api/ops/usage` ne contiennent que les champs du contrat.
- Parcours de bout en bout dans un navigateur : essai demandé sur la vitrine → prospect visible → converti en client → instance enregistrée → état et usage affichés → suspension → message visible sur l'instance → réactivation.
- Audit SEO : balises, plan du site, données structurées valides, performances mobiles mesurées.

## 9. Laissé au constructeur

La rédaction complète des textes de la vitrine (dans le ton de l'application et à partir du slogan, du sous-titre et des promesses ci-dessus), les icônes et illustrations, la disposition exacte des pages, le choix de la bibliothèque de graphiques (ou un graphique léger sans dépendance), le détail du chiffrement des clés, la forme exacte des tables et des migrations, la liste précise des avantages par formule (à partir des limites paramétrables, sans prix).

## 10. À fournir par le propriétaire avant la mise en production

Le nom de domaine, la raison sociale et les coordonnées légales (mentions légales, conditions, confidentialité), les prix et limites des trois formules (saisis dans le tableau de bord, jamais en dur), l'adresse e-mail de contact.

## 11. Choix faits par l'auteur de ce document (à vérifier)

- Axe de facturation : formule + limite de coachs et de membres actifs, mensuel/annuel avec réduction annuelle paramétrable ; limites non bloquantes.
- Pas d'e-mail de notification des prospects ni des alertes pour l'instant.
- Périodicité : santé toutes les 5 minutes, usage une fois par jour, seuils d'alerte (15 min, 7 jours, 14 jours).
- Un compte opérateur unique avec TOTP ; clé d'instance par instance, chiffrée en base.
- Dossier `site/` indépendant, sans code partagé avec `src/` ; routage par nom d'hôte.
- Instance suspendue : toute l'application est bloquée (y compris l'administrateur du client), `/api/health` reste en 200.

## 12. Précisions issues de la relecture (choix de l'auteur, à vérifier)

1. **Accès du tableau de bord aux instances.** Par leur adresse publique en HTTPS (`https://client.<domaine>`). L'adresse saisie est **validée contre le domaine des instances** (variable `INSTANCE_DOMAIN`, accepte uniquement `*.INSTANCE_DOMAIN`), sans redirection suivie, avec délai d'attente court, pour fermer la porte aux requêtes vers des adresses internes (SSRF). La clé d'une instance est **générée par le tableau de bord** (32 octets aléatoires), affichée **une seule fois** pour que l'opérateur la copie dans la variable `OPS_API_KEY` de l'instance, puis conservée chiffrée.
2. **Base de `site/`.** Une base dédiée (`mentora_site`) sur le serveur PostgreSQL partagé, avec son propre utilisateur, **incluse dans le même script de sauvegarde** que les bases des clients (elle contient les paiements et les clés chiffrées). Migrations appliquées au démarrage du conteneur `site/`, comme pour Mentora.
3. **Limites et alertes.** Une limite vide signifie « illimité » (typique pour Équipe). Alerte « proche d'une limite » à **90 %**. « Membre actif » reprend la définition de Mentora : utilisateur de rôle membre au statut actif.
4. **Statuts et échéances.** Les statuts du client sont **modifiés à la main** par l'opérateur ; le tableau de bord ne les change pas seul, il **alerte** (essai terminé, échéance dépassée). Saisir un paiement avance la prochaine échéance d'une période (mensuelle ou annuelle) à partir de la plus tardive entre l'échéance en cours et la date de paiement. La réduction annuelle ne change que le prix affiché et le montant proposé à la saisie.
5. **Double authentification.** Premier administrateur créé par une commande (`npm run create-admin`) ; au premier accès, l'inscription du code temporaire est **obligatoire** (QR code), avec **10 codes de secours** affichés une fois. Perte de l'appareil : réinitialisation par la même commande, exécutée sur le serveur. Les domaines sont supposés être deux sous-domaines (ou le domaine racine et un sous-domaine) ; les cookies sont limités à l'hôte d'administration et `baseURL`/`trustedOrigins` de BetterAuth ne contiennent que cet hôte.
6. **Une seule instance de `site/`.** Limitation de débit des connexions dans la base (comportement par défaut de BetterAuth) et du formulaire d'essai en mémoire (acceptable). Le relevé d'usage quotidien est protégé contre les doublons par une unicité (client, jour) ; un relevé manqué après un redémarrage est rattrapé au contrôle suivant.
7. **Suspension dans Mentora.** Les sessions ouvertes sont invalidées ; toute connexion et tout appel authentifié reçoivent le message de suspension ; les tâches planifiées de l'instance **n'envoient plus de rappels ni d'e-mails** tant qu'elle est suspendue ; les données, elles, ne sont ni modifiées ni supprimées. L'état de santé reste en 200.
8. **Pages statiques et base de données.** Aucune base n'est requise à la compilation : les pages sans données (accueil, fonctionnalités, FAQ, pages légales) sont générées à la compilation ; la page Tarifs et les données structurées de l'offre sont générées à la première requête puis régénérées à la demande quand une formule change.
