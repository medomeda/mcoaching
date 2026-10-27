# PRD — Plateforme de gestion du coaching individuel BRVM

**Version :** 1.0  
**Date :** 26 octobre 2026  
**Statut :** Document de référence pour le développement du MVP  
**Type de produit :** Application web responsive  
**Public cible :** Administrateurs, coachs en investissement et apprenants d’une communauté d’investissement sur la BRVM  
**Méthode de développement :** Développement assisté par IA de vibecoding  
**Langue de l’interface :** Français  
**Fuseau horaire de référence :** Africa/Abidjan (UTC+0)

---

# 1. Instructions générales à l’IA de développement

Tu es un ingénieur logiciel senior, architecte applicatif, expert UX/UI et développeur full-stack.

Ta mission est de concevoir et de développer une application web complète, fonctionnelle, sécurisée et responsive permettant de gérer le coaching individuel asynchrone d’une communauté d’investissement sur la Bourse Régionale des Valeurs Mobilières (BRVM).

Tu dois respecter strictement les exigences fonctionnelles et les règles métier décrites dans ce document.

## 1.1 Principes de développement

- Développer une véritable application fonctionnelle, et non une simple maquette.
- Utiliser une architecture modulaire, claire, maintenable et adaptée à un MVP.
- Centraliser les règles métier critiques côté serveur.
- Utiliser une véritable base de données persistante.
- Mettre en place une authentification sécurisée et une gestion stricte des autorisations.
- Assurer la traçabilité des opérations importantes.
- Ne jamais utiliser des données fictives comme source de vérité en production.
- Ne pas laisser de boutons sans action réelle.
- Ne pas simuler des fonctionnalités non implémentées.
- Prévoir les états de chargement, les erreurs, les listes vides et les confirmations d’action.
- Garantir la cohérence des données même en cas de requêtes simultanées.
- Préserver l’historique des demandes, des messages et des affectations.
- Écrire du code typé, documenté lorsque nécessaire et couvert par des tests.
- Privilégier une interface simple, rapide à comprendre et agréable à utiliser.

## 1.2 Méthode d’exécution

Procède dans cet ordre :

1. Analyser le présent PRD et identifier les dépendances techniques.
2. Proposer l’architecture du projet et le schéma de données.
3. Mettre en place le socle technique et l’authentification.
4. Développer les modules métier dans l’ordre défini par le présent document.
5. Ajouter les notifications, les échéances et les mécanismes de supervision.
6. Exécuter les tests fonctionnels, de sécurité et de cohérence.
7. Corriger les anomalies avant de déclarer une fonctionnalité terminée.
8. Fournir les instructions d’installation, de configuration et de déploiement.

Ne cherche pas à tout développer en une seule génération de code. Travaille par modules cohérents et vérifie le fonctionnement de chaque module avant de poursuivre.

Si une décision mineure n’est pas précisée, adopte la solution la plus simple, sécurisée et cohérente avec ce PRD. Si une décision affecte une règle métier essentielle, signale-la et propose une configuration plutôt que d’inventer silencieusement une règle.

---

# 2. Présentation du produit

## 2.1 Contexte

Une communauté accompagne ses membres dans leur apprentissage et leurs décisions d’investissement sur la BRVM.

Les membres participent à des séances collectives via des outils comme Telegram ou Zoom. En complément, ils peuvent solliciter un accompagnement individuel auprès de coachs.

Aujourd’hui, ces échanges individuels se déroulent principalement dans des conversations privées sur des applications de messagerie. Ce fonctionnement entraîne plusieurs difficultés :

- Les demandes sont dispersées dans plusieurs conversations.
- Les demandes en attente sont difficiles à identifier.
- Les délais de réponse sont peu maîtrisés.
- Les coachs ont du mal à prioriser leurs demandes.
- L’administrateur manque de visibilité sur la charge et les performances.
- L’historique de l’accompagnement est difficile à centraliser.
- Les droits d’accès au coaching et les éventuels quotas sont difficiles à contrôler.
- Les indicateurs de satisfaction et de qualité de service sont insuffisants.

## 2.2 Solution proposée

Créer une plateforme web centralisée permettant à chaque apprenant de soumettre une demande de coaching individuel, d’échanger avec son coach dans un espace privé, de suivre l’évolution de sa demande et de retrouver son historique.

L’administrateur doit pouvoir gérer les apprenants, les coachs, les droits au coaching, les affectations et les délais de traitement.

Le coach doit pouvoir organiser son activité, répondre aux demandes et suivre les apprenants qui lui sont affectés.

La plateforme doit permettre de contrôler la qualité du service sans imposer aux utilisateurs de changer leurs habitudes de manière brutale.

## 2.3 Proposition de valeur

La plateforme doit garantir trois résultats essentiels :

1. Chaque demande est attribuée à un responsable identifiable.
2. Chaque échéance de réponse est calculable et vérifiable.
3. Chaque échange et chaque action importante sont traçables.

---

# 3. Objectifs du MVP

## 3.1 Objectifs principaux

- Centraliser toutes les demandes de coaching individuel.
- Faciliter les échanges entre apprenants et coachs.
- Permettre à l’administrateur d’affecter manuellement les coachs.
- Gérer manuellement les droits d’accès au coaching.
- Contrôler les quotas lorsqu’ils sont activés.
- Calculer les délais de première réponse en heures ouvrées.
- Identifier automatiquement les demandes en retard.
- Envoyer des notifications dans l’application et par e-mail.
- Conserver l’historique complet des demandes et des échanges.
- Mesurer la charge des coachs, les délais et la satisfaction des apprenants.

## 3.2 Indicateurs de réussite du MVP

Le MVP sera considéré comme opérationnel lorsque les indicateurs suivants pourront être calculés :

- Nombre de demandes reçues.
- Nombre de demandes ouvertes.
- Nombre de demandes en retard.
- Pourcentage de demandes ayant reçu une première réponse dans le délai cible.
- Délai moyen de première réponse en heures ouvrées.
- Durée moyenne de résolution, distincte du temps d’attente de l’apprenant.
- Nombre de demandes par coach.
- Nombre de demandes réouvertes.
- Note moyenne de satisfaction.
- Taux de demandes ayant reçu une évaluation.
- Taux d’utilisation des quotas, lorsque ceux-ci sont activés.

Les objectifs chiffrés de performance commerciale ou de satisfaction seront définis ultérieurement. Le MVP doit d’abord rendre ces indicateurs mesurables.

---

# 4. Périmètre fonctionnel

## 4.1 Fonctionnalités incluses

Le MVP comprend :

1. Authentification et gestion des comptes.
2. Gestion des rôles et des permissions.
3. Tableau de bord administrateur.
4. Tableau de bord coach.
5. Espace personnel apprenant.
6. Gestion des affectations coach-apprenant.
7. Gestion des droits et quotas de coaching.
8. Gestion de la disponibilité et des absences des coachs.
9. Création et suivi des demandes.
10. Messagerie interne par demande.
11. Gestion des pièces jointes.
12. Calcul des échéances en heures ouvrées.
13. Gestion des retards et des escalades.
14. Notifications dans l’application et par e-mail.
15. Historique des statuts et des affectations.
16. Réouverture exceptionnelle par l’administrateur.
17. Évaluation des demandes clôturées.
18. Rapports et indicateurs.
19. Journal d’audit.
20. Gestion des paramètres de service.
21. Gestion des erreurs, tests et sécurisation.

## 4.2 Fonctionnalités exclues du MVP

Ne pas développer dans cette première version :

- Paiement en ligne et facturation automatisée.
- Intégration directe avec WhatsApp ou Telegram.
- Appels audio ou vidéo intégrés.
- Gestion des séances collectives.
- Application mobile native.
- Recommandations d’investissement générées par IA.
- Connexion aux comptes-titres des membres.
- Analyse automatisée de portefeuille.
- Connexion à une API boursière pour fournir des cours en temps réel.
- Place de marché permettant de choisir librement un coach.
- Affectation automatique des coachs.
- Gestion comptable des coachs.
- Publication publique des évaluations.
- Fonctionnalités complexes de visioconférence ou de calendrier partagé.

