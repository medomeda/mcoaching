/**
 * Base vide initiale. Elle contient uniquement la CONFIGURATION par défaut proposée
 * par le PRD (calendrier §7.3, politique §7.4, catégories §12.7, paramètres §21),
 * jamais d'utilisateurs ni de données métier : la démo passe par un seed explicite.
 */
import type { Database, ServiceCalendar, ServicePolicy } from "@/modules/core/types";

export const SCHEMA_VERSION = 1;
export const DEFAULT_CALENDAR_ID = "cal_default";

const DEFAULT_CATEGORIES = [
  ["Compréhension d’un instrument financier", "Actions, obligations, OPCVM, droits de souscription…"],
  ["Fonctionnement de la BRVM", "Séances de cotation, ordres, SGI, règlement-livraison."],
  ["Stratégie d’investissement", "Construction d’une démarche, horizon, diversification."],
  ["Gestion du risque", "Volatilité, exposition, discipline d’investissement."],
  ["Questions générales de portefeuille", "Suivi, organisation et lecture de son portefeuille."],
] as const;

export function createEmptyDatabase(nowIso: string): Database {
  const calendar: ServiceCalendar = {
    id: DEFAULT_CALENDAR_ID,
    name: "Calendrier de service principal",
    timezone: "Africa/Abidjan",
    working_days: [1, 2, 3, 4, 5],
    periods: [
      { start: "08:00", end: "12:00" },
      { start: "13:00", end: "17:00" },
    ],
    is_active: true,
    created_at: nowIso,
    updated_at: nowIso,
  };
  const policy: ServicePolicy = {
    id: "pol_initial",
    calendar_id: calendar.id,
    response_target_working_minutes: 24 * 60,
    reminder_50_enabled: true,
    reminder_75_enabled: true,
    overdue_escalation_working_minutes: 8 * 60,
    calendar_snapshot: { timezone: calendar.timezone, working_days: calendar.working_days, periods: calendar.periods },
    // Valable depuis l'origine : toute date de soumission dispose d'une politique applicable.
    effective_from: "2000-01-01T00:00:00.000Z",
    created_by: null,
    created_at: nowIso,
  };
  return {
    schema_version: SCHEMA_VERSION,
    meta: { initialized_at: nowIso, demo_seeded: false, clock_offset_ms: 0, sequences: {} },
    users: [],
    credentials: [],
    sessions: [],
    auth_tokens: [],
    login_attempts: [],
    coach_profiles: [],
    coach_assignments: [],
    coaching_entitlements: [],
    coaching_quota_ledger: [],
    coach_availability: [],
    coach_absences: [],
    coaching_categories: DEFAULT_CATEGORIES.map(([name, description], i) => ({
      id: `cat_${i + 1}`,
      name,
      description,
      is_active: true,
      sort_order: i + 1,
      created_at: nowIso,
      updated_at: nowIso,
    })),
    coaching_requests: [],
    coaching_request_cycles: [],
    coaching_messages: [],
    message_attachments: [],
    request_reads: [],
    coaching_notes: [],
    request_status_history: [],
    request_assignment_history: [],
    service_calendars: [calendar],
    service_holidays: [],
    service_policies: [policy],
    app_settings: {
      attachment_max_size_bytes: 5 * 1024 * 1024,
      attachment_allowed_extensions: ["pdf", "png", "jpg", "jpeg", "txt", "csv", "docx", "xlsx"],
      attachment_max_files_per_message: 5,
      learner_can_close: false,
      learner_follow_up_reopens_processing: true,
      coach_can_view_ratings: true,
      email_max_attempts: 4,
      demo_email_failure_rate: 0,
      updated_at: nowIso,
      updated_by: null,
    },
    notification_events: [],
    notifications: [],
    email_delivery_logs: [],
    demo_mailbox: [],
    coaching_ratings: [],
    audit_logs: [],
    job_runs: [],
  };
}
