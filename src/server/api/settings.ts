/**
 * Paramètres de service (PRD §7.3, §7.4, §9.9, §21). Toute modification est auditée.
 * Le calendrier et la politique sont VERSIONNÉS : une modification crée une nouvelle
 * politique applicable aux soumissions futures, les échéances existantes restent inchangées (REC-15).
 */
import { z } from "zod";
import { businessRule, conflict, notFound, validation } from "@/modules/core/errors";
import type { Database, ServicePolicy } from "@/modules/core/types";
import { validateCalendar } from "@/modules/deadlines/businessHours";
import { isValidTimeZone } from "@/modules/deadlines/zonedTime";
import { newId } from "../crypto";
import { audit, policyAt, userName } from "../db/helpers";
import { DEFAULT_CALENDAR_ID } from "../db/schema";
import { SUPPORTED_EXTENSIONS } from "../files/validation";
import { authenticate, parse, reauth, store, zReason, zText, type Call } from "./context";

const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide (HH:MM).");

function calendar(db: Database) {
  const c = db.service_calendars.find((x) => x.id === DEFAULT_CALENDAR_ID);
  if (!c) throw new Error("Calendrier de service introuvable.");
  return c;
}

export async function getServiceSettings(call: Call) {
  await authenticate(call, "ADMIN");
  const db = store().snapshot();
  const now = store().now(db);
  return {
    calendar: calendar(db),
    holidays: [...db.service_holidays].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)),
    current_policy: policyAt(db, now),
    policies: [...db.service_policies]
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
      .map((p) => ({ ...p, created_by_name: p.created_by ? userName(db, p.created_by) : "Configuration initiale" })),
    app: db.app_settings,
    supported_extensions: SUPPORTED_EXTENSIONS,
  };
}

/** Catégories actives : lisibles par tout utilisateur connecté (formulaire de demande). */
export async function listCategories(call: Call, includeInactive = false) {
  const a = await authenticate(call);
  const db = store().snapshot();
  return [...db.coaching_categories]
    .filter((c) => c.is_active || (includeInactive && a.actor.role === "ADMIN"))
    .sort((x, y) => x.sort_order - y.sort_order);
}

export async function updateServicePolicy(call: Call, input: unknown) {
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
  return store().transaction((db, now) => {
    reauth(db, a);
    const cal = calendar(db);
    const iso = now.toISOString();
    const before = policyAt(db, now);
    cal.timezone = data.timezone;
    cal.working_days = [...new Set(data.working_days)].sort();
    cal.periods = [...data.periods].sort((x, y) => x.start.localeCompare(y.start));
    cal.updated_at = iso;
    const policy: ServicePolicy = {
      id: newId("pol"),
      calendar_id: cal.id,
      response_target_working_minutes: Math.round(data.response_target_hours * 60),
      reminder_50_enabled: data.reminder_50_enabled,
      reminder_75_enabled: data.reminder_75_enabled,
      overdue_escalation_working_minutes: Math.round(data.overdue_escalation_hours * 60),
      calendar_snapshot: { timezone: cal.timezone, working_days: cal.working_days, periods: cal.periods },
      effective_from: iso,
      created_by: a.user.id,
      created_at: iso,
    };
    db.service_policies.push(policy);
    audit(db, now, {
      actor_id: a.user.id,
      action: "SERVICE_POLICY_UPDATED",
      entity_type: "service_policy",
      entity_id: policy.id,
      reason: data.reason,
      metadata: { previous_policy_id: before.id, target_minutes: policy.response_target_working_minutes, escalation_minutes: policy.overdue_escalation_working_minutes, calendar: policy.calendar_snapshot },
    });
    return policy;
  });
}