Ces fonctionnalités pourront faire l’objet de versions ultérieures.

---

# 5. Utilisateurs et rôles

La plateforme possède trois rôles métier.

## 5.1 Administrateur

L’administrateur est responsable du fonctionnement de la plateforme.

Il peut :

- Créer, consulter, modifier, activer et suspendre des comptes.
- Définir le rôle d’un utilisateur.
- Gérer les profils des coachs.
- Affecter manuellement les coachs aux apprenants.
- Modifier ou révoquer une affectation.
- Accorder, suspendre ou retirer un droit au coaching.
- Définir un quota individuel facultatif.
- Consulter toutes les demandes.
- Consulter les échanges nécessaires à la supervision, selon les règles de confidentialité.
- Identifier les demandes en attente et les demandes en retard.
- Réaffecter une demande à un autre coach.
- Réouvrir une demande clôturée, avec justification obligatoire.
- Corriger un quota en enregistrant un motif.
- Configurer le calendrier de service.
- Configurer les règles de délai et les seuils de rappel.
- Consulter les indicateurs de performance.
- Consulter les journaux d’audit et les erreurs de notification.
- Exporter les rapports autorisés.

Toute action administrative sensible doit être enregistrée dans le journal d’audit.

## 5.2 Coach

Le coach est responsable du suivi des apprenants qui lui sont affectés.

Il peut :

- Consulter les apprenants qui lui sont affectés.
- Consulter les demandes qui lui sont attribuées.
- Consulter les demandes en attente de sa réponse.
- Voir les échéances et les alertes de retard.
- Configurer ses disponibilités.
- Déclarer ses périodes d’absence.
- Répondre aux demandes.
- Demander des précisions à l’apprenant.
- Consulter l’historique de ses échanges avec l’apprenant dans le cadre des droits autorisés.
- Ajouter des notes internes privées.
- Clôturer une demande lorsque les conditions sont remplies.
- Consulter les évaluations qui lui sont accessibles selon la politique retenue.

Un coach ne peut pas :

- Modifier ses propres droits d’administration.
- Modifier les quotas d’un apprenant.
- Réouvrir une demande clôturée.
- Affecter lui-même un autre coach.
- Consulter les demandes privées d’apprenants qui ne lui sont pas attribués, sauf permission administrative explicitement accordée.
- Modifier ou supprimer silencieusement l’historique des messages.

## 5.3 Apprenant

L’apprenant est le bénéficiaire du coaching.

Il peut :

- Se connecter à son espace personnel.
- Consulter le coach qui lui est attribué.
- Consulter son droit au coaching et son quota éventuel.
- Créer une nouvelle demande si ses droits le permettent.
- Définir un sujet, une catégorie et une description.
- Joindre des fichiers autorisés.
- Consulter ses demandes et leurs statuts.
- Échanger avec son coach dans chaque demande.
- Répondre aux demandes de précisions.
- Consulter l’historique de ses demandes.
- Être informé des nouvelles réponses.
- Clôturer une demande uniquement si les règles de clôture le permettent.
- Évaluer une demande clôturée.

Un apprenant ne peut pas :

- Consulter les demandes d’un autre apprenant.
- Modifier le coach affecté à sa demande.
- Réouvrir une demande clôturée.
- Modifier son quota.
- Accéder aux notes internes du coach.
- Consulter les données de supervision réservées à l’administrateur.

---

# 6. Parcours utilisateurs

## 6.1 Parcours d’un nouvel apprenant

1. L’administrateur crée son compte ou lui donne accès à un compte précréé.
2. L’apprenant reçoit un e-mail d’activation ou une procédure sécurisée de définition de mot de passe.
3. Il se connecte à la plateforme.
4. Il consulte son tableau de bord.
5. Il voit son coach affecté et son droit au coaching.
6. Si son droit est actif et qu’il dispose du quota requis, il peut créer une demande.
7. Il reçoit une confirmation de soumission.
8. Il suit les échanges et les notifications jusqu’à la clôture.

Si aucun coach ne lui est affecté ou si son droit est suspendu, il doit voir un message explicatif et ne doit pas pouvoir soumettre une demande.

## 6.2 Parcours de création d’une demande

1. L’apprenant clique sur « Nouvelle demande ».
2. Il sélectionne une catégorie.
3. Il saisit un sujet.
4. Il décrit sa question ou sa difficulté.
5. Il joint éventuellement un ou plusieurs fichiers autorisés.
6. Il vérifie le récapitulatif.
7. Il soumet sa demande.
8. Le serveur vérifie ses droits, son quota, son compte et son affectation.
9. La demande est enregistrée de manière atomique.
10. Le quota est consommé si un quota est activé.
11. La date de soumission et l’échéance sont enregistrées.
12. L’apprenant reçoit une confirmation.
13. Le coach reçoit une notification.
14. La demande apparaît dans les files de traitement.

Un brouillon non soumis ne consomme aucun quota et ne déclenche aucun délai de réponse.

## 6.3 Parcours du coach

1. Le coach se connecte.
2. Il consulte son tableau de bord.
3. Il visualise ses demandes en attente, ses demandes en retard et ses échéances proches.
4. Il ouvre une demande.
5. Il consulte son historique et les pièces jointes autorisées.
6. Il répond ou demande des précisions.
7. L’apprenant reçoit une notification.
8. Le coach poursuit l’échange.
9. Lorsque la demande est résolue, il propose ou effectue la clôture selon les règles configurées.

## 6.4 Parcours de supervision administrative

1. L’administrateur ouvre le tableau de bord.
2. Il identifie les demandes ouvertes et les retards.
3. Il filtre les demandes par coach, apprenant, statut, période et priorité.
4. Il ouvre une demande pour examiner son historique.
5. Il peut contacter le coach ou réaffecter la demande.
6. Toute réaffectation est enregistrée.
7. Les délais restent traçables et ne sont pas modifiés silencieusement.

---

# 7. Règles métier fondamentales

## 7.1 Affectation des coachs

- L’affectation est manuelle et réalisée par l’administrateur.
- Un apprenant peut avoir au maximum un coach principal actif à la fois.
- Un coach peut suivre plusieurs apprenants.
- Les affectations passées doivent être conservées.
- Une demande conserve une référence vers le coach qui lui est attribué.
- La réaffectation d’une demande ouverte est une action explicite.
- La réaffectation ne doit pas effacer les échanges précédents.
- L’ancien coach ne doit plus pouvoir répondre après la prise d’effet de la réaffectation, sauf permission administrative spécifique.
- L’historique doit indiquer l’ancien coach, le nouveau coach, l’auteur de l’action, la date et le motif.
- Si un coach est suspendu ou absent, l’administrateur doit être alerté si des demandes nécessitent une action.
- L’absence d’un coach ne modifie pas automatiquement les échéances existantes.

## 7.2 Droits au coaching

Le droit au coaching est administré manuellement.

Un droit doit contenir au minimum :

- L’apprenant concerné.
- Le statut : actif, suspendu ou expiré.
- La date de début.
- La date de fin facultative.
- L’indication qu’un quota est activé ou non.
- Le nombre total d’unités autorisées si un quota est activé.
- Le nombre d’unités consommées et restantes, calculé à partir du registre.
- La date de création.
- L’administrateur responsable de la création ou de la dernière modification.

### Règles

- Un droit suspendu ou expiré interdit la création de nouvelles demandes.
- Les demandes déjà ouvertes restent consultables et peuvent continuer à être traitées.
- Si aucun quota n’est activé, la soumission n’est pas bloquée par une limite de nombre de demandes.
- Si un quota est activé, une demande valide consomme une unité au moment de sa soumission réussie.
- Un brouillon ne consomme aucune unité.
- Un double clic ou une répétition de requête ne doit pas consommer deux unités pour une seule demande.
- Les soumissions concurrentes doivent respecter le quota disponible.
- Toute correction de quota doit être enregistrée avec un motif et un auteur.
- Une annulation ne rembourse pas automatiquement le quota.
- Un remboursement ou une correction exceptionnelle nécessite une action administrative tracée.
- Le registre des mouvements de quota est conservé ; il ne doit pas être remplacé par une simple modification non traçable d’un compteur.

