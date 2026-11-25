"use server";

import { headers } from "next/headers";
import { db } from "@/db/client";
import { processTrial, trialLimiter, type TrialResult } from "@/lib/trial";

export async function submitTrial(_prev: TrialResult | null, formData: FormData): Promise<TrialResult> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "inconnue";
  try {
    return await processTrial(db, Object.fromEntries(formData), ip, trialLimiter);
  } catch (e) {
    console.error("[essai]", e instanceof Error ? e.message : "erreur");
    return { ok: false, fieldErrors: { _form: "Une erreur est survenue. Réessayez dans un instant." } };
  }
}
