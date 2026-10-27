/**
 * Paramètres de service (PRD §7.3, §7.4, §9.9, §21) sur PostgreSQL. Toute modification est auditée.
 * Le calendrier et la politique sont VERSIONNÉS : une modification crée une nouvelle politique
 * applicable aux soumissions futures, les échéances existantes restent inchangées (REC-15).
 */
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { businessRule, conflict, notFound, validation } from "@/modules/core/errors";
import { parse, zReason, zText } from "@/modules/core/validation";
import { validateCalendar } from "@/modules/deadlines/businessHours";
import { isValidTimeZone } from "@/modules/deadlines/zonedTime";
import { newId } from "../crypto";
import { SUPPORTED_EXTENSIONS } from "../files/validation";
import { db } from "../pg/client";
import { appSettings, coachingCategory, serviceCalendar, serviceHoliday, servicePolicy } from "../pg/schema";
import { allCategories, getAppSettings, policyAt } from "./config";
import { authenticate, type LiveCall } from "./context";
import { audit, nameIn, namesOf, type Tx } from "./helpers";
import { toPolicy } from "./mappers";

const DEFAULT_CALENDAR_ID = "cal_default";
const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide (HH:MM).");

async function calendar(tx: Tx, lock = false) {
  const q = tx.select().from(serviceCalendar).where(eq(serviceCalendar.id, DEFAULT_CALENDAR_ID));
  const [c] = await (lock ? q.for("update") : q);
  if (!c) throw new Error("Calendrier de service introuvable : exécutez `npm run db:migrate`.");
  return {
    id: c.id,
    name: c.name,
    timezone: c.timezone,
    working_days: c.workingDays,
    periods: c.periods,
    is_active: c.isActive,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
  };
}

export async function getServiceSettings(call: LiveCall) {
  await authenticate(call, "ADMIN");
  const now = new Date();
  const policies = await db.select().from(servicePolicy).orderBy(desc(servicePolicy.effectiveFrom));
  const names = await namesOf(db, policies.map((p) => p.createdBy));
  const holidays = await db.select().from(serviceHoliday).orderBy(asc(serviceHoliday.holidayDate));
  return {
    calendar: await calendar(db),
    holidays: holidays.map((h) => ({ id: h.id, calendar_id: h.calendarId, holiday_date: h.holidayDate, label: h.label, created_at: h.createdAt.toISOString() })),
    current_policy: await policyAt(db, now),
    policies: policies.map((p) => ({ ...toPolicy(p), created_by_name: p.createdBy ? nameIn(names, p.createdBy) : "Configuration initiale" })),
    app: await getAppSettings(db),
    supported_extensions: SUPPORTED_EXTENSIONS,
  };
}

/** Catégories actives : lisibles par tout utilisateur connecté (formulaire de demande). */
export async function listCategories(call: LiveCall, includeInactive = false) {
  const a = await authenticate(call);
  return (await allCategories(db)).filter((c) => c.is_active || (includeInactive === true && a.actor.role === "ADMIN"));
}