## 7.3 Calcul des délais

Le délai cible initial de première réponse humaine est de **24 heures ouvrées**.

Le calcul doit utiliser un calendrier de service configurable.

Configuration initiale proposée, à valider avant la mise en production :

- Fuseau horaire : `Africa/Abidjan`.
- Jours ouvrés : lundi à vendredi.
- Horaires : 08 h 00 à 12 h 00 et 13 h 00 à 17 h 00.
- Pause exclue : 12 h 00 à 13 h 00.
- Week-ends exclus.
- Jours fériés exclus selon un calendrier administrable.
- Délai cible initial : 24 heures ouvrées.

Ces paramètres doivent être modifiables par l’administrateur autorisé.

### Règles de calcul

- Le délai démarre à la soumission effective de la demande.
- Si la demande est soumise hors des heures de service, le calcul commence à la prochaine ouverture.
- Les heures non ouvrées ne sont pas comptabilisées.
- Les jours fériés configurés ne sont pas comptabilisés.
- La date d’échéance est enregistrée et consultable.
- Le système doit calculer le temps ouvré écoulé depuis la soumission.
- Le calcul doit être centralisé dans un service métier testé.
- Les calculs doivent prendre en compte les périodes de fermeture et les changements de calendrier.
- Une modification de calendrier ne doit pas changer silencieusement les échéances déjà enregistrées.
- Si une échéance doit être recalculée, cette opération doit être explicite, documentée et auditée.

La première réponse correspond à une réponse humaine pertinente du coach. Une confirmation automatique de réception ne compte pas comme première réponse.

Une demande de précisions envoyée par le coach constitue une réponse humaine et renseigne la première réponse si celle-ci n’a pas encore été enregistrée.

### Exemples indicatifs

Avec le calendrier proposé et sans jours fériés :

- Une demande soumise le lundi à 09 h 00 atteint son échéance le jeudi à 09 h 00.
- Une demande soumise le vendredi à 16 h 00 atteint son échéance le mercredi suivant à 16 h 00.
- Une demande soumise le samedi à 10 h 00 commence à accumuler son délai le lundi à 08 h 00.

Ces exemples doivent être vérifiés par des tests automatisés du calculateur d’heures ouvrées.

## 7.4 Rappels et escalades

Prévoir les paramètres suivants, modifiables par un administrateur :

- À 50 % du délai écoulé : rappel au coach.
- À 75 % du délai écoulé : second rappel au coach.
- À l’échéance : marquage de retard et alerte au coach.
- Après 8 heures ouvrées de retard : escalade à l’administrateur.

Ces seuils sont des valeurs initiales proposées.

Le système doit :

- Détecter les échéances approchantes.
- Détecter les demandes en retard.
- Envoyer les notifications nécessaires.
- Éviter les notifications en double pour un même événement.
- Enregistrer chaque événement de notification.
- Réessayer les e-mails en échec selon une politique de relance.
- Permettre à l’administrateur de consulter les échecs.
- Ne pas envoyer de rappel de première réponse si une première réponse humaine a déjà été enregistrée.
- Ne pas écraser le statut métier d’une demande par une valeur « en retard ».

Le retard est un indicateur calculé, distinct du statut de la demande.

## 7.5 Priorité

Chaque demande possède une priorité :

- Normale.
- Élevée.
- Urgente.

La priorité sert à faciliter le tri et la supervision.

Dans le MVP, la priorité ne modifie pas automatiquement le délai cible de 24 heures ouvrées. Si une politique différente est adoptée ultérieurement, elle devra être explicitement configurée et testée.

## 7.6 Clôture et réouverture

- Une demande peut être clôturée lorsque le coaching est considéré comme terminé.
- La clôture enregistre la date, l’auteur et le cycle concerné.
- Une demande clôturée reste consultable.
- Un apprenant ne peut pas réouvrir une demande clôturée.
- Un coach ne peut pas réouvrir une demande clôturée.
- Seul l’administrateur peut réouvrir une demande clôturée.
- La réouverture exige un motif.
- La réouverture ne supprime pas les anciens messages, les clôtures précédentes ni les évaluations.
- Chaque réouverture crée un nouveau cycle de traitement.
- Chaque cycle possède son propre historique de statut, sa période de traitement et ses données de réponse.
- Les statistiques doivent distinguer les différents cycles.

## 7.7 Évaluation

Après la clôture, l’apprenant peut évaluer son accompagnement.

- Note de 1 à 5.
- Commentaire facultatif.
- Une évaluation par demande et par cycle de clôture.
- L’évaluation est liée à la demande, au coach évalué et au cycle concerné.
- Une évaluation précédente reste conservée en cas de réouverture.
- Les évaluations ne sont pas publiques dans le MVP.
- L’accès aux résultats est réservé aux utilisateurs autorisés.

---

# 8. Statuts et cycle de vie des demandes

## 8.1 Statuts

Les statuts métier sont :

- `DRAFT` : brouillon.
- `SUBMITTED` : demande soumise.
- `WAITING_FOR_COACH` : en attente de prise en charge ou de réponse du coach.
- `IN_PROGRESS` : demande en cours de traitement.
- `WAITING_FOR_LEARNER` : en attente d’informations de l’apprenant.
- `RESPONSE_PROVIDED` : réponse apportée, en attente de clôture.
- `CLOSED` : demande clôturée.
- `CANCELLED` : demande annulée selon les règles applicables.

L’interface affiche des libellés français compréhensibles. Les codes ci-dessus servent à la logique interne.

Le statut `OVERDUE` ne doit pas être utilisé pour remplacer le statut métier. Le retard est calculé à partir de l’échéance, de l’état de la demande et des règles de service.

## 8.2 Transitions autorisées

| Statut actuel | Action | Statut suivant |
|---|---|---|
| DRAFT | Soumettre | SUBMITTED |
| SUBMITTED | Prendre en charge | IN_PROGRESS |
| SUBMITTED | Enregistrement initial | WAITING_FOR_COACH |
| WAITING_FOR_COACH | Répondre ou prendre en charge | IN_PROGRESS |
| IN_PROGRESS | Demander des précisions | WAITING_FOR_LEARNER |
| WAITING_FOR_LEARNER | Réponse de l’apprenant | IN_PROGRESS |
| IN_PROGRESS | Apporter une réponse finale | RESPONSE_PROVIDED |
| RESPONSE_PROVIDED | Clôturer | CLOSED |
| CLOSED | Réouverture administrative motivée | Nouveau cycle |
| DRAFT | Abandonner | CANCELLED |
| SUBMITTED | Annuler selon les règles applicables | CANCELLED |

Chaque changement de statut doit être validé côté serveur et enregistré dans l’historique.

Une demande ne peut pas passer directement à un statut arbitraire à la suite d’une modification de formulaire.

## 8.3 Historique

Chaque changement doit conserver :

- L’ancien statut.
- Le nouveau statut.
- L’auteur.
- La date et l’heure.
- Le motif éventuel.
- Le cycle concerné.

Les changements de coach, les ajustements de quota et les réouvertures doivent également être tracés.

---

# 9. Modules fonctionnels

## 9.1 Module d’authentification

Fonctionnalités :

- Connexion par identifiant e-mail et mot de passe.
- Déconnexion.
- Procédure sécurisée de réinitialisation du mot de passe.
- Gestion des sessions.
- Protection des routes selon le rôle.
- Gestion des comptes actifs et suspendus.
- Procédure d’activation d’un nouveau compte.
- Messages d’erreur compréhensibles sans révéler d’informations sensibles.

Exigences :

- Les mots de passe ne sont jamais stockés en clair.
- Les secrets ne sont pas placés dans le code source.
- Les routes privées sont protégées côté serveur.
- Les permissions sont vérifiées sur chaque opération sensible.
- Masquer un bouton dans l’interface ne remplace jamais un contrôle d’autorisation serveur.

