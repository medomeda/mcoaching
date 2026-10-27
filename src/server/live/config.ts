/** Lecture de la configuration de service (paramètres, politique applicable, fériés, catégories). */
import { asc, desc, eq, lte } from "drizzle-orm";
import { validation } from "@/modules/core/errors";
import type { AppSettings, ServicePolicy } from "@/modules/core/types";
import { appSettings, coachingCategory, serviceHoliday, servicePolicy } from "../pg/schema";
import type { Tx } from "./helpers";
import { iso, toHoliday, toPolicy } from "./mappers";

export async function getAppSettings(tx: Tx): Promise<AppSettings> {
  const [s] = await tx.select().from(appSettings).where(eq(appSettings.id, "app"));
  if (!s) throw new Error("Paramètres applicatifs absents : exécutez `npm run db:migrate`.");
  return {
    attachment_max_size_bytes: s.attachmentMaxSizeBytes,
    attachment_allowed_extensions: s.attachmentAllowedExtensions,
    attachment_max_files_per_message: s.attachmentMaxFilesPerMessage,
    learner_can_close: s.learnerCanClose,
    learner_follow_up_reopens_processing: s.learnerFollowUpReopensProcessing,
    coach_can_view_ratings: s.coachCanViewRatings,
    email_max_attempts: s.emailMaxAttempts,
    demo_email_failure_rate: 0,
    updated_at: s.updatedAt.toISOString(),
    updated_by: s.updatedBy,
  };
}

/** Politique applicable à une date (la plus récente dont `effective_from` ≤ date). */
export async function policyAt(tx: Tx, at: Date): Promise<ServicePolicy> {
  const [p] = await tx.select().from(servicePolicy).where(lte(servicePolicy.effectiveFrom, at)).orderBy(desc(servicePolicy.effectiveFrom)).limit(1);
  const fallback = p ?? (await tx.select().from(servicePolicy).orderBy(asc(servicePolicy.effectiveFrom)).limit(1))[0];
  if (!fallback) throw new Error("Aucune politique de service configurée : exécutez `npm run db:migrate`.");
  return toPolicy(fallback);
}

export async function allHolidays(tx: Tx) {
  return (await tx.select().from(serviceHoliday)).map(toHoliday);
}

export async function allCategories(tx: Tx) {
  return (await tx.select().from(coachingCategory).orderBy(asc(coachingCategory.sortOrder))).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    is_active: c.isActive,
    sort_order: c.sortOrder,
    created_at: c.createdAt.toISOString(),
    updated_at: iso(c.updatedAt)!,
  }));
}

export async function assertActiveCategory(tx: Tx, id: string) {
  const [c] = await tx.select({ isActive: coachingCategory.isActive }).from(coachingCategory).where(eq(coachingCategory.id, id));
  if (!c || !c.isActive) throw validation("Catégorie invalide.", { category_id: "Catégorie invalide ou désactivée." });
}
