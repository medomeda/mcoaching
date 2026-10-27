"use client";
import { ArrowRightLeft, BellRing, CalendarClock, CheckCircle2, Flag, Hand, RotateCcw, Star, Undo2, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PRIORITIES, type Priority } from "@/modules/core/types";
import type { RequestDetail } from "@/server/api/requests";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, FormError, Select, Textarea } from "@/components/ui/form";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { PRIORITY_LABELS } from "@/lib/labels";
import { fmtWorkingMinutes } from "@/lib/format";

type DialogKey = "cancel" | "close" | "reopen" | "reassign" | "recalc" | "priority" | "refund" | "nudge" | "rate" | null;

export function RequestActions({ detail }: { detail: RequestDetail }) {
  const a = new Set(detail.allowed_actions);
  const [open, setOpen] = useState<DialogKey>(null);
  const take = useAction(() => api.requests.takeCharge(detail.id), { success: "Demande prise en charge." });
  const set = (k: DialogKey) => (v: boolean) => setOpen(v ? k : null);

  const any = ["TAKE_CHARGE", "CLOSE", "CANCEL", "REOPEN", "REASSIGN", "RECALCULATE_DUE", "SET_PRIORITY", "REFUND", "NUDGE_COACH", "RATE"].some((x) => a.has(x as never));
  if (!any) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {a.has("TAKE_CHARGE") && (
        <Button size="sm" icon={<Hand className="h-4 w-4" />} loading={take.pending} onClick={() => void take.run()}>
          Prendre en charge
        </Button>
      )}
      {a.has("RATE") && (
        <Button size="sm" icon={<Star className="h-4 w-4" />} onClick={() => setOpen("rate")}>
          Évaluer l’accompagnement
        </Button>
      )}
      {a.has("CLOSE") && (
        <Button size="sm" variant="secondary" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setOpen("close")}>
          Clôturer
        </Button>
      )}
      {a.has("REASSIGN") && (
        <Button size="sm" variant="outline" icon={<ArrowRightLeft className="h-4 w-4" />} onClick={() => setOpen("reassign")}>
          Réaffecter
        </Button>
      )}
      {a.has("NUDGE_COACH") && (
        <Button size="sm" variant="outline" icon={<BellRing className="h-4 w-4" />} onClick={() => setOpen("nudge")}>
          Relancer le coach
        </Button>
      )}
      {a.has("SET_PRIORITY") && (
        <Button size="sm" variant="outline" icon={<Flag className="h-4 w-4" />} onClick={() => setOpen("priority")}>
          Priorité
        </Button>
      )}
      {a.has("RECALCULATE_DUE") && (
        <Button size="sm" variant="ghost" icon={<CalendarClock className="h-4 w-4" />} onClick={() => setOpen("recalc")}>
          Recalculer l’échéance
        </Button>
      )}
      {a.has("REFUND") && (
        <Button size="sm" variant="ghost" icon={<Undo2 className="h-4 w-4" />} onClick={() => setOpen("refund")}>
          Rembourser le quota
        </Button>
      )}
      {a.has("REOPEN") && (
        <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setOpen("reopen")}>
          Réouvrir
        </Button>
      )}
      {a.has("CANCEL") && (
        <Button size="sm" variant="ghost" className="text-red-600" icon={<XCircle className="h-4 w-4" />} onClick={() => setOpen("cancel")}>
          Annuler la demande
        </Button>
      )}

      <ConfirmDialog
        open={open === "cancel"}
        onOpenChange={set("cancel")}
        title="Annuler cette demande ?"
        description="L’annulation est définitive. L’unité de quota éventuellement consommée n’est pas remboursée automatiquement."
        confirmLabel="Annuler la demande"
        tone="danger"
        reason={{ label: "Motif de l’annulation", required: true }}
        onConfirm={async (reason) => {
          await api.requests.cancelRequest(detail.id, { reason });
          toast.success("Demande annulée.");
        }}
      />
      <ConfirmDialog
        open={open === "close"}
        onOpenChange={set("close")}
        title="Clôturer la demande ?"
        description="La demande restera consultable. Seul un administrateur pourra la réouvrir. L’apprenant sera invité à évaluer l’accompagnement."
        confirmLabel="Clôturer"
        reason={{ label: "Commentaire de clôture (facultatif)", required: false }}
        onConfirm={async (reason) => {
          await api.requests.closeRequest(detail.id, { reason: reason || null });
          toast.success("Demande clôturée.");
        }}
      />
      <ConfirmDialog
        open={open === "reopen"}
        onOpenChange={set("reopen")}
        title="Réouvrir la demande ?"
        description="Un nouveau cycle de traitement sera créé avec une nouvelle échéance. Les messages, clôtures et évaluations précédents sont conservés."
        confirmLabel="Réouvrir"
        reason={{ label: "Motif de la réouverture", required: true }}
        onConfirm={async (reason) => {
          await api.requests.reopenRequest(detail.id, { reason });
          toast.success("Demande réouverte : nouveau cycle créé.");
        }}
      />
      <ConfirmDialog
        open={open === "recalc"}
        onOpenChange={set("recalc")}
        title="Recalculer l’échéance ?"
        description="L’échéance sera recalculée depuis le début du cycle avec la politique de service actuelle. L’opération est enregistrée dans le journal d’audit."
        confirmLabel="Recalculer"
        reason={{ label: "Justification", required: true }}
        onConfirm={async (reason) => {
          const r = await api.requests.recalculateDue(detail.id, { reason });
          toast.success(`Nouvelle échéance enregistrée (${new Date(r.due_at).toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })}).`);
        }}
      />
      <ConfirmDialog
        open={open === "refund"}
        onOpenChange={set("refund")}
        title="Rembourser l’unité de quota ?"
        description="Une écriture de remboursement sera ajoutée au registre de l’apprenant."
        confirmLabel="Rembourser"
        reason={{ label: "Motif du remboursement", required: true }}
        onConfirm={async (reason) => {
          await api.entitlements.refundRequestQuota(detail.id, { reason });
          toast.success("Unité remboursée.");
        }}
      />
      <ConfirmDialog
        open={open === "nudge"}
        onOpenChange={set("nudge")}
        title={`Relancer ${detail.coach?.full_name ?? "le coach"}`}
        description="Le coach recevra une notification dans l’application et un e-mail l’invitant à se connecter."
        confirmLabel="Envoyer la relance"
        reason={{ label: "Message au coach", required: true, placeholder: "Ex. : merci de traiter cette demande en priorité." }}
        onConfirm={async (message) => {
          await api.requests.nudgeCoach(detail.id, { message });
          toast.success("Relance envoyée.");
        }}
      />
      <ReassignDialog detail={detail} open={open === "reassign"} onOpenChange={set("reassign")} />
      <PriorityDialog detail={detail} open={open === "priority"} onOpenChange={set("priority")} />
      <RateDialog detail={detail} open={open === "rate"} onOpenChange={set("rate")} />
    </div>
  );
}