## 9.2 Module de gestion des utilisateurs

L’administrateur dispose d’une liste des utilisateurs avec :

- Nom complet.
- Adresse e-mail.
- Rôle.
- Statut du compte.
- Date de création.
- Dernière connexion, si disponible.
- Coach affecté pour les apprenants.
- Statut du droit au coaching.

Actions :

- Créer un utilisateur.
- Modifier son profil.
- Activer ou suspendre un compte.
- Consulter son historique utile à l’administration.
- Réinitialiser son accès par une procédure sécurisée.

Les suppressions physiques ne doivent pas entraîner la perte de l’historique métier. Préférer la désactivation ou l’archivage logique.

## 9.3 Module de gestion des coachs

L’administrateur peut :

- Consulter la liste des coachs.
- Consulter leur statut.
- Consulter leurs disponibilités et absences.
- Voir le nombre de demandes ouvertes.
- Voir le nombre de demandes en retard.
- Consulter les apprenants affectés.
- Suspendre un coach.
- Réaffecter les demandes nécessitant une continuité de service.

Un coach suspendu ne doit plus recevoir de nouvelles affectations normales ni répondre aux demandes dont il n’est plus responsable.

## 9.4 Module d’affectation

L’écran d’affectation doit permettre :

- De sélectionner un apprenant.
- De choisir un coach.
- De consulter l’affectation actuelle.
- De confirmer une nouvelle affectation.
- D’enregistrer un motif facultatif ou obligatoire selon la nature de l’action.
- De consulter l’historique des affectations.

Pour une réaffectation d’une demande ouverte, afficher une confirmation avant validation.

## 9.5 Module de droits et quotas

L’administrateur doit pouvoir :

- Accorder un droit au coaching.
- Définir sa période de validité.
- Activer ou désactiver un quota.
- Définir le nombre de demandes autorisées.
- Suspendre le droit.
- Prolonger sa validité.
- Corriger exceptionnellement le quota avec justification.
- Consulter le registre de consommation.

L’écran apprenant doit présenter clairement :

- Le statut du droit.
- Sa date d’expiration, si applicable.
- Le quota total, si activé.
- Le nombre de demandes consommées.
- Le nombre de demandes restantes.

## 9.6 Module de disponibilité

Le coach peut configurer ses disponibilités et ses absences.

L’administrateur peut consulter ces informations.

Le MVP utilise ces données pour informer la supervision et aider à organiser les affectations.

Une indisponibilité ne suspend pas automatiquement le délai d’une demande déjà soumise. Toute exception de délai doit suivre une règle explicite et auditée.

## 9.7 Module de demandes

Chaque demande comporte au minimum :

- Un identifiant unique.
- Une référence lisible, par exemple `COA-2026-000001`.
- L’apprenant.
- Le coach responsable.
- La catégorie.
- Le sujet.
- La description initiale.
- La priorité.
- Le statut.
- La date de création.
- La date de soumission.
- La date de première réponse humaine.
- La date d’échéance.
- La date de clôture.
- Le cycle courant.
- Les indicateurs de retard.
- Les pièces jointes éventuelles.

Fonctionnalités :

- Créer un brouillon.
- Soumettre une demande.
- Consulter une demande.
- Rechercher par référence ou sujet.
- Filtrer par statut, période, coach, catégorie et priorité selon les permissions.
- Consulter la chronologie.
- Consulter les échanges.
- Répondre ou demander des précisions.
- Clôturer une demande.
- Réouvrir une demande par l’administrateur.
- Annuler une demande lorsque les règles l’autorisent.

Les demandes doivent être paginées pour éviter de charger toute la base de données sur une seule page.

## 9.8 Module de messagerie interne

Chaque demande possède un fil de discussion.

Un message comprend :

- Son auteur.
- La demande associée.
- Le contenu.
- La date de création.
- Le statut de lecture, si cette fonctionnalité est activée.
- Les pièces jointes éventuelles.

Fonctionnalités :

- Envoyer un message.
- Consulter les messages précédents.
- Afficher l’auteur et l’horodatage.
- Afficher les pièces jointes autorisées.
- Signaler les nouveaux messages.
- Envoyer une notification au destinataire concerné.

Les notes internes du coach sont distinctes des messages visibles par l’apprenant.

Les messages ne doivent pas être supprimés silencieusement. Si une correction ou une suppression exceptionnelle est nécessaire, elle doit suivre une procédure traçable.

## 9.9 Module de pièces jointes

Les pièces jointes sont privées.

Prévoir :

- Une limite de taille configurable.
- Une liste de formats autorisés.
- Une validation du type de fichier côté serveur.
- Un stockage privé.
- Un téléchargement réservé aux utilisateurs autorisés.
- Des noms de fichiers générés par le système.
- Une protection contre les fichiers dangereux.
- Un enregistrement du propriétaire, de la demande et de la date de dépôt.

La limite de taille et les formats autorisés doivent être configurables avant la mise en production.

Ne jamais exposer les pièces jointes au moyen d’URL publiques permanentes.

## 9.10 Module de notes internes

Le coach peut enregistrer des notes privées liées à une demande ou à un suivi autorisé.

Ces notes :

- Ne sont pas visibles par l’apprenant.
- Sont accessibles uniquement aux personnes autorisées.
- Ne sont pas envoyées par e-mail à l’apprenant.
- Doivent respecter la politique de conservation des données.
- Doivent être protégées par les mêmes contrôles d’accès que les demandes.

## 9.11 Module de notifications

Deux canaux sont requis :

1. Notifications dans l’application.
2. Notifications par e-mail.

Événements à notifier :

- Nouvelle demande soumise.
- Nouvelle demande affectée au coach.
- Nouveau message.
- Demande de précisions.
- Réponse du coach.
- Demande clôturée.
- Évaluation disponible.
- Rappel avant échéance.
- Demande en retard.
- Escalade à l’administrateur.
- Réaffectation.
- Échec de notification nécessitant une supervision administrative.

Les e-mails ne doivent pas contenir le texte complet des messages privés ni les pièces jointes. Ils doivent inviter l’utilisateur à se connecter à la plateforme.

Un échec d’envoi d’e-mail ne doit jamais annuler une demande ou un message déjà enregistré.

## 9.12 Module de rapports

L’administrateur dispose d’un tableau de bord et de rapports filtrables par période.

Indicateurs :

- Total des demandes.
- Demandes ouvertes.
- Demandes clôturées.
- Demandes annulées.
- Demandes en retard.
- Demandes par coach.
- Demandes par statut.
- Délai moyen de première réponse en heures ouvrées.
- Pourcentage de premières réponses dans le délai cible.
- Durée de résolution.
- Temps d’attente de l’apprenant.
- Nombre de réouvertures.
- Note moyenne.
- Taux d’évaluation.
- Utilisation des quotas.

Les calculs doivent utiliser des données persistantes et des définitions cohérentes.

Ne pas confondre :

- Le temps écoulé avant la première réponse.
- Le temps total entre soumission et clôture.
- Le temps pendant lequel la demande attend une réponse de l’apprenant.
- Le temps ouvré et le temps calendaire.

---

# 10. Écrans et navigation

L’interface doit être moderne, minimaliste, lisible et adaptée aux ordinateurs, tablettes et smartphones.

Utiliser une identité visuelle professionnelle, en lien avec la finance et l’investissement, sans surcharge décorative.

## 10.1 Écrans communs

- Connexion.
- Mot de passe oublié.
- Définition ou réinitialisation du mot de passe.
- Profil utilisateur.
- Notifications.
- Page d’erreur d’accès.
- Page introuvable.

## 10.2 Espace administrateur

Menu principal proposé :

1. Tableau de bord.
2. Demandes de coaching.
3. Apprenants.
4. Coachs.
5. Affectations.
6. Droits et quotas.
7. Rapports.
8. Notifications et incidents.
9. Paramètres.
10. Journal d’audit.

### Tableau de bord administrateur

