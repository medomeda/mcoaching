/** Alertes du tableau de bord : fonction pure, calculées à l'affichage (jamais stockées). Seuils : voir contraintes globales du plan. */

export type AlertKind = "OFFLINE" | "TRIAL_ENDING" | "OVERDUE" | "NEW_PROSPECT" | "NEAR_LIMIT" | "INACTIVE";
export type Severity = "critical" | "warning" | "info";
export interface Alert {
  kind: AlertKind;
  severity: Severity;
  clientId?: string;
  message: string;
}

export interface ClientState {
  id: string;
  name: string;
  instanceHost: string | null;
  status: "ESSAI" | "ACTIF" | "IMPAYE" | "SUSPENDU" | "RESILIE";
  createdAt: Date;
  planId: string | null;
  trialEndsOn: string | null;
  nextDueOn: string | null;
  /** Début de la série d'échecs de santé en cours (null = en ligne ou jamais contrôlé). */
  offlineSince: Date | null;
  /** Dernier relevé d'usage connu. */
  usage: { suspended: boolean; coaches_active: number; members_active: number; last_activity_at: string | null } | null;
}

export const OFFLINE_AFTER_MINUTES = 15;
export const TRIAL_WARNING_DAYS = 7;
export const INACTIVE_AFTER_DAYS = 14;
export const NEAR_LIMIT_RATIO = 0.9;

const DAY = 86_400_000;
const dayStart = (s: string) => new Date(`${s}T00:00:00Z`).getTime();

/** Début de la série d'échecs en cours ; `checks` du plus récent au plus ancien. */
export function offlineSince(checks: { checkedAt: Date; ok: boolean }[]): Date | null {
  if (checks.length === 0 || checks[0]!.ok) return null;
  let since = checks[0]!.checkedAt;
  for (const c of checks) {
    if (c.ok) break;
    since = c.checkedAt;
  }
  return since;
}

const ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

export function computeAlerts(input: {
  now: Date;
  clients: ClientState[];
  newProspects: number;
  plans: Map<string, { maxCoaches: number | null; maxMembers: number | null }>;
}): Alert[] {
  const { now } = input;
  const today = dayStart(now.toISOString().slice(0, 10));
  const out: Alert[] = [];

  for (const c of input.clients) {
    if (c.status === "RESILIE") continue;
    const suspended = c.status === "SUSPENDU" || c.usage?.suspended === true;
    const who = c.instanceHost ? `${c.name} (${c.instanceHost})` : c.name;

    if (!suspended && c.offlineSince && now.getTime() - c.offlineSince.getTime() > OFFLINE_AFTER_MINUTES * 60_000) {
      out.push({ kind: "OFFLINE", severity: "critical", clientId: c.id, message: `${who} est hors ligne depuis plus de ${OFFLINE_AFTER_MINUTES} minutes.` });
    }
    if (c.status === "ESSAI" && c.trialEndsOn) {
      const left = Math.round((dayStart(c.trialEndsOn) - today) / DAY);
      if (left < 0) out.push({ kind: "TRIAL_ENDING", severity: "warning", clientId: c.id, message: `L’essai de ${who} est terminé depuis ${-left} jour(s).` });
      else if (left <= TRIAL_WARNING_DAYS) out.push({ kind: "TRIAL_ENDING", severity: "warning", clientId: c.id, message: `L’essai de ${who} se termine dans ${left} jour(s).` });
    }
    if (c.nextDueOn && dayStart(c.nextDueOn) < today) {
      out.push({ kind: "OVERDUE", severity: "critical", clientId: c.id, message: `L’échéance de ${who} est dépassée.` });
    }
    const limits = c.planId ? input.plans.get(c.planId) : undefined;
    if (limits && c.usage) {
      const near = (used: number, max: number | null) => max !== null && max > 0 && used / max >= NEAR_LIMIT_RATIO;
      if (near(c.usage.members_active, limits.maxMembers) || near(c.usage.coaches_active, limits.maxCoaches)) {
        out.push({ kind: "NEAR_LIMIT", severity: "warning", clientId: c.id, message: `${who} approche d’une limite de sa formule.` });
      }
    }
    if (!suspended && c.usage) {
      const last = c.usage.last_activity_at ? new Date(c.usage.last_activity_at).getTime() : null;
      const reference = last ?? c.createdAt.getTime();
      if (now.getTime() - reference > INACTIVE_AFTER_DAYS * DAY) {
        out.push({ kind: "INACTIVE", severity: "info", clientId: c.id, message: `Aucune activité chez ${who} depuis plus de ${INACTIVE_AFTER_DAYS} jours.` });
      }
    }
  }
  if (input.newProspects > 0) {
    out.push({ kind: "NEW_PROSPECT", severity: "info", message: `${input.newProspects} nouvelle(s) demande(s) d’essai à traiter.` });
  }
  return out.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}
