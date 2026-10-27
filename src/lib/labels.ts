import type { NotificationType, Priority, RequestStatus, Role, UserStatus } from "@/modules/core/types";
export { STATUS_LABELS } from "@/modules/requests/stateMachine";
export { ENTITLEMENT_STATUS_LABELS } from "@/modules/entitlements/entitlements";

export const ROLE_LABELS: Record<Role, string> = { ADMIN: "Administrateur", COACH: "Coach", LEARNER: "Apprenant" };

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  PENDING_ACTIVATION: "En attente d’activation",
  ACTIVE: "Actif",
  SUSPENDED: "Suspendu",
};

export const PRIORITY_LABELS: Record<Priority, string> = { NORMAL: "Normale", HIGH: "Élevée", URGENT: "Urgente" };

export const STATUS_TONE: Record<RequestStatus, Tone> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  WAITING_FOR_COACH: "info",
  IN_PROGRESS: "brand",
  WAITING_FOR_LEARNER: "warning",
  RESPONSE_PROVIDED: "success",
  CLOSED: "neutral",
  CANCELLED: "neutral",
};

export type Tone = "neutral" | "brand" | "info" | "success" | "warning" | "danger";

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  REQUEST_SUBMITTED: "Demande soumise",
  REQUEST_ASSIGNED: "Affectation",
  NEW_MESSAGE: "Nouveau message",
  CLARIFICATION_REQUESTED: "Demande de précisions",
  COACH_RESPONSE: "Réponse du coach",
  REQUEST_CLOSED: "Demande clôturée",
  RATING_AVAILABLE: "Évaluation disponible",
  RATING_RECEIVED: "Évaluation reçue",
  DEADLINE_REMINDER: "Rappel d’échéance",
  REQUEST_OVERDUE: "Retard",
  ESCALATION: "Escalade",
  REASSIGNMENT: "Réaffectation",
  REQUEST_REOPENED: "Réouverture",
  NOTIFICATION_FAILURE: "Incident d’envoi",
  COACH_UNAVAILABLE: "Continuité de service",
  ACCOUNT: "Compte",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  BOOTSTRAP_ADMIN: "Création du premier administrateur",
  USER_CREATED: "Création de compte",
  USER_UPDATED: "Modification de profil",
  USER_ROLE_CHANGED: "Changement de rôle",
  USER_SUSPENDED: "Suspension de compte",
  USER_REACTIVATED: "Réactivation de compte",
  ACTIVATION_RESENT: "Renvoi du lien d’activation",
  ACCESS_RESET_SENT: "Réinitialisation de l’accès",
  ACCOUNT_ACTIVATED: "Activation du compte",
  PASSWORD_RESET_REQUESTED: "Demande de réinitialisation du mot de passe",
  PASSWORD_RESET_COMPLETED: "Mot de passe réinitialisé",
  PASSWORD_CHANGED: "Mot de passe modifié",
  LOGIN_LOCKED: "Verrouillage après échecs de connexion",
  ASSIGNMENT_CREATED: "Affectation d’un coach",
  ASSIGNMENT_CHANGED: "Changement de coach",
  ASSIGNMENT_ENDED: "Fin d’affectation",
  ENTITLEMENT_GRANTED: "Attribution d’un droit",
  ENTITLEMENT_UPDATED: "Modification d’un droit",
  ENTITLEMENT_SUSPENDED: "Suspension d’un droit",
  ENTITLEMENT_REACTIVATED: "Réactivation d’un droit",
  ENTITLEMENT_REVOKED: "Retrait d’un droit",
  QUOTA_CORRECTED: "Correction de quota",
  QUOTA_REFUNDED: "Remboursement de quota",
  REQUEST_REASSIGNED: "Réaffectation d’une demande",
  REQUEST_REOPENED: "Réouverture d’une demande",
  REQUEST_PRIORITY_CHANGED: "Changement de priorité",
  REQUEST_VIEWED_BY_ADMIN: "Consultation administrative",
  DUE_DATE_RECALCULATED: "Recalcul d’échéance",
  COACH_NUDGED: "Relance du coach",
  COACH_ABSENCE_DECLARED: "Absence déclarée",
  COACH_ABSENCE_CANCELLED: "Absence annulée",
  SERVICE_POLICY_UPDATED: "Modification de la politique de service",
  HOLIDAY_ADDED: "Ajout d’un jour de fermeture",
  HOLIDAY_REMOVED: "Suppression d’un jour de fermeture",
  APP_SETTINGS_UPDATED: "Modification des paramètres",
  CATEGORY_CREATED: "Création de catégorie",
  CATEGORY_UPDATED: "Modification de catégorie",
  EMAIL_RETRY_REQUESTED: "Relance d’un e-mail",
  JOBS_TRIGGERED_MANUALLY: "Exécution manuelle des tâches",
  REPORT_EXPORTED: "Export de rapport",
};

export const EMAIL_STATUS_LABELS = { PENDING: "En attente", RETRY: "Nouvelle tentative prévue", SENT: "Envoyé", FAILED: "Échec définitif" } as const;

export const LEDGER_LABELS = { CONSUME: "Consommation", REFUND: "Remboursement", CORRECTION: "Correction" } as const;

export const DAY_LABELS = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
