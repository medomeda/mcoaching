"use client";
import { Ban, CalendarPlus, PauseCircle, PlayCircle, Plus, SlidersHorizontal, Undo2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardBody, CardHeader, DescriptionList, EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/display";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { fmtDate, fmtDateTime, fromLocalInput, toLocalInput } from "@/lib/format";
import { ENTITLEMENT_STATUS_LABELS, LEDGER_LABELS, STATUS_LABELS } from "@/lib/labels";
import { appNow } from "@/lib/clock";

type Detail = Awaited<ReturnType<typeof api.entitlements.learnerEntitlementDetail>>;
type Current = NonNullable<Detail["current"]>;

export default function LearnerEntitlementPage() {
  const { learnerId } = useParams<{ learnerId: string }>();
  const q = useApi(["entitlement", learnerId], () => api.entitlements.learnerEntitlementDetail(learnerId));
  const [dialog, setDialog] = useState<"grant" | "edit" | "correct" | "refund" | "SUSPEND" | "REACTIVATE" | "REVOKE" | null>(null);

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data!;
  const e = d.current;
  const close = () => setDialog(null);

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/admin/entitlements", label: "Droits et quotas" }}
        title={`Droit au coaching — ${d.learner.full_name}`}
        description={
          <Link href={`/admin/users/${d.learner.id}`} className="text-brand-700 hover:underline">
            {d.learner.email}
          </Link>
        }
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setDialog("grant")}>
            {e ? "Attribuer un nouveau droit" : "Accorder un droit"}
          </Button>
        }
      />

      {!e ? (
        <Card>
          <EmptyState title="Aucun droit attribué" description="Sans droit actif, l’apprenant ne peut pas soumettre de demande." action={<Button size="sm" onClick={() => setDialog("grant")}>Accorder un droit</Button>} />
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Droit en vigueur"
            actions={<Badge tone={e.effective_status === "ACTIVE" ? "success" : "warning"}>{ENTITLEMENT_STATUS_LABELS[e.effective_status]}</Badge>}
          />
          <CardBody className="space-y-4">
            <DescriptionList
              items={[
                ["Début", fmtDate(e.starts_at)],
                ["Fin", e.expires_at ? fmtDate(e.expires_at) : "Sans date de fin"],
                ["Quota", e.quota_enabled ? `${e.quota_limit} demande(s)${e.balance.corrections ? ` ${e.balance.corrections > 0 ? "+" : ""}${e.balance.corrections} (corrections)` : ""}` : "Désactivé (pas de limite)"],
                ["Consommées / restantes", e.quota_enabled ? `${e.balance.used} / ${e.balance.remaining}` : "—"],
                ["Créé par", `${e.created_by_name} · ${fmtDateTime(e.created_at)}`],
                ["Dernière modification", `${e.updated_by_name} · ${fmtDateTime(e.updated_at)}`],
              ]}
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => setDialog("edit")}>
                Prolonger / modifier
              </Button>
              {e.quota_enabled && (
                <Button size="sm" variant="outline" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setDialog("correct")}>
                  Corriger le quota
                </Button>
              )}
              {d.refundable_requests.length > 0 && (
                <Button size="sm" variant="outline" icon={<Undo2 className="h-4 w-4" />} onClick={() => setDialog("refund")}>
                  Rembourser une demande
                </Button>
              )}
              {e.status === "ACTIVE" && (
                <Button size="sm" variant="outline" icon={<PauseCircle className="h-4 w-4" />} onClick={() => setDialog("SUSPEND")}>
                  Suspendre
                </Button>
              )}
              {e.status === "SUSPENDED" && (
                <Button size="sm" icon={<PlayCircle className="h-4 w-4" />} onClick={() => setDialog("REACTIVATE")}>
                  Réactiver
                </Button>
              )}
              {e.status !== "EXPIRED" && (
                <Button size="sm" variant="ghost" className="text-red-600" icon={<Ban className="h-4 w-4" />} onClick={() => setDialog("REVOKE")}>
                  Retirer le droit
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Registre des mouvements de quota" description="Append-only : aucune ligne n’est modifiée ni supprimée." />
          {d.ledger.length === 0 ? (
            <EmptyState title="Aucun mouvement" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.ledger.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                  <span>
                    <span className="font-medium text-slate-800">{LEDGER_LABELS[l.entry_type]}</span>
                    {l.request_reference && <span className="ml-2 font-mono text-xs text-slate-500">{l.request_reference}</span>}
                    {l.reason && <span className="block text-xs text-slate-600">Motif : {l.reason}</span>}
                    <span className="block text-xs text-slate-400">
                      {l.created_by_name} · {fmtDateTime(l.created_at)}
                    </span>
                  </span>
                  <span className={`font-semibold tabular-nums ${l.quantity < 0 ? "text-slate-700" : "text-emerald-700"}`}>{l.quantity > 0 ? `+${l.quantity}` : l.quantity}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Historique des droits" />
          <ul className="divide-y divide-slate-100">
            {d.history.map((h) => (
              <li key={h.id} className="px-4 py-2.5 text-sm sm:px-5">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge tone={h.superseded_at ? "neutral" : "brand"}>{h.superseded_at ? "Remplacé" : "En vigueur"}</Badge>
                  <span className="text-slate-700">{ENTITLEMENT_STATUS_LABELS[h.effective_status]}</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {fmtDate(h.starts_at)} → {h.expires_at ? fmtDate(h.expires_at) : "sans fin"} · {h.quota_enabled ? `quota ${h.quota_limit}` : "sans quota"} · créé par {h.created_by_name}
                </p>
              </li>
            ))}
            {d.history.length === 0 && <EmptyState title="Aucun historique" />}
          </ul>
        </Card>
      </div>

      {dialog === "grant" && <GrantDialog learnerId={d.learner.id} hasCurrent={!!e} onClose={close} />}
      {dialog === "edit" && e && <EditDialog e={e} onClose={close} />}
      {dialog === "correct" && e && <CorrectDialog e={e} onClose={close} />}
      {dialog === "refund" && <RefundDialog requests={d.refundable_requests} onClose={close} />}
      {(dialog === "SUSPEND" || dialog === "REACTIVATE" || dialog === "REVOKE") && e && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && close()}
          title={{ SUSPEND: "Suspendre le droit ?", REACTIVATE: "Réactiver le droit ?", REVOKE: "Retirer le droit ?" }[dialog]}
          description={dialog === "REACTIVATE" ? "L’apprenant pourra de nouveau soumettre des demandes." : "L’apprenant ne pourra plus soumettre de nouvelle demande. Ses demandes ouvertes restent accessibles et traitées."}
          confirmLabel={{ SUSPEND: "Suspendre", REACTIVATE: "Réactiver", REVOKE: "Retirer" }[dialog]}
          tone={dialog === "REACTIVATE" ? "primary" : "danger"}
          reason={{ label: "Motif", required: true }}
          onConfirm={async (reason) => {
            await api.entitlements.setEntitlementStatus(e.id, { action: dialog, reason });
            toast.success("Droit mis à jour.");
          }}
        />
      )}
    </div>
  );
}

