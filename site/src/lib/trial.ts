import { sql } from "drizzle-orm";
import { z } from "zod";
import { prospect } from "@/db/schema";
import type { SiteDb } from "@/db/client";
import { createRateLimiter } from "./rate-limit";

export const normalizeEmail = (s: string) => s.trim().toLowerCase();

const text = (max: number) => z.string().trim().max(max);

export const zTrialRequest = z.object({
  name: z.string().trim().min(2, "Indiquez votre nom.").max(120),
  email: z.string().trim().email("Adresse e-mail invalide.").max(200),
  phone: text(40).optional().transform((v) => v || null),
  activity: text(200).optional().transform((v) => v ?? ""),
  message: text(2000).optional().transform((v) => v ?? ""),
  consent: z.preprocess((v) => v === "on" || v === "true" || v === true, z.literal(true, { errorMap: () => ({ message: "Votre consentement est nécessaire pour vous répondre." }) })),
  website: z.string().optional(),
});

/** `values` : champs saisis, renvoyés en cas d'erreur pour que le formulaire (réinitialisé par React après l'action) ne soit pas vidé. */
export type TrialResult = { ok: true } | { ok: false; fieldErrors: Record<string, string>; values?: Record<string, string> };

const ECHOED = ["name", "email", "phone", "activity", "message"] as const;
const echo = (input: Record<string, unknown>): Record<string, string> => Object.fromEntries(ECHOED.map((k) => [k, typeof input[k] === "string" ? (input[k] as string) : ""]));

/** Une demande d'essai par IP et par heure : 5 maximum (mémoire du processus). */
export const trialLimiter = createRateLimiter({ max: 5, windowMs: 3600_000 });

type Writer = Pick<SiteDb, "insert">;

export async function processTrial(db: Writer, input: Record<string, unknown>, ip: string, allow: (key: string) => boolean): Promise<TrialResult> {
  const parsed = zTrialRequest.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    const fieldErrors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) fieldErrors[k] = v[0];
    return { ok: false, fieldErrors, values: echo(input) };
  }
  // Champ piège rempli : un robot. Réponse identique à un succès, rien n'est enregistré.
  if (parsed.data.website) return { ok: true };
  if (!allow(ip)) return { ok: false, fieldErrors: { _form: "Trop de demandes depuis votre connexion. Réessayez plus tard." }, values: echo(input) };

  const d = parsed.data;
  await db
    .insert(prospect)
    .values({ name: d.name, email: d.email, emailNormalized: normalizeEmail(d.email), phone: d.phone, activity: d.activity, message: d.message, consent: true })
    .onConflictDoUpdate({
      target: prospect.emailNormalized,
      set: { name: d.name, phone: d.phone, activity: d.activity, message: d.message, updatedAt: sql`now()` },
    });
  return { ok: true };
}
