"use client";
import { CalendarClock, Plane, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { fmtDateTime, fromLocalInput } from "@/lib/format";
import { DAY_LABELS } from "@/lib/labels";
import { appNow } from "@/lib/clock";

export default function AvailabilityPage() {
  const q = useApi(["coach-space"], () => api.coaches.myCoachSpace());
  const [slot, setSlot] = useState({ day_of_week: 1, start_time: "09:00", end_time: "12:00" });
  const [abs, setAbs] = useState({ starts_at: "", ends_at: "", reason: "" });
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [toCancel, setToCancel] = useState<string | null>(null);
  const addSlot = useAction(() => api.coaches.addAvailability(slot), { success: "Créneau ajouté." });
  const toggle = useAction((id: string, active: boolean) => api.coaches.toggleAvailability(id, active), { success: "Créneau mis à jour." });
  const addAbs = useAction(
    () => {
      const s = fromLocalInput(abs.starts_at);
      const e = fromLocalInput(abs.ends_at);
      return api.coaches.addAbsence({ starts_at: s ?? "", ends_at: e ?? "", reason: abs.reason || null });
    },
    { success: "Absence déclarée.", onSuccess: () => setAbs({ starts_at: "", ends_at: "", reason: "" }) },
  );

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data!;
  const now = appNow();

  return (
    <div className="space-y-4">
      <PageHeader title="Disponibilités et absences" description="Ces informations aident l’administrateur à organiser les affectations." />
      <Alert tone="info">Une absence ne suspend pas automatiquement les délais des demandes déjà soumises. L’administrateur est alerté si une demande nécessite une action pendant votre absence.</Alert>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Disponibilités hebdomadaires" icon={<CalendarClock className="h-4 w-4" />} />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-end">
              <Field label="Jour">
                {(p) => (
                  <Select {...p} value={slot.day_of_week} onChange={(e) => setSlot({ ...slot, day_of_week: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <option key={n} value={n}>
                        {DAY_LABELS[n]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Début" error={addSlot.fieldErrors.start_time}>
                {(p) => <Input {...p} type="time" value={slot.start_time} onChange={(e) => setSlot({ ...slot, start_time: e.target.value })} />}
              </Field>
              <Field label="Fin" error={addSlot.fieldErrors.end_time}>
                {(p) => <Input {...p} type="time" value={slot.end_time} onChange={(e) => setSlot({ ...slot, end_time: e.target.value })} />}
              </Field>
              <Button icon={<Plus className="h-4 w-4" />} loading={addSlot.pending} onClick={() => void addSlot.run()}>
                Ajouter
              </Button>
            </div>
            {d.availability.length === 0 ? (
              <EmptyState title="Aucun créneau" />
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {d.availability.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className={s.is_active ? "" : "text-slate-400 line-through"}>
                      <span className="font-medium">{DAY_LABELS[s.day_of_week]}</span> · {s.start_time} – {s.end_time}
                    </span>
                    <span className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => void toggle.run(s.id, !s.is_active)}>
                        {s.is_active ? "Désactiver" : "Activer"}
                      </Button>
                      <Button size="sm" variant="ghost" aria-label="Supprimer le créneau" icon={<Trash2 className="h-4 w-4 text-red-500" />} onClick={() => setToDelete(s.id)} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Absences" icon={<Plane className="h-4 w-4" />} description="Heures exprimées en heure d’Abidjan (UTC+0)." />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="Début" required error={addAbs.fieldErrors.starts_at}>
                {(p) => <Input {...p} type="datetime-local" value={abs.starts_at} onChange={(e) => setAbs({ ...abs, starts_at: e.target.value })} />}
              </Field>
              <Field label="Fin" required error={addAbs.fieldErrors.ends_at}>
                {(p) => <Input {...p} type="datetime-local" value={abs.ends_at} onChange={(e) => setAbs({ ...abs, ends_at: e.target.value })} />}
              </Field>
              <Field label="Motif (facultatif)" className="sm:col-span-2">
                {(p) => <Input {...p} value={abs.reason} onChange={(e) => setAbs({ ...abs, reason: e.target.value })} maxLength={300} />}
              </Field>
            </div>
            <Button icon={<Plus className="h-4 w-4" />} loading={addAbs.pending} disabled={!abs.starts_at || !abs.ends_at} onClick={() => void addAbs.run()}>
              Déclarer l’absence
            </Button>
            {d.absences.length === 0 ? (
              <EmptyState title="Aucune absence déclarée" />
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {d.absences.map((a) => {
                  const current = new Date(a.starts_at).getTime() <= now && new Date(a.ends_at).getTime() > now;
                  const past = new Date(a.ends_at).getTime() <= now;
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span>
                        <span className="flex flex-wrap items-center gap-2">
                          {fmtDateTime(a.starts_at)} → {fmtDateTime(a.ends_at)}
                          {current && <Badge tone="warning">En cours</Badge>}
                          {past && <Badge>Passée</Badge>}
                        </span>
                        {a.reason && <span className="block text-xs text-slate-500">{a.reason}</span>}
                      </span>
                      {!past && (
                        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setToCancel(a.id)}>
                          Annuler
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)} title="Supprimer ce créneau ?" confirmLabel="Supprimer" tone="danger" onConfirm={() => api.coaches.deleteAvailability(toDelete!)} />
      <ConfirmDialog open={!!toCancel} onOpenChange={(v) => !v && setToCancel(null)} title="Annuler cette absence ?" description="L’annulation est enregistrée dans le journal d’audit." confirmLabel="Annuler l’absence" onConfirm={() => api.coaches.cancelAbsence(toCancel!)} />
    </div>
  );
}