function GrantDialog({ learnerId, hasCurrent, onClose }: { learnerId: string; hasCurrent: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ starts_at: toLocalInput(new Date(appNow()).toISOString()), expires_at: "", quota_enabled: false, quota_limit: "5", reason: "" });
  const act = useAction(
    () =>
      api.entitlements.grantEntitlement({
        learnerId,
        starts_at: fromLocalInput(form.starts_at) ?? "",
        expires_at: fromLocalInput(form.expires_at),
        quota_enabled: form.quota_enabled,
        quota_limit: form.quota_enabled ? Number(form.quota_limit) : null,
        reason: form.reason || null,
      }),
    { success: "Droit attribué.", silentError: true, onSuccess: onClose },
  );
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title="Accorder un droit au coaching"
      description={hasCurrent ? "Le droit actuel sera conservé dans l’historique et remplacé ; le nouveau quota repart de zéro." : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => void act.run()} loading={act.pending}>
            Accorder
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Début" required error={act.fieldErrors.starts_at}>
          {(p) => <Input {...p} type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />}
        </Field>
        <Field label="Fin (facultatif)" error={act.fieldErrors.expires_at}>
          {(p) => <Input {...p} type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />}
        </Field>
      </div>
      <Checkbox label="Activer un quota" description="Chaque demande soumise consommera une unité." checked={form.quota_enabled} onChange={(v) => setForm({ ...form, quota_enabled: v })} />
      {form.quota_enabled && (
        <Field label="Nombre de demandes autorisées" required error={act.fieldErrors.quota_limit}>
          {(p) => <Input {...p} type="number" min={1} max={1000} value={form.quota_limit} onChange={(e) => setForm({ ...form, quota_limit: e.target.value })} />}
        </Field>
      )}
      <Field label="Motif / formule (facultatif)">{(p) => <Input {...p} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} maxLength={500} />}</Field>
      <FormError message={act.error && !Object.keys(act.fieldErrors).length ? act.error.message : null} />
    </Dialog>
  );
}

