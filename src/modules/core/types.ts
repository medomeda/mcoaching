/**
 * Modèle de données (PRD §12). Les dates sont des chaînes ISO 8601 UTC.
 * Ces types sont partagés par le domaine, la façade d'API et l'interface.
 */

export type ID = string;
export type ISODate = string;

export const ROLES = ["ADMIN", "COACH", "LEARNER"] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ["PENDING_ACTIVATION", "ACTIVE", "SUSPENDED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface User {
  id: ID;
  full_name: string;
  email: string; // normalisé (minuscules, sans espaces)
  phone: string | null;
  role: Role;
  status: UserStatus;
  created_at: ISODate;
  updated_at: ISODate;
  last_login_at: ISODate | null;
  is_demo: boolean;
}

export interface Credential {
  user_id: ID;
  password_hash: string; // PBKDF2-SHA256, base64
  salt: string;
  iterations: number;
  updated_at: ISODate;
}

export interface Session {
  id: ID;
  token_hash: string;
  user_id: ID;
  created_at: ISODate;
  last_seen_at: ISODate;
  expires_at: ISODate;
  revoked_at: ISODate | null;
}

export type AuthTokenPurpose = "ACTIVATION" | "PASSWORD_RESET";
export interface AuthToken {
  id: ID;
  user_id: ID;
  purpose: AuthTokenPurpose;
  token_hash: string;
  expires_at: ISODate;
  used_at: ISODate | null;
  created_at: ISODate;
}

export interface LoginAttempt {
  email: string;
  failures: number;
  locked_until: ISODate | null;
  last_failure_at: ISODate | null;
}

export interface CoachProfile {
  coach_id: ID;
  bio: string;
  specialties: string[];
  updated_at: ISODate;
}

export type AssignmentStatus = "ACTIVE" | "ENDED";
export interface CoachAssignment {
  id: ID;
  learner_id: ID;
  coach_id: ID;
  assigned_by: ID;
  started_at: ISODate;
  ended_at: ISODate | null;
  ended_by: ID | null;
  status: AssignmentStatus;
  reason: string | null;
  end_reason: string | null;
  created_at: ISODate;
}

export type EntitlementStatus = "ACTIVE" | "SUSPENDED" | "EXPIRED";
export interface CoachingEntitlement {
  id: ID;
  learner_id: ID;
  status: EntitlementStatus;
  starts_at: ISODate;
  expires_at: ISODate | null;
  quota_enabled: boolean;
  quota_limit: number | null;
  /** Droit remplacé par un nouveau droit : conservé pour l'historique. */
  superseded_at: ISODate | null;
  created_by: ID;
  updated_by: ID;
  created_at: ISODate;
  updated_at: ISODate;
}

export type QuotaEntryType = "CONSUME" | "REFUND" | "CORRECTION";
/**
 * Convention de signe : `quantity` est signée.
 * CONSUME = -1, REFUND = +n, CORRECTION = ±n.
 * Solde restant = quota_limit + Σ quantity.
 */
export interface QuotaLedgerEntry {
  id: ID;
  learner_id: ID;
  entitlement_id: ID;
  request_id: ID | null;
  entry_type: QuotaEntryType;
  quantity: number;
  reason: string | null;
  created_by: ID;
  created_at: ISODate;
  idempotency_key: string | null;
}