export async function addHoliday(call: Call, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ holiday_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide."), label: zText(2, 100, "Le libellé") }), input);
  await store().transaction((db, now) => {
    reauth(db, a);
    if (db.service_holidays.some((h) => h.calendar_id === DEFAULT_CALENDAR_ID && h.holiday_date === data.holiday_date)) {
      throw conflict("Cette date est déjà déclarée comme fermée.");
    }
    const h = { id: newId("hol"), calendar_id: DEFAULT_CALENDAR_ID, holiday_date: data.holiday_date, label: data.label, created_at: now.toISOString() };
    db.service_holidays.push(h);
    audit(db, now, { actor_id: a.user.id, action: "HOLIDAY_ADDED", entity_type: "service_holiday", entity_id: h.id, reason: null, metadata: { date: h.holiday_date, label: h.label } });
  });
}

export async function removeHoliday(call: Call, id: string) {
  const a = await authenticate(call, "ADMIN");
  await store().transaction((db, now) => {
    reauth(db, a);
    const h = db.service_holidays.find((x) => x.id === id);
    if (!h) throw notFound("Jour de fermeture introuvable.");
    db.service_holidays = db.service_holidays.filter((x) => x.id !== id);
    audit(db, now, { actor_id: a.user.id, action: "HOLIDAY_REMOVED", entity_type: "service_holiday", entity_id: id, reason: null, metadata: { date: h.holiday_date, label: h.label } });
  });
}

export async function updateAppSettings(call: Call, input: unknown) {
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
  await store().transaction((db, now) => {
    reauth(db, a);
    const before = { ...db.app_settings };
    db.app_settings = {
      ...db.app_settings,
      attachment_max_size_bytes: Math.round(data.attachment_max_size_mb * 1024 * 1024),
      attachment_allowed_extensions: data.attachment_allowed_extensions,
      attachment_max_files_per_message: data.attachment_max_files_per_message,
      learner_can_close: data.learner_can_close,
      learner_follow_up_reopens_processing: data.learner_follow_up_reopens_processing,
      coach_can_view_ratings: data.coach_can_view_ratings,
      email_max_attempts: data.email_max_attempts,
      updated_at: now.toISOString(),
      updated_by: a.user.id,
    };
    audit(db, now, { actor_id: a.user.id, action: "APP_SETTINGS_UPDATED", entity_type: "app_settings", entity_id: null, reason: data.reason, metadata: { before, after: db.app_settings } });
  });
}

const zCategory = z.object({ name: zText(3, 80, "Le nom"), description: z.string().trim().max(300).default(""), is_active: z.boolean().default(true) });

export async function saveCategory(call: Call, id: string | null, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(zCategory, input);
  await store().transaction((db, now) => {
    reauth(db, a);
    const iso = now.toISOString();
    if (db.coaching_categories.some((c) => c.name.toLowerCase() === data.name.toLowerCase() && c.id !== id)) {
      throw conflict("Une catégorie porte déjà ce nom.");
    }
    if (id) {
      const c = db.coaching_categories.find((x) => x.id === id);
      if (!c) throw notFound("Catégorie introuvable.");
      const before = { name: c.name, is_active: c.is_active };
      Object.assign(c, data, { updated_at: iso });
      audit(db, now, { actor_id: a.user.id, action: "CATEGORY_UPDATED", entity_type: "coaching_category", entity_id: c.id, reason: null, metadata: { before, after: data } });
    } else {
      const c = { id: newId("cat"), ...data, sort_order: db.coaching_categories.length + 1, created_at: iso, updated_at: iso };
      db.coaching_categories.push(c);
      audit(db, now, { actor_id: a.user.id, action: "CATEGORY_CREATED", entity_type: "coaching_category", entity_id: c.id, reason: null, metadata: { name: c.name } });
    }
    if (!db.coaching_categories.some((c) => c.is_active)) throw businessRule("Au moins une catégorie doit rester active.");
  });
}

export async function moveCategory(call: Call, id: string, direction: -1 | 1) {
  const a = await authenticate(call, "ADMIN");
  await store().transaction((db, now) => {
    reauth(db, a);
    const sorted = [...db.coaching_categories].sort((x, y) => x.sort_order - y.sort_order);
    const i = sorted.findIndex((c) => c.id === id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j]!, sorted[i]!];
    sorted.forEach((c, k) => {
      c.sort_order = k + 1;
      c.updated_at = now.toISOString();
    });
  });
}