function EditDialog({ e, onClose }: { e: Current; onClose: () => void }) {
  const [form, setForm] = useState({ expires_at: toLocalInput(e.expires_at), quota_enabled: e.quota_enabled, quota_limit: String(e.quota_limit ?? 5), reason: "" });
  useEffect(() => setForm({ expires_at: toLocalInput(e.expires_at), quota_enabled: e.quota_enabled, quota_limit: String(e.quota_limit ?? 5), reason: "" }), [e]);
  const act = useAction(
    () =>
      api.entitlements.updateEntitlement(e.id, {
        expires_at: fromLocalInput(form.expires_at),
        quota_enabled: form.quota_enabled,
        quota_limit: form.quota_enabled ? Number(form.quota_limit) : null,
        reason: form.reason,
      }),
    { success: "Droit modifié.", silentError: true, onSuccess: onClose },
  );
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title="Prolonger ou modifier le droit"
      description="Toute modification exige un motif et est enregistrée dans le journal d’audit."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => void act.run()} loading={act.pending} disabled={form.reason.trim().length < 3}>
            Enregistrer
          </Button>
        </>
      }
    >
      <Field label="Date de fin" hint="Laisser vide pour un droit sans date de fin." error={act.fieldErrors.expires_at}>
        {(p) => <Input {...p} type="datetime-local" value={form.expires_at} onChange={(ev) => setForm({ ...form, expires_at: ev.target.value })} />}
      </Field>
      <Checkbox label="Quota activé" checked={form.quota_enabled} onChange={(v) => setForm({ ...form, quota_enabled: v })} />
      {form.quota_enabled && (
        <Field label="Nombre de demandes autorisées" hint={`Déjà consommées : ${e.balance.used}.`} error={act.fieldErrors.quota_limit}>
          {(p) => <Input {...p} type="number" min={1} value={form.quota_limit} onChange={(ev) => setForm({ ...form, quota_limit: ev.target.value })} />}
        </Field>
      )}
      <Field label="Motif" required error={act.fieldErrors.reason}>
        {(p) => <Textarea {...p} rows={2} value={form.reason} onChange={(ev) => setForm({ ...form, reason: ev.target.value })} maxLength={500} />}
      </Field>
      <FormError message={act.error && !Object.keys(act.fieldErrors).length ? act.error.message : null} />
    </Dialog>
  );
}

function CorrectDialog({ e, onClose }: { e: Current; onClose: () => void }) {
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const act = useAction(() => api.entitlements.correctQuota(e.id, { quantity: Number(quantity), reason }), { success: "Correction enregistrée dans le registre.", silentError: true, onSuccess: onClose });
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title="Correction exceptionnelle du quota"
      description={`Solde actuel : ${e.balance.remaining}. Une ligne de correction est ajoutée au registre (le compteur n’est jamais modifié directement).`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => void act.run()} loading={act.pending} disabled={reason.trim().length < 3 || !Number(quantity)}>
            Enregistrer
          </Button>
        </>
      }
    >
      <Field label="Quantité (positive = unités ajoutées, négative = retirées)" error={act.fieldErrors.quantity}>
        {(p) => <Input {...p} type="number" min={-100} max={100} value={quantity} onChange={(ev) => setQuantity(ev.target.value)} />}
      </Field>
      <Field label="Motif" required error={act.fieldErrors.reason}>
        {(p) => <Textarea {...p} rows={2} value={reason} onChange={(ev) => setReason(ev.target.value)} maxLength={500} />}
      </Field>
      <FormError message={act.error && !Object.keys(act.fieldErrors).length ? act.error.message : null} />
    </Dialog>
  );
}

function RefundDialog({ requests, onClose }: { requests: Detail["refundable_requests"]; onClose: () => void }) {
  const [requestId, setRequestId] = useState(requests[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const act = useAction(() => api.entitlements.refundRequestQuota(requestId, { reason }), { success: "Unité remboursée.", silentError: true, onSuccess: onClose });
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title="Rembourser l’unité consommée par une demande"
      description="Aucun remboursement n’est automatique, y compris en cas d’annulation."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => void act.run()} loading={act.pending} disabled={!requestId || reason.trim().length < 3}>
            Rembourser
          </Button>
        </>
      }
    >
      <Field label="Demande">
        {(p) => (
          <Select {...p} value={requestId} onChange={(ev) => setRequestId(ev.target.value)}>
            {requests.map((r) => (
              <option key={r.id} value={r.id}>
                {r.reference} — {r.subject.slice(0, 50)} ({STATUS_LABELS[r.status]})
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Motif" required>
        {(p) => <Textarea {...p} rows={2} value={reason} onChange={(ev) => setReason(ev.target.value)} maxLength={500} />}
      </Field>
      <Alert tone="neutral">Le remboursement est tracé dans le registre et le journal d’audit.</Alert>
      <FormError message={act.error?.message} />
    </Dialog>
  );
}
