export interface FaqItem { question: string; answer: string }

export const faqItems: FaqItem[] = [
  { question: "À qui s’adresse Mentora ?", answer: "Aux coachs indépendants, formateurs et mentors qui accompagnent des personnes individuellement et veulent centraliser les demandes, tenir leurs délais et mesurer la qualité de leur accompagnement." },
  { question: "Comment fonctionne l’essai gratuit ?", answer: "Vous demandez un essai, nous vous contactons et mettons en place votre espace. L’essai est gratuit pendant la durée indiquée sur la page des tarifs, sans engagement." },
  { question: "Mes données sont-elles séparées de celles des autres clients ?", answer: "Oui. Chaque client dispose de sa propre instance de l’application et de sa propre base de données. Nous ne consultons ni les messages ni les pièces jointes de vos membres." },
  { question: "Mes membres doivent-ils installer quelque chose ?", answer: "Non. Mentora fonctionne dans le navigateur, sur ordinateur comme sur téléphone, y compris avec une connexion mobile modeste." },
  { question: "Puis-je personnaliser le vocabulaire et les catégories ?", answer: "Vous choisissez le nom de votre espace, votre présentation et vos catégories d’accompagnement, à partir de modèles ou librement." },
  { question: "Comment payer et quelles sont les formules ?", answer: "Les formules et leurs tarifs sont présentés sur la page Tarifs. Le paiement se fait à la demande, avec les moyens locaux courants ; contactez-nous pour les modalités." },
  { question: "Puis-je arrêter quand je veux ?", answer: "Oui. Vous pouvez résilier à tout moment, et nous vous aidons à récupérer vos données avant la fermeture de l’espace." },
  { question: "Où est hébergé mon espace ?", answer: "Sur nos serveurs, avec des sauvegardes régulières. Votre espace est accessible à une adresse qui vous est propre." },
];