function ReassignDialog({ detail, open, onOpenChange }: { detail: RequestDetail; open: boolean; onOpenChange: (v: boolean) => void }) {
  const coaches = useApi(["coaches-assignable"], () => api.coaches.assignableCoaches(), { enabled: open });
  const [coachId, setCoachId] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const act = useAction(() => api.requests.reassignRequest(detail.id, { coachId, reason }), {
    success: "Demande réaffectée.",
    silentError: true,
    onSuccess: () => {
      onOpenChange(false);
      setConfirm(false);
      setCoachId("");
      setReason("");
    },
  });
  const selected = coaches.data?.find((c) => c.id === coachId);
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setConfirm(false);
      }}
      title="Réaffecter la demande"
      description="Les échanges précédents sont conservés. L’ancien coach ne pourra plus répondre. L’échéance n’est pas modifiée."
      footer={
        <>
          <Button variant="outline" onClick={() => (confirm ? setConfirm(false) : onOpenChange(false))}>
            {confirm ? "Retour" : "Annuler"}
          </Button>
          {confirm ? (
            <Button onClick={() => void act.run()} loading={act.pending}>
              Confirmer la réaffectation
            </Button>
          ) : (
            <Button onClick={() => setConfirm(true)} disabled={!coachId || reason.trim().length < 3}>
              Continuer
            </Button>
          )}
        </>
      }
    >
      {!confirm ? (
        <>
          <p className="text-sm text-slate-600">
            Coach actuel : <strong>{detail.coach?.full_name ?? "aucun"}</strong>
          </p>
          <Field label="Nouveau coach" required error={act.fieldErrors.coachId}>
            {(p) => (
              <Select {...p} value={coachId} onChange={(e) => setCoachId(e.target.value)}>
                <option value="">Sélectionner…</option>
                {coaches.data
                  ?.filter((c) => c.id !== detail.coach?.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} — {c.stats.open_requests} ouverte(s), {c.stats.overdue_requests} en retard{c.absent_now ? " · ABSENT" : ""}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label="Motif" required error={act.fieldErrors.reason}>
            {(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}
          </Field>
        </>
      ) : (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Vous allez confier <strong>{detail.reference}</strong> à <strong>{selected?.full_name}</strong>. Motif : « {reason} ». Cette action est tracée.
        </div>
      )}
      <FormError message={act.error?.message} />
    </Dialog>
  );
}

function PriorityDialog({ detail, open, onOpenChange }: { detail: RequestDetail; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [priority, setPriority] = useState<Priority>(detail.priority);
  const [reason, setReason] = useState("");
  const act = useAction(() => api.requests.setPriority(detail.id, { priority, reason: reason || null }), { success: "Priorité mise à jour.", silentError: true, onSuccess: () => onOpenChange(false) });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Modifier la priorité"
      description="La priorité facilite le tri et la supervision. Elle ne modifie pas le délai cible de réponse."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={() => void act.run()} loading={act.pending} disabled={priority === detail.priority}>
            Enregistrer
          </Button>
        </>
      }
    >
      <Field label="Priorité">
        {(p) => (
          <Select {...p} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((x) => (
              <option key={x} value={x}>
                {PRIORITY_LABELS[x]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Motif (facultatif)">{(p) => <Textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />}</Field>
      <FormError message={act.error?.message} />
    </Dialog>
  );
}

function RateDialog({ detail, open, onOpenChange }: { detail: RequestDetail; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const act = useAction(() => api.requests.rateRequest(detail.id, { score, comment: comment || null }), { success: "Merci pour votre évaluation.", silentError: true, onSuccess: () => onOpenChange(false) });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Évaluer l’accompagnement"
      description={`Votre évaluation porte sur le cycle ${detail.cycle_number} de la demande ${detail.reference}. Elle n’est pas publique.`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Plus tard
          </Button>
          <Button onClick={() => void act.run()} loading={act.pending} disabled={score < 1}>
            Envoyer
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">Note</legend>
        <div className="flex gap-1" role="radiogroup">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} role="radio" aria-checked={score === n} aria-label={`${n} sur 5`} onClick={() => setScore(n)} className="rounded p-1 hover:bg-amber-50">
              <Star className={`h-8 w-8 ${n <= score ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
            </button>
          ))}
        </div>
      </fieldset>
      <Field label="Commentaire (facultatif)">{(p) => <Textarea {...p} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />}</Field>
      <FormError message={act.error?.message} />
    </Dialog>
  );
}

export function SlaSummary({ detail }: { detail: RequestDetail }) {
  const s = detail.sla_detail;
  if (!s) return null;
  return (
    <span>
      {fmtWorkingMinutes(s.elapsedMinutes)} / {fmtWorkingMinutes(s.targetMinutes)}
    </span>
  );
}