Afficher des cartes KPI :

- Demandes ouvertes.
- Demandes en retard.
- Demandes reçues sur la période.
- Pourcentage de réponses dans les délais.
- Délai moyen de première réponse.
- Satisfaction moyenne.

Ajouter :

- Une liste des demandes nécessitant une intervention.
- Un classement des demandes par ancienneté.
- Un tableau de charge par coach.
- Des filtres temporels.
- Des liens directs vers les demandes concernées.

Chaque carte KPI doit être cliquable lorsqu’une liste détaillée pertinente existe.

## 10.3 Espace coach

Menu proposé :

1. Tableau de bord.
2. Mes demandes.
3. Mes apprenants.
4. Disponibilités et absences.
5. Notifications.
6. Mon profil.

### Tableau de bord coach

Afficher :

- Demandes à traiter.
- Demandes en attente de ma réponse.
- Demandes en attente de l’apprenant.
- Demandes en retard.
- Échéances proches.
- Derniers messages reçus.

Prévoir des filtres :

- Toutes.
- À traiter.
- En cours.
- En attente de l’apprenant.
- En retard.
- Clôturées.

## 10.4 Espace apprenant

Menu proposé :

1. Accueil.
2. Nouvelle demande.
3. Mes demandes.
4. Mon coach.
5. Mon droit au coaching.
6. Notifications.
7. Mon profil.

### Tableau de bord apprenant

Afficher :

- Le coach actuellement affecté.
- Le statut du droit au coaching.
- Le quota restant, s’il est activé.
- Un bouton « Nouvelle demande » lorsque cela est autorisé.
- Les demandes en cours.
- Les derniers messages reçus.
- Les demandes clôturées récemment.

## 10.5 Page de détail d’une demande

La page doit présenter :

- La référence.
- Le sujet.
- Le statut.
- Le coach responsable.
- La priorité.
- La date de soumission.
- L’échéance de première réponse.
- L’indicateur de retard, si applicable.
- La description initiale.
- Les pièces jointes.
- Le fil de discussion.
- Les notes internes, uniquement pour les utilisateurs autorisés.
- L’historique des changements.
- Les actions autorisées selon le rôle.

Sur mobile, la messagerie doit rester facile à utiliser, avec une zone de saisie accessible et des pièces jointes clairement identifiées.

## 10.6 États d’interface obligatoires

Chaque écran comportant des données doit gérer :

- Le chargement.
- L’absence de données.
- L’erreur de chargement.
- L’absence de résultats après filtrage.
- L’accès interdit.
- La session expirée.
- L’enregistrement réussi.
- L’échec d’enregistrement.
- La confirmation des actions sensibles.

---

# 11. Architecture technique recommandée

## 11.1 Principes

Adopter un **monolithe modulaire**.

Pour le MVP, il n’est pas nécessaire de répartir l’application en microservices. Les fonctionnalités doivent être organisées en modules métier distincts au sein d’un même projet.

L’architecture doit permettre de faire évoluer séparément les domaines fonctionnels sans complexité opérationnelle excessive.

## 11.2 Stack recommandée

- **Frontend :** Next.js, React et TypeScript.
- **Interface :** Tailwind CSS et composants accessibles, par exemple shadcn/ui.
- **Backend :** routes API ou couche serveur Next.js organisée par modules.
- **Base de données :** PostgreSQL.
- **ORM et migrations :** Prisma ou une solution équivalente maîtrisée.
- **Authentification :** solution sécurisée compatible avec l’architecture retenue.
- **E-mails :** fournisseur SMTP ou service transactionnel configurable.
- **Tâches asynchrones :** worker ou ordonnanceur persistant pour les rappels, échéances et relances.
- **Fichiers :** stockage privé local adapté à un environnement de développement, puis stockage objet privé ou stockage privé équivalent en production.
- **Tests :** tests unitaires, d’intégration et tests de parcours critiques.

Le choix final des bibliothèques doit être cohérent avec les capacités de l’environnement de vibecoding.

Ne pas mélanger plusieurs mécanismes d’authentification ou plusieurs ORM sans nécessité.

## 11.3 Organisation des modules

Structure logique indicative :

```text
src/
  app/
    (auth)/
    admin/
    coach/
    learner/
    api/
  components/
    ui/
    forms/
    tables/
    dashboards/
    messaging/
  modules/
    auth/
    users/
    assignments/
    entitlements/
    quotas/
    availability/
    requests/
    messaging/
    attachments/
    notifications/
    deadlines/
    ratings/
    reporting/
    audit/
    settings/
  lib/
    db/
    permissions/
    validation/
    errors/
    logging/
  jobs/
  types/
  tests/
```

Adapter les dossiers aux conventions du framework choisi, sans mélanger les règles métier aux composants d’interface.

## 11.4 Principes d’architecture

- Séparer l’interface, la logique métier et l’accès aux données.
- Centraliser les règles d’autorisation.
- Valider les entrées côté serveur.
- Utiliser des transactions pour les opérations sensibles.
- Ajouter les index nécessaires aux filtres fréquents.
- Prévoir des migrations versionnées.
- Ne pas accéder directement à la base de données depuis les composants client.
- Ne pas exposer les secrets ou les identifiants privés.
- Centraliser les calculs de délai.
- Utiliser des identifiants stables et des références lisibles distinctes.
- Prévoir une gestion structurée des erreurs.
- Rendre les traitements de notifications idempotents.
- Prévoir une stratégie de sauvegarde et de restauration.

## 11.5 Exigences de qualité

- TypeScript strict autant que possible.
- Aucun secret dans le dépôt de code.
- Fichier `.env.example` documenté.
- Aucun mot de passe ou jeton sensible dans les journaux.
- Pas de données sensibles dans les messages d’erreur techniques affichés aux utilisateurs.
- Tests automatisés des règles métier critiques.
- Aucun accès non autorisé aux données par simple modification d’URL ou d’identifiant.
- Pages principales rapides et listes paginées.
- Interface responsive sur mobile et ordinateur.

---

# 12. Modèle de données

Le modèle de données doit être relationnel et respecter l’intégrité référentielle.

Les noms suivants sont indicatifs mais recommandés.

## 12.1 `users`

Représente les comptes utilisateurs.

Champs principaux :

- `id`
- `full_name`
- `email`
- `password_hash` si l’authentification est gérée directement
- `role`
- `status`
- `created_at`
- `updated_at`
- `last_login_at`, facultatif

Contraintes :

- E-mail unique après normalisation.
- Rôle validé côté serveur.
- Compte suspendu interdit d’accès aux fonctions protégées.
- Historique métier conservé après désactivation.

Si une solution d’authentification externe est utilisée, les identifiants d’authentification doivent suivre son modèle et ne pas être dupliqués inutilement.

## 12.2 `coach_assignments`

Historique des affectations principales coach-apprenant.

Champs :

- `id`
- `learner_id`
- `coach_id`
- `assigned_by`
- `started_at`
- `ended_at`
- `status`
- `reason`
- `created_at`

Prévoir une contrainte empêchant plusieurs affectations principales actives simultanées pour un même apprenant.

## 12.3 `coaching_entitlements`

Droits au coaching.

Champs :

- `id`
- `learner_id`
- `status`
- `starts_at`
- `expires_at`
- `quota_enabled`
- `quota_limit`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

Les consommations et corrections doivent être calculées à partir du registre des mouvements.

## 12.4 `coaching_quota_ledger`

Registre des consommations et corrections.

Champs :

- `id`
- `learner_id`
- `entitlement_id`
- `request_id`, facultatif
- `entry_type`
- `quantity`
- `reason`
- `created_by`
- `created_at`
- `idempotency_key`, si nécessaire

Les types de mouvement peuvent être :

- `CONSUME`
- `REFUND`
- `CORRECTION`

Le solde est calculé à partir des mouvements selon une convention de signe documentée.

## 12.5 `coach_availability`

Disponibilités récurrentes ou plages de disponibilité des coachs.

Champs indicatifs :

