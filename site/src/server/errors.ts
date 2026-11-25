/** Messages d'erreur sûrs : jamais de requête SQL, de paramètre (jeton chiffré, données personnelles) ni de trace vers le navigateur ou les journaux. */
import { ZodError } from "zod";

const looksLikeDbError = (e: Error) => e.name === "DrizzleQueryError" || /^Failed query/.test(e.message) || typeof (e as { cause?: { code?: unknown } }).cause?.code === "string";

const pgCode = (e: Error): string | undefined => (e as { cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;

export function userMessage(e: unknown): string {
  if (e instanceof ZodError) return e.issues[0]?.message ?? "Données invalides.";
  if (e instanceof Error) {
    if (looksLikeDbError(e)) return pgCode(e) === "23505" ? "Cette valeur est déjà utilisée (sous-domaine ou adresse déjà enregistré)." : "Opération impossible (erreur de base de données).";
    return e.message;
  }
  return "Opération impossible.";
}

/** Texte journalisable : nom et code d'erreur seulement. */
export function safeLogMessage(e: unknown): string {
  if (e instanceof Error) return `${e.name}${pgCode(e) ? ` (${pgCode(e)})` : ""}`;
  return "erreur";
}
