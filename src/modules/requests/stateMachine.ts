/**
 * Machine à états des demandes (PRD §8.2). Toute transition passe par `planTransition`,
 * qui renvoie la suite de statuts traversés (chaque étape est historisée).
 * Un statut ne peut jamais être affecté arbitrairement depuis un formulaire.
 */
import { businessRule } from "../core/errors";
import type { RequestStatus } from "../core/types";

export type RequestAction =
  | "SUBMIT"
  | "ACKNOWLEDGE" // « Enregistrement initial » : première consultation par le coach responsable
  | "TAKE_CHARGE"
  | "COACH_MESSAGE"
  | "REQUEST_CLARIFICATION"
  | "FINAL_RESPONSE"
  | "LEARNER_MESSAGE"
  | "CLOSE"
  | "REOPEN"
  | "ABANDON"
  | "CANCEL";

/** Transitions élémentaires du PRD §8.2 (+ relance apprenant, ajout configurable). */
const BASE: ReadonlyArray<[RequestStatus, RequestAction, RequestStatus]> = [
  ["DRAFT", "SUBMIT", "SUBMITTED"],
  ["SUBMITTED", "TAKE_CHARGE", "IN_PROGRESS"],
  ["SUBMITTED", "ACKNOWLEDGE", "WAITING_FOR_COACH"],
  ["WAITING_FOR_COACH", "TAKE_CHARGE", "IN_PROGRESS"],
  ["IN_PROGRESS", "REQUEST_CLARIFICATION", "WAITING_FOR_LEARNER"],
  ["WAITING_FOR_LEARNER", "LEARNER_MESSAGE", "IN_PROGRESS"],
  ["IN_PROGRESS", "FINAL_RESPONSE", "RESPONSE_PROVIDED"],
  ["RESPONSE_PROVIDED", "CLOSE", "CLOSED"],
  ["CLOSED", "REOPEN", "WAITING_FOR_COACH"],
  ["DRAFT", "ABANDON", "CANCELLED"],
  ["SUBMITTED", "CANCEL", "CANCELLED"],
];

export const OPEN_STATUSES: readonly RequestStatus[] = [
  "SUBMITTED",
  "WAITING_FOR_COACH",
  "IN_PROGRESS",
  "WAITING_FOR_LEARNER",
  "RESPONSE_PROVIDED",
];

export function isOpen(status: RequestStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/** Statuts dans lesquels une action du coach est attendue (file « à traiter »). */
export const AWAITING_COACH_STATUSES: readonly RequestStatus[] = ["SUBMITTED", "WAITING_FOR_COACH", "IN_PROGRESS"];

export interface TransitionOptions {
  learnerFollowUpReopensProcessing: boolean;
}

function step(from: RequestStatus, action: RequestAction): RequestStatus | null {
  return BASE.find(([f, a]) => f === from && a === action)?.[2] ?? null;
}

/**
 * Renvoie les statuts successifs à enregistrer (vide = aucun changement de statut,
 * l'action reste permise). Lève une erreur métier si l'action est interdite.
 */
export function planTransition(
  current: RequestStatus,
  action: RequestAction,
  opts: TransitionOptions = { learnerFollowUpReopensProcessing: true },
): RequestStatus[] {
  const direct = step(current, action);

  switch (action) {
    case "COACH_MESSAGE": {
      // Répondre = prendre en charge si la demande n'est pas encore en cours.
      if (current === "SUBMITTED" || current === "WAITING_FOR_COACH") return ["IN_PROGRESS"];
      if (current === "IN_PROGRESS" || current === "WAITING_FOR_LEARNER" || current === "RESPONSE_PROVIDED") return [];
      break;
    }
    case "REQUEST_CLARIFICATION":
    case "FINAL_RESPONSE": {
      if (current === "SUBMITTED" || current === "WAITING_FOR_COACH") {
        return ["IN_PROGRESS", step("IN_PROGRESS", action)!];
      }
      if (action === "REQUEST_CLARIFICATION" && current === "WAITING_FOR_LEARNER") return [];
      if (direct) return [direct];
      break;
    }
    case "LEARNER_MESSAGE": {
      if (direct) return [direct];
      if (current === "RESPONSE_PROVIDED") {
        if (opts.learnerFollowUpReopensProcessing) return ["IN_PROGRESS"];
        throw businessRule("La réponse finale a été apportée : la demande est en attente de clôture.");
      }
      if (current === "SUBMITTED" || current === "WAITING_FOR_COACH" || current === "IN_PROGRESS") return [];
      break;
    }
    default:
      if (direct) return [direct];
  }
  throw businessRule(`Action « ${ACTION_LABELS[action]} » impossible lorsque la demande est « ${STATUS_LABELS[current]} ».`);
}

export function canTransition(current: RequestStatus, action: RequestAction, opts?: TransitionOptions): boolean {
  try {
    planTransition(current, action, opts);
    return true;
  } catch {
    return false;
  }
}

export const STATUS_LABELS: Record<RequestStatus, string> = {
  DRAFT: "Brouillon",
  SUBMITTED: "Soumise",
  WAITING_FOR_COACH: "En attente du coach",
  IN_PROGRESS: "En cours",
  WAITING_FOR_LEARNER: "En attente de l’apprenant",
  RESPONSE_PROVIDED: "Réponse apportée",
  CLOSED: "Clôturée",
  CANCELLED: "Annulée",
};

export const ACTION_LABELS: Record<RequestAction, string> = {
  SUBMIT: "Soumettre",
  ACKNOWLEDGE: "Enregistrement initial",
  TAKE_CHARGE: "Prendre en charge",
  COACH_MESSAGE: "Répondre",
  REQUEST_CLARIFICATION: "Demander des précisions",
  FINAL_RESPONSE: "Apporter une réponse finale",
  LEARNER_MESSAGE: "Répondre",
  CLOSE: "Clôturer",
  REOPEN: "Réouvrir",
  ABANDON: "Abandonner le brouillon",
  CANCEL: "Annuler",
};
