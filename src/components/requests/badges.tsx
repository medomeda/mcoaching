"use client";
import { AlarmClock, AlertOctagon, CheckCircle2, CircleDot, Flag, Hourglass } from "lucide-react";
import type { Priority, RequestStatus } from "@/modules/core/types";
import type { RequestSummary } from "@/server/api/views";
import { Badge } from "@/components/ui/display";
import { PRIORITY_LABELS, STATUS_LABELS, STATUS_TONE } from "@/lib/labels";
import { fmtWorkingMinutes } from "@/lib/format";

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} icon={<CircleDot className="h-3 w-3" aria-hidden />}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority, hideNormal }: { priority: Priority; hideNormal?: boolean }) {
  if (hideNormal && priority === "NORMAL") return null;
  const tone = priority === "URGENT" ? "danger" : priority === "HIGH" ? "warning" : "neutral";
  return (
    <Badge tone={tone} icon={<Flag className="h-3 w-3" aria-hidden />}>
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

/** Indicateur de délai calculé — distinct du statut métier (PRD §7.4). */
export function SlaBadge({ sla }: { sla: RequestSummary["sla"] }) {
  if (!sla) return null;
  if (sla.is_overdue) {
    return (
      <Badge tone="danger" icon={<AlertOctagon className="h-3 w-3" aria-hidden />}>
        En retard · {fmtWorkingMinutes(sla.overdue_minutes, "")}
      </Badge>
    );
  }
  if (sla.due_soon) {
    return (
      <Badge tone="warning" icon={<AlarmClock className="h-3 w-3" aria-hidden />}>
        Échéance proche
      </Badge>
    );
  }
  if (sla.awaiting_first_response) {
    return (
      <Badge tone="info" icon={<Hourglass className="h-3 w-3" aria-hidden />}>
        Délai : {Math.round(sla.ratio * 100)} %
      </Badge>
    );
  }
  if (sla.responded_on_time === true) {
    return (
      <Badge tone="success" icon={<CheckCircle2 className="h-3 w-3" aria-hidden />}>
        Répondu dans les délais
      </Badge>
    );
  }
  if (sla.responded_on_time === false) {
    return (
      <Badge tone="warning" icon={<AlarmClock className="h-3 w-3" aria-hidden />}>
        Répondu hors délai
      </Badge>
    );
  }
  return null;
}

export function SlaBar({ sla }: { sla: RequestSummary["sla"] }) {
  if (!sla || !sla.awaiting_first_response) return null;
  const pct = Math.min(100, Math.round(sla.ratio * 100));
  const color = sla.is_overdue ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-brand-500";
  return (
    <div className="space-y-1">
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Délai de première réponse consommé">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-slate-500">
        {fmtWorkingMinutes(sla.elapsed_minutes)} écoulées sur {fmtWorkingMinutes(sla.target_minutes)}
      </p>
    </div>
  );
}