- `id`
- `coach_id`
- `day_of_week`
- `start_time`
- `end_time`
- `is_active`
- `created_at`
- `updated_at`

## 12.6 `coach_absences`

Absences ponctuelles.

Champs :

- `id`
- `coach_id`
- `starts_at`
- `ends_at`
- `reason`
- `created_at`

## 12.7 `coaching_categories`

Catégories administrables de demandes.

Champs :

- `id`
- `name`
- `description`
- `is_active`
- `sort_order`
- `created_at`
- `updated_at`

Exemples initiaux possibles : compréhension d’un instrument financier, fonctionnement de la BRVM, stratégie d’investissement, gestion du risque et questions générales de portefeuille.

Ces catégories ne doivent pas être présentées comme des recommandations financières automatiques.

## 12.8 `coaching_requests`

Entité principale.

Champs :

- `id`
- `reference`
- `learner_id`
- `coach_id`
- `category_id`
- `subject`
- `description`
- `priority`
- `status`
- `submitted_at`
- `first_response_at`
- `due_at`
- `closed_at`
- `current_cycle_number`
- `created_at`
- `updated_at`

Contraintes :

- Référence unique.
- Dates cohérentes.
- Coach et apprenant valides.
- Statut issu d’un ensemble contrôlé.
- Autorisation vérifiée côté serveur pour toute consultation ou modification.
- `first_response_at` renseigné uniquement par une réponse humaine pertinente.
- Pas d’écrasement de l’historique lors d’une réouverture.

## 12.9 `coaching_request_cycles`

Historique des cycles de traitement.

Champs :

- `id`
- `request_id`
- `cycle_number`
- `started_at`
- `closed_at`
- `assigned_coach_id`
- `first_response_at`
- `due_at`
- `reopened_by`
- `reopen_reason`
- `created_at`

Un cycle est créé lors de la soumission initiale et un nouveau cycle est créé à chaque réouverture administrative.

## 12.10 `coaching_messages`

Messages visibles dans le fil de discussion.

Champs :

- `id`
- `request_id`
- `cycle_id`
- `sender_id`
- `body`
- `created_at`
- `edited_at`, facultatif si l’édition est autorisée
- `deleted_at`, uniquement si une politique de suppression contrôlée est retenue

Prévoir une politique empêchant la suppression silencieuse des messages et protégeant leur historique.

## 12.11 `message_attachments`

Métadonnées des fichiers.

Champs :

- `id`
- `message_id`
- `request_id`
- `uploaded_by`
- `original_filename`
- `storage_key`
- `mime_type`
- `size_bytes`
- `created_at`

Ne pas stocker une URL publique permanente comme mécanisme d’autorisation.

## 12.12 `coaching_notes`

Notes internes privées.

Champs :

- `id`
- `request_id`
- `author_id`
- `body`
- `created_at`
- `updated_at`

L’accès à ces notes doit être strictement limité.

## 12.13 `request_status_history`

Historique des statuts.

Champs :

- `id`
- `request_id`
- `cycle_id`
- `old_status`
- `new_status`
- `changed_by`
- `reason`
- `created_at`

## 12.14 `service_calendars`

Calendriers de service.

Champs :

- `id`
- `name`
- `timezone`
- `is_active`
- `created_at`
- `updated_at`

## 12.15 `service_holidays`

Jours fériés ou fermetures.

Champs :

- `id`
- `calendar_id`
- `holiday_date`
- `label`
- `created_at`

Prévoir une contrainte d’unicité adaptée au calendrier et à la date.

## 12.16 `service_policies`

Paramètres de service.

Champs indicatifs :

- `id`
- `calendar_id`
- `response_target_working_minutes`
- `reminder_50_enabled`
- `reminder_75_enabled`
- `overdue_escalation_working_minutes`
- `effective_from`
- `created_by`
- `created_at`

Les règles doivent être historisées pour permettre de comprendre quelle politique était applicable à une demande.

## 12.17 `notifications`

Notifications dans l’application.

Champs :

- `id`
- `user_id`
- `type`
- `title`
- `body`
- `related_request_id`
- `read_at`
- `created_at`

## 12.18 `email_delivery_logs`

Journal des envois d’e-mails.

Champs :

- `id`
- `notification_id`
- `recipient`
- `template_key`
- `status`
- `attempt_count`
- `last_attempt_at`
- `sent_at`
- `error_code`
- `created_at`

Ne pas enregistrer inutilement le contenu confidentiel complet des messages dans ce journal.

## 12.19 `coaching_ratings`

Évaluations.

Champs :

- `id`
- `request_id`
- `cycle_id`
- `learner_id`
- `coach_id`
- `score`
- `comment`
- `created_at`
- `updated_at`

Contraintes :

- Note entière comprise entre 1 et 5.
- Une évaluation par demande et par cycle.
- L’évaluateur doit être l’apprenant concerné.
- La demande doit être clôturée dans le cycle évalué.

## 12.20 `audit_logs`

Journal d’audit.

Champs :

- `id`
- `actor_id`
- `action`
- `entity_type`
- `entity_id`
- `reason`
- `metadata`
- `created_at`

Événements à tracer notamment :

- Création et suspension d’un compte.
- Modification d’un rôle.
- Attribution ou retrait d’un droit.
- Correction d’un quota.
- Affectation et réaffectation d’un coach.
- Réouverture d’une demande.
- Modification d’une politique de service.
- Consultation administrative exceptionnelle d’informations sensibles, si applicable.

Les journaux doivent être protégés contre les modifications par des utilisateurs non autorisés.

## 12.21 Index recommandés

Prévoir notamment :

- Un index unique sur l’e-mail normalisé.
- Un index unique sur la référence de demande.
- Des index sur `learner_id`, `coach_id` et `status` des demandes.
- Un index sur `submitted_at`.
- Un index sur `due_at`.
- Des index sur les relations entre messages, demandes et cycles.
- Des index sur les notifications non lues par utilisateur.
- Des index sur les dates et statuts de livraison des e-mails.
- Des index sur les dates et entités du journal d’audit.

Le choix final des index doit être validé à partir des requêtes réellement utilisées.

---

# 13. Sécurité et confidentialité

Les données de coaching peuvent contenir des informations personnelles et financières. La sécurité est une exigence centrale du MVP.

## 13.1 Contrôle des accès

Appliquer le principe du moindre privilège.

- Un apprenant accède uniquement à ses demandes.
- Un coach accède uniquement aux demandes et apprenants autorisés.
- Un administrateur accède aux données nécessaires à la gestion et à la supervision.
- Les notes internes ne sont jamais exposées à l’apprenant.
- Les fichiers sont protégés par des contrôles d’accès serveur.
- Les permissions sont vérifiées sur chaque requête.
- Les identifiants de ressources ne doivent pas permettre de contourner les permissions.

## 13.2 Authentification

- Hachage robuste des mots de passe si l’application les gère.
- Gestion sécurisée des sessions.
- Protection contre les tentatives répétées de connexion.
- Réinitialisation sécurisée des mots de passe.
- Déconnexion et invalidation appropriées des sessions.
- Protection des routes privées.
- Protection contre les attaques courantes du web.

## 13.3 Protection des données

- HTTPS obligatoire en production.
- Secrets conservés dans des variables d’environnement.
- Aucun secret intégré au code client.
- Validation des entrées.
- Protection contre les injections SQL et les scripts malveillants.
- Protection contre les téléchargements de fichiers non autorisés.
- Limitation de la taille des requêtes.
- Journaux sans mots de passe, jetons ou contenu confidentiel inutile.
- Sauvegardes régulières et tests de restauration.

## 13.4 Confidentialité administrative

La plateforme doit informer les utilisateurs que les administrateurs autorisés peuvent consulter les demandes et les échanges à des fins de supervision, de sécurité et de continuité du service.

Les consultations sensibles doivent être limitées et, lorsque cela est pertinent, journalisées.

## 13.5 Conservation et suppression

Prévoir une politique de conservation des données avant le lancement.

La suppression d’un compte ne doit pas supprimer automatiquement les données nécessaires à la traçabilité ou aux obligations applicables.

