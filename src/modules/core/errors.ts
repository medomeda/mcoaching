/** Erreurs structurées (PRD §15.6). Le `status` reprend la sémantique HTTP du futur serveur. */

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "SESSION_EXPIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "BUSINESS_RULE"
  | "RATE_LIMITED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  SESSION_EXPIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  BUSINESS_RULE: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fieldErrors?: Record<string, string>;

  constructor(code: ErrorCode, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.fieldErrors = fieldErrors;
  }
}

export const forbidden = (message = "Vous n’êtes pas autorisé à effectuer cette action.") =>
  new AppError("FORBIDDEN", message);
export const notFound = (message = "Ressource introuvable.") => new AppError("NOT_FOUND", message);
export const businessRule = (message: string) => new AppError("BUSINESS_RULE", message);
export const conflict = (message: string) => new AppError("CONFLICT", message);
export const validation = (message: string, fieldErrors?: Record<string, string>) =>
  new AppError("VALIDATION", message, fieldErrors);

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError || (typeof e === "object" && e !== null && (e as { name?: string }).name === "AppError");
}
