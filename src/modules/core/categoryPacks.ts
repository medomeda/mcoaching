/**
 * Modèles de catégories de demandes, par domaine d'accompagnement. Un modèle est proposé à la création
 * de l'espace, puis l'administrateur peut en ajouter d'autres ou modifier ses catégories à tout moment.
 */
export type CategoryPackId = "general" | "finance" | "developpement" | "formation" | "entrepreneuriat";

export interface CategoryPack {
  id: CategoryPackId;
  label: string;
  description: string;
  categories: readonly (readonly [name: string, description: string])[];
}

export const CATEGORY_PACKS: readonly CategoryPack[] = [
  {
    id: "general",
    label: "Général",
    description: "Convient à tout type d’accompagnement.",
    categories: [
      ["Objectifs et plan d’action", "Clarifier un objectif, le découper en étapes, planifier."],
      ["Organisation et gestion du temps", "Priorités, méthode de travail, régularité."],
      ["Blocages et prise de décision", "Lever un frein, hésiter entre plusieurs options."],
      ["Compétences et apprentissage", "Progresser sur un savoir-faire ou une connaissance."],
      ["Suivi et bilan", "Faire le point sur l’avancement et ajuster."],
    ],
  },
  {
    id: "finance",
    label: "Finance et investissement",
    description: "Éducation financière, épargne, marchés, gestion du risque.",
    categories: [
      ["Comprendre un produit financier", "Actions, obligations, fonds, épargne : fonctionnement et caractéristiques."],
      ["Fonctionnement des marchés", "Ordres, intermédiaires, séances, règlement-livraison."],
      ["Stratégie d’investissement", "Construction d’une démarche, horizon, diversification."],
      ["Gestion du risque", "Volatilité, exposition, discipline."],
      ["Budget et suivi de portefeuille", "Organisation, suivi et lecture de ses finances."],
    ],
  },
  {
    id: "developpement",
    label: "Développement personnel",
    description: "Confiance, motivation, habitudes, relations.",
    categories: [
      ["Confiance en soi", "Estime de soi, affirmation, dépassement des doutes."],
      ["Gestion des émotions et du stress", "Comprendre et apaiser ce que l’on ressent."],
      ["Objectifs de vie et motivation", "Donner du sens, tenir dans la durée."],
      ["Habitudes et routines", "Installer ou changer une habitude."],
      ["Relations et communication", "Échanges avec les autres, limites, conflits."],
    ],
  },
  {
    id: "formation",
    label: "Formation et compétences",
    description: "Suivi de participants à une formation ou à un parcours.",
    categories: [
      ["Contenu du cours", "Questions de compréhension sur une notion ou un module."],
      ["Exercices et mises en pratique", "Aide sur un exercice, un cas ou un atelier."],
      ["Projet ou évaluation", "Préparation, avancement, retour sur un livrable."],
      ["Parcours et progression", "Rythme, objectifs, prochaines étapes."],
      ["Outils et ressources", "Matériel, supports, logiciels."],
    ],
  },
  {
    id: "entrepreneuriat",
    label: "Entrepreneuriat",
    description: "Lancement et développement d’une activité.",
    categories: [
      ["Idée et validation", "Tester un besoin, une offre, un marché."],
      ["Modèle économique et prix", "Revenus, coûts, tarification."],
      ["Vente et marketing", "Trouver des clients, communiquer, convaincre."],
      ["Gestion et finances de l’activité", "Trésorerie, comptabilité, formalités."],
      ["Organisation et équipe", "Priorités, délégation, recrutement."],
    ],
  },
] as const;

export const DEFAULT_CATEGORY_PACK: CategoryPackId = "general";

export const packById = (id: string): CategoryPack | undefined => CATEGORY_PACKS.find((p) => p.id === id);
