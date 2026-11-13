# Guide d'utilisation — Mentora

La plateforme remplace les conversations privées dispersées (WhatsApp, Telegram…) par **un seul endroit** où chaque demande de coaching est enregistrée, suivie, répondue et archivée.

**Trois espaces, selon votre rôle :**

| Vous êtes… | Votre mission | Votre espace |
|---|---|---|
| **Apprenant** | Poser vos questions à votre coach et suivre les réponses | `/learner` |
| **Coach** | Répondre aux demandes de vos apprenants dans les délais | `/coach` |
| **Administrateur** | Organiser le coaching et surveiller la qualité de service | `/admin` |

L'application s'utilise dans un navigateur, sur ordinateur comme sur téléphone. Vous arrivez automatiquement dans votre espace après connexion.

---

## Pour tout le monde

**Se connecter.** Ouvrez l'adresse de la plateforme, saisissez votre e-mail et votre mot de passe. Votre compte est créé par l'administrateur, qui vous transmet votre mot de passe provisoire : **changez-le dès votre première connexion** (menu *Mon profil*).

**Mot de passe oublié ?** Cliquez sur « Mot de passe oublié » sur la page de connexion, ou demandez à l'administrateur de vous en générer un nouveau.

**Sécurité.** Après plusieurs erreurs de mot de passe, le compte est bloqué quelques minutes. La session se ferme après 2 heures d'inactivité.

**Notifications.** La cloche (menu *Notifications*) vous prévient de tout ce qui vous concerne : nouvelle demande, nouveau message, réponse, rappel de délai. Cliquez sur une notification pour aller directement à la demande.

**Le cycle de vie d'une demande**

```
Brouillon → Soumise → En attente du coach → En cours
                                              │   ↑
                              Précisions demandées (attente apprenant)
                                              ↓
                                   Réponse apportée → Clôturée
```

---

## 1. Guide de l'apprenant