export async function updateServicePolicy(call: LiveCall, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(
    z.object({
      timezone: z.string().min(1),
      working_days: z.array(z.number().int().min(1).max(7)).min(1, "Au moins un jour ouvré."),
      periods: z.array(z.object({ start: zTime, end: zTime })).min(1, "Au moins une plage horaire.").max(6),
      response_target_hours: z.number().min(1, "Minimum 1 heure.").max(500),
      reminder_50_enabled: z.boolean(),
      reminder_75_enabled: z.boolean(),
      overdue_escalation_hours: z.number().min(0.5, "Minimum 30 minutes.").max(500),
      reason: zReason(),
    }),
    input,
  );
  if (!isValidTimeZone(data.timezone)) throw validation("Fuseau horaire invalide.", { timezone: "Fuseau horaire IANA invalide." });
  const err = validateCalendar({ timezone: data.timezone, working_days: data.working_days, periods: data.periods });
  if (err) throw validation(err, { periods: err });
  return db.transaction(async (tx) => {
    // Verrou sur le calendrier : deux modifications simultanées produisent deux versions successives.
    const cal = await calendar(tx, true);
    const now = new Date();
    const before = await policyAt(tx, now);
    const workingDays = [...new Set(data.working_days)].sort();
    const periods = [...data.periods].sort((x, y) => x.start.localeCompare(y.start));
    await tx.update(serviceCalendar).set({ timezone: data.timezone, workingDays, periods, updatedAt: now }).where(eq(serviceCalendar.id, cal.id));
    const [policy] = await tx
      .insert(servicePolicy)
      .values({
        id: newId("pol"),
        calendarId: cal.id,
        responseTargetWorkingMinutes: Math.round(data.response_target_hours * 60),
        reminder50Enabled: data.reminder_50_enabled,
        reminder75Enabled: data.reminder_75_enabled,
        overdueEscalationWorkingMinutes: Math.round(data.overdue_escalation_hours * 60),
        calendarSnapshot: { timezone: data.timezone, working_days: workingDays, periods },
        effectiveFrom: now,
        createdBy: a.user.id,
        createdAt: now,
      })
      .returning();
    const created = toPolicy(policy!);
    await audit(tx, {
      actor_id: a.user.id,
      action: "SERVICE_POLICY_UPDATED",
      entity_type: "service_policy",
      entity_id: created.id,
      reason: data.reason,
      metadata: {
        previous_policy_id: before.id,
        target_minutes: created.response_target_working_minutes,
        escalation_minutes: created.overdue_escalation_working_minutes,
        calendar: created.calendar_snapshot,
      },
    });
    return created;
  });
}

export async function addHoliday(call: LiveCall, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ holiday_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide."), label: zText(2, 100, "Le libellé") }), input);
  await db.transaction(async (tx) => {
    const [h] = await tx
      .insert(serviceHoliday)
      .values({ id: newId("hol"), calendarId: DEFAULT_CALENDAR_ID, holidayDate: data.holiday_date, label: data.label })
      .onConflictDoNothing()
      .returning();
    if (!h) throw conflict("Cette date est déjà déclarée comme fermée.");
    await audit(tx, { actor_id: a.user.id, action: "HOLIDAY_ADDED", entity_type: "service_holiday", entity_id: h.id, reason: null, metadata: { date: h.holidayDate, label: h.label } });
  });
}

export async function removeHoliday(call: LiveCall, id: string) {
  const a = await authenticate(call, "ADMIN");
  await db.transaction(async (tx) => {
    const [h] = await tx.delete(serviceHoliday).where(eq(serviceHoliday.id, String(id))).returning();
    if (!h) throw notFound("Jour de fermeture introuvable.");
    await audit(tx, { actor_id: a.user.id, action: "HOLIDAY_REMOVED", entity_type: "service_holiday", entity_id: h.id, reason: null, metadata: { date: h.holidayDate, label: h.label } });
  });
}

export async function updateAppSettings(call: LiveCall, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(
    z.object({
      attachment_max_size_mb: z.number().min(0.1).max(25, "25 Mo maximum."),
      attachment_allowed_extensions: z.array(z.enum(SUPPORTED_EXTENSIONS as [string, ...string[]])).min(1, "Au moins un format."),
      attachment_max_files_per_message: z.number().int().min(1).max(10),
      learner_can_close: z.boolean(),
      learner_follow_up_reopens_processing: z.boolean(),
      coach_can_view_ratings: z.boolean(),
      email_max_attempts: z.number().int().min(1).max(10),
      reason: zReason(),
    }),
    input,
  );
  await db.transaction(async (tx) => {
    await tx.select({ id: appSettings.id }).from(appSettings).where(eq(appSettings.id, "app")).for("update");
    const before = await getAppSettings(tx);
    await tx
      .update(appSettings)
      .set({
        attachmentMaxSizeBytes: Math.round(data.attachment_max_size_mb * 1024 * 1024),
        attachmentAllowedExtensions: data.attachment_allowed_extensions,
        attachmentMaxFilesPerMessage: data.attachment_max_files_per_message,
        learnerCanClose: data.learner_can_close,
        learnerFollowUpReopensProcessing: data.learner_follow_up_reopens_processing,
        coachCanViewRatings: data.coach_can_view_ratings,
        emailMaxAttempts: data.email_max_attempts,
        updatedAt: new Date(),
        updatedBy: a.user.id,
      })
      .where(eq(appSettings.id, "app"));
    await audit(tx, {
      actor_id: a.user.id,
      action: "APP_SETTINGS_UPDATED",
      entity_type: "app_settings",
      entity_id: null,
      reason: data.reason,
      metadata: { before, after: await getAppSettings(tx) },
    });
  });
}