export interface CoachAvailability {
  id: ID;
  coach_id: ID;
  day_of_week: number; // 1 = lundi … 7 = dimanche (ISO)
  start_time: string; // "HH:MM"
  end_time: string;
  is_active: boolean;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface CoachAbsence {
  id: ID;
  coach_id: ID;
  starts_at: ISODate;
  ends_at: ISODate;
  reason: string | null;
  created_at: ISODate;
  cancelled_at: ISODate | null;
}

export interface CoachingCategory {
  id: ID;
  name: string;
  description: string;
  is_active: boolean;
  sort_order: number;
  created_at: ISODate;
  updated_at: ISODate;
}

export const REQUEST_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "WAITING_FOR_COACH",
  "IN_PROGRESS",
  "WAITING_FOR_LEARNER",
  "RESPONSE_PROVIDED",
  "CLOSED",
  "CANCELLED",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const PRIORITIES = ["NORMAL", "HIGH", "URGENT"] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface CoachingRequest {
  id: ID;
  reference: string | null; // attribuée à la soumission : COA-AAAA-NNNNNN
  learner_id: ID;
  coach_id: ID | null;
  category_id: ID;
  subject: string;
  description: string;
  priority: Priority;
  status: RequestStatus;
  submitted_at: ISODate | null;
  /** Champs du cycle courant (copie de coaching_request_cycles pour les filtres). */
  first_response_at: ISODate | null;
  due_at: ISODate | null;
  closed_at: ISODate | null;
  current_cycle_number: number; // 0 tant que brouillon
  submit_idempotency_key: string | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface RequestCycle {
  id: ID;
  request_id: ID;
  cycle_number: number;
  started_at: ISODate;
  closed_at: ISODate | null;
  closed_by: ID | null;
  assigned_coach_id: ID | null;
  first_response_at: ISODate | null;
  first_response_by: ID | null;
  due_at: ISODate;
  policy_id: ID; // politique de service appliquée (historisée)
  reopened_by: ID | null;
  reopen_reason: string | null;
  created_at: ISODate;
}

export type MessageKind = "USER" | "SYSTEM";
export type MessageIntent = "MESSAGE" | "CLARIFICATION_REQUEST" | "FINAL_RESPONSE";
export interface CoachingMessage {
  id: ID;
  request_id: ID;
  cycle_id: ID;
  sender_id: ID | null; // null pour un message système
  kind: MessageKind;
  intent: MessageIntent;
  body: string;
  created_at: ISODate;
}

export interface MessageAttachment {
  id: ID;
  message_id: ID | null; // null = pièce jointe de la description initiale
  request_id: ID;
  uploaded_by: ID;
  original_filename: string;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  created_at: ISODate;
}

export interface RequestRead {
  request_id: ID;
  user_id: ID;
  last_read_at: ISODate;
}

export interface CoachingNote {
  id: ID;
  request_id: ID;
  author_id: ID;
  body: string;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface RequestStatusHistory {
  id: ID;
  request_id: ID;
  cycle_id: ID | null;
  old_status: RequestStatus | null;
  new_status: RequestStatus;
  changed_by: ID | null; // null = système
  reason: string | null;
  created_at: ISODate;
}

export interface RequestAssignmentHistory {
  id: ID;
  request_id: ID;
  cycle_id: ID | null;
  old_coach_id: ID | null;
  new_coach_id: ID;
  changed_by: ID;
  reason: string;
  created_at: ISODate;
}

export interface WorkingPeriod {
  start: string; // "HH:MM"
  end: string;
}

export interface ServiceCalendar {
  id: ID;
  name: string;
  timezone: string;
  working_days: number[]; // ISO 1..7
  periods: WorkingPeriod[];
  is_active: boolean;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface ServiceHoliday {
  id: ID;
  calendar_id: ID;
  holiday_date: string; // "AAAA-MM-JJ" dans le fuseau du calendrier
  label: string;
  created_at: ISODate;
}

/** Politique versionnée : une nouvelle version est créée à chaque modification. */
export interface ServicePolicy {
  id: ID;
  calendar_id: ID;
  response_target_working_minutes: number;
  reminder_50_enabled: boolean;
  reminder_75_enabled: boolean;
  overdue_escalation_working_minutes: number;
  /** Instantané du calendrier au moment de l'entrée en vigueur. */
  calendar_snapshot: Pick<ServiceCalendar, "timezone" | "working_days" | "periods">;
  effective_from: ISODate;
  created_by: ID | null;
  created_at: ISODate;
}

export interface AppSettings {
  attachment_max_size_bytes: number;
  attachment_allowed_extensions: string[];
  attachment_max_files_per_message: number;
  /** PRD §21 — par défaut, seuls les rôles autorisés (coach, admin) clôturent. */
  learner_can_close: boolean;
  /** Ajout : un message de l'apprenant après une réponse finale relance le traitement. */
  learner_follow_up_reopens_processing: boolean;
  /** PRD §5.2 — le coach consulte ses évaluations. */
  coach_can_view_ratings: boolean;
  email_max_attempts: number;
  /** Simulation uniquement : taux d'échec du fournisseur e-mail (0..1). */
  demo_email_failure_rate: number;
  updated_at: ISODate;
  updated_by: ID | null;
}

export type NotificationType =
  | "REQUEST_SUBMITTED"
  | "REQUEST_ASSIGNED"
  | "NEW_MESSAGE"
  | "CLARIFICATION_REQUESTED"
  | "COACH_RESPONSE"
  | "REQUEST_CLOSED"
  | "RATING_AVAILABLE"
  | "RATING_RECEIVED"
  | "DEADLINE_REMINDER"
  | "REQUEST_OVERDUE"
  | "ESCALATION"
  | "REASSIGNMENT"
  | "REQUEST_REOPENED"
  | "NOTIFICATION_FAILURE"
  | "COACH_UNAVAILABLE"
  | "ACCOUNT";

export interface NotificationEvent {
  key: string; // clé unique (anti-doublon)
  created_at: ISODate;
}

export interface AppNotification {
  id: ID;
  user_id: ID;
  type: NotificationType;
  title: string;
  body: string;
  related_request_id: ID | null;
  event_key: string;
  read_at: ISODate | null;
  created_at: ISODate;
}

export type EmailStatus = "PENDING" | "RETRY" | "SENT" | "FAILED";
export interface EmailDeliveryLog {
  id: ID;
  notification_id: ID | null;
  recipient: string;
  template_key: string;
  /** Paramètres non confidentiels du gabarit (référence, nom, lien). */
  template_params: Record<string, string>;
  status: EmailStatus;
  attempt_count: number;
  last_attempt_at: ISODate | null;
  next_attempt_at: ISODate | null;
  sent_at: ISODate | null;
  error_code: string | null;
  created_at: ISODate;
}

/** Boîte de réception simulée (équivalent d'un Mailpit local) — démo uniquement. */
export interface DemoMailboxItem {
  id: ID;
  delivery_id: ID;
  to: string;
  subject: string;
  body: string;
  link: string | null;
  received_at: ISODate;
}

export interface CoachingRating {
  id: ID;
  request_id: ID;
  cycle_id: ID;
  cycle_number: number;
  learner_id: ID;
  coach_id: ID;
  score: number;
  comment: string | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface AuditLog {
  id: ID;
  actor_id: ID | null;
  action: string;
  entity_type: string;
  entity_id: ID | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: ISODate;
}

export interface JobRun {
  id: ID;
  job: string;
  started_at: ISODate;
  finished_at: ISODate;
  ok: boolean;
  summary: string;
  error: string | null;
}

export interface Database {
  schema_version: number;
  meta: {
    initialized_at: ISODate;
    demo_seeded: boolean;
    /** Décalage de l'horloge simulée (démo) en millisecondes. */
    clock_offset_ms: number;
    sequences: Record<string, number>;
  };
  users: User[];
  credentials: Credential[];
  sessions: Session[];
  auth_tokens: AuthToken[];
  login_attempts: LoginAttempt[];
  coach_profiles: CoachProfile[];
  coach_assignments: CoachAssignment[];
  coaching_entitlements: CoachingEntitlement[];
  coaching_quota_ledger: QuotaLedgerEntry[];
  coach_availability: CoachAvailability[];
  coach_absences: CoachAbsence[];
  coaching_categories: CoachingCategory[];
  coaching_requests: CoachingRequest[];
  coaching_request_cycles: RequestCycle[];
  coaching_messages: CoachingMessage[];
  message_attachments: MessageAttachment[];
  request_reads: RequestRead[];
  coaching_notes: CoachingNote[];
  request_status_history: RequestStatusHistory[];
  request_assignment_history: RequestAssignmentHistory[];
  service_calendars: ServiceCalendar[];
  service_holidays: ServiceHoliday[];
  service_policies: ServicePolicy[];
  app_settings: AppSettings;
  notification_events: NotificationEvent[];
  notifications: AppNotification[];
  email_delivery_logs: EmailDeliveryLog[];
  demo_mailbox: DemoMailboxItem[];
  coaching_ratings: CoachingRating[];
  audit_logs: AuditLog[];
  job_runs: JobRun[];
}