Les durées de conservation et les modalités de suppression ou d’anonymisation devront être configurées selon les obligations légales et les besoins opérationnels.

---

# 14. Tâches planifiées et traitements asynchrones

Certaines fonctions ne peuvent pas dépendre uniquement du fait qu’un utilisateur consulte une page.

Mettre en place un mécanisme fiable de tâches planifiées pour :

- Détecter les échéances proches.
- Détecter les demandes en retard.
- Envoyer les rappels.
- Escalader les demandes en retard.
- Traiter les e-mails en attente.
- Réessayer les envois échoués.
- Nettoyer les données techniques temporaires selon une politique définie.

## 14.1 Exigences

- Les tâches doivent fonctionner même lorsqu’aucun utilisateur n’est connecté.
- Les traitements doivent être idempotents.
- Les doublons doivent être évités grâce à des clés ou événements uniques.
- Les erreurs doivent être journalisées.
- Les échecs temporaires doivent pouvoir être réessayés.
- Les tâches échouées de façon répétée doivent être visibles par l’administrateur.
- Les tâches ne doivent pas modifier silencieusement les échéances historiques.
- L’exécution doit être compatible avec l’environnement de déploiement.

Ne pas utiliser un simple minuteur exécuté uniquement dans le navigateur pour gérer les échéances ou les notifications.

---

# 15. API et opérations métier

Les routes exactes peuvent être adaptées au framework, mais les opérations suivantes doivent exister.

## 15.1 Authentification

- Connexion.
- Déconnexion.
- Récupération du profil courant.
- Réinitialisation du mot de passe.

## 15.2 Administration

- Liste des utilisateurs.
- Création et modification d’un utilisateur.
- Activation et suspension.
- Liste et gestion des coachs.
- Affectation et réaffectation.
- Gestion des droits au coaching.
- Gestion des quotas.
- Gestion du calendrier.
- Gestion des paramètres de service.
- Consultation des rapports.
- Consultation des journaux d’audit.
- Consultation des incidents de notification.

## 15.3 Demandes

- Créer un brouillon.
- Soumettre une demande.
- Lister les demandes accessibles à l’utilisateur.
- Consulter une demande.
- Modifier les champs autorisés.
- Prendre en charge une demande.
- Répondre.
- Demander des précisions.
- Clôturer.
- Annuler selon les règles applicables.
- Réouvrir administrativement avec motif.
- Réaffecter une demande.
- Consulter l’historique.

## 15.4 Messagerie

- Lister les messages d’une demande.
- Envoyer un message.
- Déposer une pièce jointe.
- Télécharger une pièce jointe autorisée.
- Marquer une notification ou un message comme lu si cette fonction est retenue.

## 15.5 Évaluation et rapports

- Soumettre une évaluation.
- Consulter les évaluations autorisées.
- Consulter les indicateurs.
- Filtrer les rapports.
- Exporter les données autorisées.

## 15.6 Exigences API

- Validation serveur de toutes les entrées.
- Contrôle des permissions sur chaque opération.
- Codes HTTP cohérents.
- Réponses d’erreur structurées.
- Pagination des listes.
- Filtrage et tri validés.
- Protection contre les requêtes répétées dangereuses.
- Idempotence pour les soumissions et opérations sensibles lorsque nécessaire.
- Transactions pour les changements de quota et la création des demandes.
- Documentation des opérations et des schémas de données.

---

# 16. Exigences non fonctionnelles

## 16.1 Performance

Objectif initial :

- Les écrans courants doivent répondre en moins de 2 secondes au 95e percentile dans des conditions de test définies.
- Les listes volumineuses doivent être paginées.
- Les requêtes doivent utiliser des index adaptés.
- Les tâches longues ne doivent pas bloquer inutilement les interactions utilisateur.

## 16.2 Responsive design

L’application doit fonctionner sur :

- Smartphones Android.
- Smartphones iOS.
- Tablettes.
- Ordinateurs portables et de bureau.

L’usage mobile est prioritaire pour les apprenants, notamment pour la lecture et l’envoi de messages.

## 16.3 Accessibilité et ergonomie

- Contraste lisible.
- Libellés explicites.
- Navigation clavier raisonnable.
- États de formulaire compréhensibles.
- Confirmation avant les opérations irréversibles ou sensibles.
- Couleurs de statut accompagnées de texte ou d’icônes explicites.

## 16.4 Fiabilité

- Les messages validés sont conservés même si l’envoi d’e-mail échoue.
- Les quotas ne peuvent pas être dépassés par des soumissions concurrentes.
- Les transitions de statut sont atomiques.
- Les rappels ne sont pas dupliqués.
- Les échéances sont reproductibles et vérifiables.
- Les erreurs sont journalisées.
- Les sauvegardes et la restauration sont documentées.

---

# 17. Tests et critères d’acceptation

Le MVP ne doit pas être considéré comme terminé tant que les tests suivants ne sont pas validés.

| ID | Scénario | Résultat attendu |
|---|---|---|
| REC-01 | Apprenant sans droit actif | La soumission est refusée. |
| REC-02 | Apprenant avec quota disponible | Une demande valide consomme une unité. |
| REC-03 | Deux soumissions simultanées pour une dernière unité | Une seule soumission est acceptée. |
| REC-04 | Demande soumise un vendredi en fin de journée | L’échéance respecte le calendrier ouvré. |
| REC-05 | Confirmation automatique de réception | Elle ne renseigne pas la première réponse humaine. |
| REC-06 | Le coach répond à une demande | La réponse est enregistrée et l’apprenant est notifié. |
| REC-07 | La demande dépasse son échéance | Elle est signalée en retard et les règles d’escalade s’appliquent. |
| REC-08 | Échec de l’envoi d’un e-mail | La demande reste enregistrée et l’envoi peut être réessayé. |
| REC-09 | Coach essayant d’accéder à une demande non autorisée | L’accès est refusé côté serveur. |
| REC-10 | Administrateur réouvrant une demande | Un motif est exigé et l’historique précédent est conservé. |
| REC-11 | Apprenant essayant de réouvrir une demande clôturée | L’opération est refusée. |
| REC-12 | Apprenant évaluant une demande clôturée | La note est enregistrée pour le bon cycle. |
| REC-13 | Réouverture après évaluation | L’évaluation précédente est conservée. |
| REC-14 | Désactivation d’un compte | Les historiques métier nécessaires restent consultables par les utilisateurs autorisés. |
| REC-15 | Modification du calendrier | Les anciennes échéances ne sont pas modifiées silencieusement. |
| REC-16 | Apprenant tentant d’accéder aux notes internes | L’accès est refusé. |
| REC-17 | Téléchargement d’une pièce jointe sans permission | Le serveur refuse le téléchargement. |
| REC-18 | Réaffectation d’une demande ouverte | Le nouveau responsable est enregistré et les messages antérieurs sont conservés. |
| REC-19 | Droit expiré avec demande encore ouverte | La demande reste accessible et peut être traitée. |
| REC-20 | Répétition de la même requête de soumission | Aucun quota supplémentaire n’est consommé pour la même opération. |

## 17.1 Tests complémentaires

Prévoir également :

- Tests unitaires du calcul des heures ouvrées.
- Tests des jours fériés et des fermetures.
- Tests des transitions de statut.
- Tests des permissions pour chaque rôle.
- Tests de réinitialisation du mot de passe.
- Tests d’envoi et de relance des e-mails.
- Tests de pagination et de filtres.
- Tests de validation des pièces jointes.
- Tests des notes internes.
- Tests des calculs de rapports.
- Tests de sauvegarde et de restauration.
- Tests d’interface sur mobile et ordinateur.

---

# 18. Données de démonstration

Prévoir un environnement de démonstration avec des données fictives :

- Un administrateur.
- Deux coachs.
- Plusieurs apprenants.
- Des droits actifs et suspendus.
- Des quotas différents.
- Des demandes dans plusieurs statuts.
- Des demandes en retard.
- Des messages de démonstration.
- Des évaluations fictives.