const zCategory = z.object({ name: zText(3, 80, "Le nom"), description: z.string().trim().max(300).default(""), is_active: z.boolean().default(true) });

/** Verrou applicatif sur l'ensemble des catégories (unicité du nom, ordre, au moins une active). */
const lockCategories = (tx: Tx) => tx.execute(sql`select pg_advisory_xact_lock(hashtext('coaching_categories'))`);

export async function saveCategory(call: LiveCall, id: string | null, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(zCategory, input);
  await db.transaction(async (tx) => {
    await lockCategories(tx);
    const [same] = await tx
      .select({ id: coachingCategory.id })
      .from(coachingCategory)
      .where(and(sql`lower(${coachingCategory.name}) = lower(${data.name})`, id ? ne(coachingCategory.id, id) : undefined));
    if (same) throw conflict("Une catégorie porte déjà ce nom.");
    const now = new Date();
    if (id) {
      const [c] = await tx.select().from(coachingCategory).where(eq(coachingCategory.id, String(id)));
      if (!c) throw notFound("Catégorie introuvable.");
      await tx.update(coachingCategory).set({ name: data.name, description: data.description, isActive: data.is_active, updatedAt: now }).where(eq(coachingCategory.id, c.id));
      await audit(tx, {
        actor_id: a.user.id,
        action: "CATEGORY_UPDATED",
        entity_type: "coaching_category",
        entity_id: c.id,
        reason: null,
        metadata: { before: { name: c.name, is_active: c.isActive }, after: data },
      });
    } else {
      const total = (await tx.select({ n: sql<number>`count(*)::int` }).from(coachingCategory))[0]?.n ?? 0;
      const newIdValue = newId("cat");
      await tx.insert(coachingCategory).values({ id: newIdValue, name: data.name, description: data.description, isActive: data.is_active, sortOrder: total + 1, createdAt: now, updatedAt: now });
      await audit(tx, { actor_id: a.user.id, action: "CATEGORY_CREATED", entity_type: "coaching_category", entity_id: newIdValue, reason: null, metadata: { name: data.name } });
    }
    const [active] = await tx.select({ id: coachingCategory.id }).from(coachingCategory).where(eq(coachingCategory.isActive, true)).limit(1);
    if (!active) throw businessRule("Au moins une catégorie doit rester active.");
  });
}

export async function moveCategory(call: LiveCall, id: string, direction: -1 | 1) {
  await authenticate(call, "ADMIN");
  await db.transaction(async (tx) => {
    await lockCategories(tx);
    const sorted = await tx.select({ id: coachingCategory.id }).from(coachingCategory).orderBy(asc(coachingCategory.sortOrder), asc(coachingCategory.id));
    const i = sorted.findIndex((c) => c.id === id);
    const j = i + (direction === -1 ? -1 : 1);
    if (i < 0 || j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j]!, sorted[i]!];
    const now = new Date();
    for (const [k, c] of sorted.entries()) {
      await tx.update(coachingCategory).set({ sortOrder: k + 1, updatedAt: now }).where(eq(coachingCategory.id, c.id));
    }
  });
}