### Poser une question à votre coach
1. Menu **Nouvelle demande**.
2. Choisissez une **catégorie** (les catégories dépendent de votre domaine : par exemple « Objectifs et plan d'action » ou « Organisation et gestion du temps »), écrivez un **sujet** court et décrivez votre question le plus précisément possible.
3. Ajoutez des **pièces jointes** si utile (capture d'écran, document). Les formats et la taille maximale sont fixés par l'administrateur.
4. Vérifiez le récapitulatif, puis **Soumettre**.

Vous recevez une confirmation. Tant que vous n'avez pas soumis, c'est un **brouillon** : il ne consomme rien et vous pouvez le modifier ou l'abandonner.

> **Conseil :** une demande = un sujet. Pour une autre question, créez une nouvelle demande. Les réponses restent ainsi faciles à retrouver.

### Suivre et échanger
- **Accueil** : vos demandes ouvertes, ce qui attend votre réponse, votre droit au coaching.
- **Mes demandes** : la liste complète, avec le statut de chacune. Utilisez les onglets et la recherche.
- Ouvrez une demande pour lire les messages, **répondre**, ajouter un fichier et consulter l'historique.
- Si le coach demande des précisions, la demande passe en **« En attente de l'apprenant »** : répondez pour la relancer.

### Après la clôture
Quand le coach clôture votre demande, vous pouvez **la noter de 1 à 5** et laisser un commentaire (facultatif). Votre note n'est visible que des personnes autorisées. Vous ne pouvez pas rouvrir une demande clôturée : si besoin, contactez l'administrateur, ou créez-en une nouvelle.

### Mon coach, mon droit au coaching
- **Mon coach** : qui vous accompagne, et ses disponibilités.
- **Mon droit au coaching** : votre accès est-il actif, et s'il y a un quota, combien de demandes il vous reste. Si votre droit est suspendu ou si aucun coach ne vous est affecté, un message vous l'explique et la création de demande est bloquée : contactez l'administrateur.

---

## 2. Guide du coach

### Votre tableau de bord
En arrivant, vous voyez d'un coup d'œil :
- les demandes **à traiter** et celles **en attente de votre réponse** ;
- les demandes **en retard** (en rouge) et les **échéances proches** ;
- la liste triée par **échéance** : traitez en premier ce qui expire le plus tôt.

Le délai cible de première réponse est de **24 heures ouvrées** (jours et horaires de service définis par l'administrateur : week-ends, pauses et jours fériés ne comptent pas).

### Traiter une demande
1. **Mes demandes** → ouvrez une demande.
2. Lisez le sujet, la description et les pièces jointes.
3. Cliquez sur **Prendre en charge** pour signaler que vous la traitez, puis écrivez votre réponse dans la zone de message.
4. Il manque une information ? Choisissez le type de message **« Demander des précisions »** : la demande passe en attente de l'apprenant.
5. Votre réponse est complète ? Choisissez **« Réponse finale »** à l'envoi, puis **Clôturer** quand le sujet est terminé.

**Notes internes.** Vous pouvez écrire des notes privées sur une demande (rappels, éléments de contexte) : l'apprenant ne les voit jamais.

### Rappels automatiques
Vous êtes prévenu à **50 %** puis **75 %** du délai écoulé, puis à l'échéance. Si le retard dépasse 8 heures ouvrées, l'administrateur est alerté. Répondre à temps évite tout cela.

### Mes apprenants
La liste de vos apprenants, leur historique et leurs demandes en cours.

### Disponibilités et absences
- **Disponibilités** : vos créneaux habituels de la semaine.
- **Absences** : déclarez vos congés ou indisponibilités à l'avance. L'administrateur peut ainsi réaffecter vos demandes si nécessaire, et les apprenants savent à quoi s'attendre.

> **Conseil :** déclarez vos absences dès que vous les connaissez ; le système prévient l'administrateur pour assurer la continuité du service.

---

## 3. Guide de l'administrateur

### Premier démarrage
Sur une plateforme vide, la page **/setup** permet de créer le premier administrateur. Faites-le immédiatement après le déploiement.

### Mettre en place la communauté (dans cet ordre)
1. **Comptes → Nouveau compte** : créez les coachs, puis les apprenants. Le compte est actif tout de suite ; une fenêtre affiche **une seule fois** le mot de passe provisoire (bouton *Copier*) : transmettez-le à la personne. *Réinitialiser l'accès* en génère un nouveau.
2. **Affectations** : associez chaque apprenant à un coach. Les changements sont historisés.
3. **Droits et quotas** : donnez à chaque apprenant son droit au coaching (période, et éventuellement un nombre de demandes). Vous pouvez suspendre, corriger ou rembourser une unité, toujours avec trace.
4. **Paramètres** : horaires et jours de service, jours fériés, délai cible, catégories de demandes, formats et taille des pièces jointes.

### Superviser au quotidien
- **Tableau de bord** : demandes ouvertes, **en retard**, charge par coach, délais moyens, satisfaction. Cliquez sur un chiffre pour voir les demandes concernées.
- **Demandes de coaching** : toutes les demandes, filtrables par coach, apprenant, statut, priorité et période. Sur une demande, vous pouvez **réaffecter**, **changer la priorité**, **relancer le coach**, ou **rouvrir** une demande clôturée (avec un motif obligatoire : seul l'administrateur peut le faire).
- **Notifications** : suivez les incidents, par exemple un e-mail non envoyé, et relancez-le.

### Rapports
**Rapports** : volumes, retards, délais de première réponse, notes de satisfaction, répartition par coach. Exportez en **CSV** pour Excel.

### Gestion des comptes
Fiche utilisateur : modifier le profil, changer le rôle, **suspendre** (le compte ne peut plus se connecter) ou **réactiver**, générer un nouvel accès.

### Journal d'audit
Toutes les actions sensibles (création de compte, changement de coach, droit, réouverture, paramètres…) sont enregistrées avec leur auteur et leur date. Rien n'est modifié en silence.

---

## Questions fréquentes

**Je ne peux pas créer de demande.** Votre droit est suspendu ou expiré, votre quota est épuisé, ou aucun coach ne vous est affecté. Le message affiché vous l'indique ; contactez l'administrateur.

**Une demande est « en retard », est-ce un statut ?** Non : c'est un indicateur calculé à partir de l'échéance. Le statut de la demande (en cours, en attente…) reste inchangé.

**Qui voit mes messages ?** Votre coach, et l'administrateur en cas de supervision (chaque consultation administrative est tracée). Les pièces jointes sont privées, jamais accessibles par un lien public.

**Les e-mails.** Les notifications sont toujours disponibles dans la plateforme. L'envoi d'e-mails de rappel dépend de la configuration du serveur par l'administrateur.