Ces données doivent être créées uniquement par un mécanisme explicite de seed ou de démonstration.

Ne jamais inclure de comptes de démonstration avec des mots de passe connus dans l’environnement de production.

L’application doit pouvoir fonctionner avec une base de données vide après initialisation, sans dépendre des données de démonstration.

---

# 19. Configuration et déploiement

## 19.1 Environnements

Prévoir au minimum :

- Développement.
- Test ou préproduction.
- Production.

Les données et les secrets doivent être séparés entre les environnements.

## 19.2 Variables d’environnement

Prévoir un fichier `.env.example` documentant les variables nécessaires, par exemple :

```text
DATABASE_URL=
AUTH_SECRET=
APP_URL=
APP_TIMEZONE=Africa/Abidjan

EMAIL_PROVIDER=
EMAIL_FROM=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=

PRIVATE_STORAGE_PATH=
```

Adapter les variables à la solution d’authentification, de stockage et d’e-mail effectivement retenue.

Ne pas placer de véritables secrets dans ce fichier.

## 19.3 Documentation obligatoire

Fournir :

- Les instructions d’installation.
- Les commandes de lancement local.
- Les commandes de migration.
- Les instructions de création du premier administrateur.
- Les instructions de configuration des e-mails.
- Les instructions de lancement des tâches planifiées.
- Les instructions de configuration du stockage des fichiers.
- Les instructions de déploiement.
- Les instructions de sauvegarde et de restauration.
- Les procédures de dépannage des notifications.

---

# 20. Plan de développement recommandé

Le développement doit être organisé en étapes vérifiables.

## Phase 1 — Socle technique

- Initialisation du projet.
- Mise en place du système de conception.
- Configuration de la base de données.
- Authentification.
- Gestion des rôles et permissions.
- Navigation et layouts.
- Initialisation des migrations.
- Création du premier administrateur.

**Condition de validation :** chaque rôle peut se connecter et ne voit que les pages autorisées.

## Phase 2 — Administration et droits

- Gestion des utilisateurs.
- Gestion des coachs.
- Affectations.
- Droits au coaching.
- Quotas.
- Registre des consommations.
- Disponibilités et absences.

**Condition de validation :** l’administrateur peut gérer les droits et les affectations sans manipulation directe de la base de données.

## Phase 3 — Demandes et messagerie

- Création de brouillons.
- Soumission des demandes.
- Liste et détail des demandes.
- Transitions de statut.
- Messagerie interne.
- Pièces jointes privées.
- Notes internes.
- Historique des statuts et des affectations.

**Condition de validation :** un apprenant peut soumettre une demande et échanger avec son coach de bout en bout.

## Phase 4 — Délais et notifications

- Calendrier ouvré.
- Calcul des échéances.
- Première réponse humaine.
- Détection des retards.
- Rappels.
- Escalades.
- Notifications dans l’application.
- E-mails et relances.
- Journal des incidents.

**Condition de validation :** les délais et les notifications fonctionnent même en l’absence d’utilisateurs connectés.

## Phase 5 — Clôture, évaluations et rapports

- Clôture.
- Réouverture administrative.
- Gestion des cycles.
- Évaluations.
- Tableau de bord administrateur.
- Tableau de bord coach.
- Indicateurs.
- Filtres et exports autorisés.

**Condition de validation :** les données de supervision sont calculées à partir des données réelles et restent cohérentes avec l’historique.

## Phase 6 — Qualité et mise en production

- Exécution de la suite de tests.
- Tests de sécurité.
- Tests responsive.
- Correction des anomalies.
- Vérification des migrations.
- Configuration des sauvegardes.
- Documentation.
- Déploiement de préproduction.
- Validation métier.
- Déploiement de production.

**Condition de validation :** tous les critères d’acceptation critiques sont satisfaits et les procédures d’exploitation sont documentées.

---

# 21. Décisions à confirmer avant le lancement

Les éléments suivants doivent être validés par le responsable du produit. Ils peuvent être paramétrables, mais ne doivent pas rester ambigus en production.

| Sujet | Proposition initiale |
|---|---|
| Horaires de service | Du lundi au vendredi, 08 h–12 h et 13 h–17 h |
| Délai de première réponse | 24 heures ouvrées |
| Rappel intermédiaire | À 50 % du délai |
| Second rappel | À 75 % du délai |
| Escalade administrative | Après 8 heures ouvrées de retard |
| Formats des pièces jointes | Liste blanche de formats autorisés à définir |
| Taille maximale des pièces jointes | À définir |
| Annulation d’une demande | Selon des règles explicites à finaliser |
| Clôture par l’apprenant | À confirmer ; par défaut, ne permettre la clôture qu’aux rôles autorisés |
| Conservation des données | Durée à définir selon les obligations applicables |
| Réaffectation en cas d’absence prolongée | Décision manuelle de l’administrateur |
| Délai de rétention des journaux | À définir |
| Fournisseur d’e-mails | À sélectionner |
| Hébergement et sauvegardes | À sélectionner |

Ces paramètres doivent être centralisés autant que possible pour éviter d’avoir à modifier le code lorsqu’une règle de service change.

---

# 22. Livrables attendus de l’IA

À la fin du développement, fournir :

1. Le code source complet.
2. Une application fonctionnelle.
3. Les migrations de base de données.
4. Le modèle relationnel et sa documentation.
5. Les règles de permissions.
6. Le service de calcul des heures ouvrées.
7. Le système de notifications.
8. Les tâches planifiées ou workers.
9. Les tests automatisés.
10. Le fichier `.env.example`.
11. Les données de démonstration.
12. Les instructions d’installation.
13. Les instructions de déploiement.
14. Les procédures de sauvegarde et de restauration.
15. La liste des fonctionnalités terminées.
16. La liste des limites connues.
17. La liste des décisions restant à valider.
18. Un compte rendu des tests exécutés et de leurs résultats.

Ne déclare pas une fonctionnalité terminée si elle n’a été ni implémentée ni vérifiée.

---

# 23. Définition de « MVP terminé »

Le MVP est considéré comme terminé uniquement lorsque :

- Les trois rôles peuvent utiliser leurs espaces respectifs.
- Les permissions sont vérifiées côté serveur.
- L’administrateur peut gérer les utilisateurs, les coachs, les affectations et les droits.
- Les quotas sont appliqués de manière fiable lorsqu’ils sont activés.
- Un apprenant autorisé peut soumettre une demande.
- Le coach peut répondre et demander des précisions.
- Les messages et pièces jointes sont accessibles uniquement aux personnes autorisées.
- Les demandes possèdent une échéance calculée selon le calendrier ouvré.
- Les rappels et escalades fonctionnent sans présence d’un utilisateur connecté.
- Les erreurs d’e-mail sont tracées et peuvent être réessayées.
- Les clôtures et réouvertures préservent l’historique.
- Les évaluations sont liées au bon cycle.
- Les tableaux de bord utilisent des données réelles.
- Les tests d’acceptation critiques passent.
- Les sauvegardes et la restauration sont documentées.
- Les procédures d’installation et de déploiement sont disponibles.

---

# 24. Instruction finale à l’IA

À partir de ce PRD, construis une application réellement utilisable, sécurisée et maintenable.

Commence par analyser les exigences et proposer une architecture concise accompagnée du modèle de données et de l’ordre de développement.

Ensuite, implémente les modules étape par étape, en vérifiant leur fonctionnement au fur et à mesure.

Priorise la cohérence des règles métier, la fiabilité des données, les permissions et la traçabilité avant les fonctionnalités décoratives.

Ne remplace aucune règle métier par une simple simulation visuelle.

Ne crée pas de fausses données de production.

Ne considère pas qu’un écran est terminé tant que les actions qu’il présente ne fonctionnent pas.

En cas de conflit entre une solution technique simpliste et une exigence métier explicite du présent PRD, respecte l’exigence métier.

Le résultat attendu est un MVP opérationnel de gestion du coaching individuel BRVM, prêt à être testé par de vrais utilisateurs dans un environnement contrôlé.
