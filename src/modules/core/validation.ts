/** Validation des entrées partagée par la façade simulée et le serveur PostgreSQL. */
import { z } from "zod";
import { validation } from "./errors";

export function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const k = issue.path.join(".") || "_";
    if (!fieldErrors[k]) fieldErrors[k] = issue.message;
  }
  throw validation("Certains champs sont invalides.", fieldErrors);
}

export const zText = (min: number, max: number, label: string) =>
  z
    .string({ required_error: `${label} est requis.` })
    .trim()
    .min(min, min <= 1 ? `${label} est requis.` : `${label} : ${min} caractères minimum.`)
    .max(max, `${label} : ${max} caractères maximum.`);

export const zReason = (label = "Le motif") => zText(3, 500, label);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const zEmail = z.string().trim().email("Adresse e-mail invalide.").max(254).transform(normalizeEmail);

export const zPhone = z.string().trim().max(30).regex(/^[+0-9 ()-]*$/, "Numéro de téléphone invalide.").optional().nullable();
