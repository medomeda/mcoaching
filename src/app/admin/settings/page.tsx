"use client";
import { ArrowDown, ArrowUp, CalendarOff, Clock, FolderTree, Paperclip, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardBody, CardHeader, ErrorState, Loading, PageHeader, Tabs } from "@/components/ui/display";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Textarea } from "@/components/ui/form";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { DAY_LABELS } from "@/lib/labels";

type Settings = Awaited<ReturnType<typeof api.settings.getServiceSettings>>;
type Tab = "service" | "holidays" | "rules" | "categories";

export default function SettingsPage() {
  const q = useApi(["service-settings"], () => api.settings.getServiceSettings());
  const [tab, setTab] = useState<Tab>("service");
  return (
    <div className="space-y-4">
      <PageHeader title="Paramètres" description="Paramètres de service centralisés. Chaque modification est motivée et enregistrée dans le journal d’audit." />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "service", label: "Calendrier et délais" },
          { value: "holidays", label: "Jours fériés" },
          { value: "rules", label: "Pièces jointes et règles" },
          { value: "categories", label: "Catégories" },
        ]}
      />
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {q.data && tab === "service" && <ServicePolicy s={q.data} />}
      {q.data && tab === "holidays" && <Holidays s={q.data} />}
      {q.data && tab === "rules" && <Rules s={q.data} />}
      {tab === "categories" && <Categories />}
    </div>
  );
}

function ServicePolicy({ s }: { s: Settings }) {
  const p = s.current_policy;
  const init = () => ({
    timezone: s.calendar.timezone,
    working_days: s.calendar.working_days,
    periods: s.calendar.periods,
    response_target_hours: p.response_target_working_minutes / 60,
    reminder_50_enabled: p.reminder_50_enabled,
    reminder_75_enabled: p.reminder_75_enabled,
    overdue_escalation_hours: p.overdue_escalation_working_minutes / 60,
  });
  const [form, setForm] = useState(init);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setForm(init()), [s]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDay = (d: number) => setForm((f) => ({ ...f, working_days: f.working_days.includes(d) ? f.working_days.filter((x) => x !== d) : [...f.working_days, d].sort() }));
  const setPeriod = (i: number, k: "start" | "end", v: string) => setForm((f) => ({ ...f, periods: f.periods.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Calendrier de service et délais" icon={<Clock className="h-4 w-4" />} />
        <CardBody className="space-y-5">
          <Alert tone="info">Une modification crée une nouvelle version de la politique, appliquée aux demandes soumises ensuite. Les échéances déjà enregistrées ne sont pas modifiées ; un recalcul se fait demande par demande, de façon motivée.</Alert>
          <Field label="Fuseau horaire (IANA)" hint="Ex. : Africa/Abidjan">
            {(pp) => <Input {...pp} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />}
          </Field>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">Jours ouvrés</legend>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <button key={d} type="button" aria-pressed={form.working_days.includes(d)} onClick={() => toggleDay(d)} className={`rounded-lg border px-3 py-1.5 text-sm ${form.working_days.includes(d) ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 text-slate-600"}`}>
                  {DAY_LABELS[d]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium text-slate-700">Plages horaires (les pauses sont exclues)</legend>
            {form.periods.map((x, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input type="time" aria-label={`Début plage ${i + 1}`} value={x.start} onChange={(e) => setPeriod(i, "start", e.target.value)} className="w-32" />
                <span className="text-slate-400">→</span>
                <Input type="time" aria-label={`Fin plage ${i + 1}`} value={x.end} onChange={(e) => setPeriod(i, "end", e.target.value)} className="w-32" />
                <Button size="sm" variant="ghost" aria-label="Supprimer la plage" disabled={form.periods.length <= 1} icon={<Trash2 className="h-4 w-4" />} onClick={() => setForm({ ...form, periods: form.periods.filter((_, j) => j !== i) })} />
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ ...form, periods: [...form.periods, { start: "14:00", end: "15:00" }] })}>
              Ajouter une plage
            </Button>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Délai cible de première réponse (heures ouvrées)">
              {(pp) => <Input {...pp} type="number" min={1} step={0.5} value={form.response_target_hours} onChange={(e) => setForm({ ...form, response_target_hours: Number(e.target.value) })} />}
            </Field>
            <Field label="Escalade après retard de (heures ouvrées)">
              {(pp) => <Input {...pp} type="number" min={0.5} step={0.5} value={form.overdue_escalation_hours} onChange={(e) => setForm({ ...form, overdue_escalation_hours: Number(e.target.value) })} />}
            </Field>
          </div>
          <div className="space-y-2">
            <Checkbox label="Rappel au coach à 50 % du délai" checked={form.reminder_50_enabled} onChange={(v) => setForm({ ...form, reminder_50_enabled: v })} />
            <Checkbox label="Second rappel au coach à 75 % du délai" checked={form.reminder_75_enabled} onChange={(v) => setForm({ ...form, reminder_75_enabled: v })} />
            <p className="text-xs text-slate-500">À l’échéance : marquage en retard et alerte au coach (toujours actif).</p>
          </div>
          <Button onClick={() => setConfirm(true)}>Enregistrer une nouvelle version</Button>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Versions de la politique" description="Historique conservé : chaque demande référence la version appliquée." />
        <ul className="divide-y divide-slate-100">
          {s.policies.map((x, i) => (
            <li key={x.id} className="px-4 py-2.5 text-xs sm:px-5">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
                {x.response_target_working_minutes / 60} h ouvrées {i === 0 && <Badge tone="success">En vigueur</Badge>}
              </p>
              <p className="text-slate-500">
                {x.calendar_snapshot.working_days.map((d) => DAY_LABELS[d]!.slice(0, 3)).join(", ")} · {x.calendar_snapshot.periods.map((pp) => `${pp.start}–${pp.end}`).join(" / ")}
              </p>
              <p className="text-slate-500">
                Escalade {x.overdue_escalation_working_minutes / 60} h · rappels {x.reminder_50_enabled ? "50 %" : ""} {x.reminder_75_enabled ? "75 %" : ""}
              </p>
              <p className="text-slate-400">
                Depuis {x.effective_from.startsWith("2000") ? "l’initialisation" : fmtDateTime(x.effective_from)} · {x.created_by_name}
              </p>
            </li>
          ))}
        </ul>
      </Card>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Enregistrer la nouvelle politique de service ?"
        description="Elle s’appliquera aux demandes soumises à partir de maintenant. Les échéances existantes restent inchangées."
        confirmLabel="Enregistrer"
        reason={{ label: "Motif de la modification", required: true }}
        onConfirm={async (reason) => {
          await api.settings.updateServicePolicy({ ...form, reason });
          toast.success("Nouvelle politique de service en vigueur.");
        }}
      />
    </div>
  );
}

function Holidays({ s }: { s: Settings }) {
  const [form, setForm] = useState({ holiday_date: "", label: "" });
  const [del, setDel] = useState<string | null>(null);
  const add = useAction(() => api.settings.addHoliday(form), { success: "Jour de fermeture ajouté.", onSuccess: () => setForm({ holiday_date: "", label: "" }) });
  return (
    <Card>
      <CardHeader title="Jours fériés et fermetures" icon={<CalendarOff className="h-4 w-4" />} description="Exclus du calcul des heures ouvrées pour les nouvelles échéances et le suivi des délais." />
      <CardBody className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
          <Field label="Date" error={add.fieldErrors.holiday_date}>
            {(p) => <Input {...p} type="date" value={form.holiday_date} onChange={(e) => setForm({ ...form, holiday_date: e.target.value })} />}
          </Field>
          <Field label="Libellé" error={add.fieldErrors.label}>
            {(p) => <Input {...p} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Ex. : Tabaski" />}
          </Field>
          <Button icon={<Plus className="h-4 w-4" />} loading={add.pending} onClick={() => void add.run()}>
            Ajouter
          </Button>
        </div>
        {s.holidays.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun jour de fermeture configuré.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {s.holidays.map((h) => (
              <li key={h.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>
                  <span className="font-medium text-slate-800">{fmtDate(`${h.holiday_date}T12:00:00Z`)}</span> · {h.label}
                </span>
                <Button size="sm" variant="ghost" aria-label={`Supprimer ${h.label}`} icon={<Trash2 className="h-4 w-4 text-red-500" />} onClick={() => setDel(h.id)} />
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <ConfirmDialog open={!!del} onOpenChange={(v) => !v && setDel(null)} title="Supprimer ce jour de fermeture ?" description="Les échéances déjà enregistrées ne sont pas modifiées." confirmLabel="Supprimer" tone="danger" onConfirm={() => api.settings.removeHoliday(del!)} />
    </Card>
  );
}

function Rules({ s }: { s: Settings }) {
  const init = () => ({
    attachment_max_size_mb: Math.round((s.app.attachment_max_size_bytes / 1024 / 1024) * 10) / 10,
    attachment_allowed_extensions: s.app.attachment_allowed_extensions,
    attachment_max_files_per_message: s.app.attachment_max_files_per_message,
    learner_can_close: s.app.learner_can_close,
    learner_follow_up_reopens_processing: s.app.learner_follow_up_reopens_processing,
    coach_can_view_ratings: s.app.coach_can_view_ratings,
    email_max_attempts: s.app.email_max_attempts,
  });
  const [form, setForm] = useState(init);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setForm(init()), [s]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleExt = (e: string) => setForm((f) => ({ ...f, attachment_allowed_extensions: f.attachment_allowed_extensions.includes(e) ? f.attachment_allowed_extensions.filter((x) => x !== e) : [...f.attachment_allowed_extensions, e] }));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Pièces jointes" icon={<Paperclip className="h-4 w-4" />} description="Le contenu des fichiers est vérifié (signature binaire) en plus de l’extension." />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Taille maximale (Mo)">{(p) => <Input {...p} type="number" min={0.1} max={25} step={0.5} value={form.attachment_max_size_mb} onChange={(e) => setForm({ ...form, attachment_max_size_mb: Number(e.target.value) })} />}</Field>
            <Field label="Fichiers max. par message">{(p) => <Input {...p} type="number" min={1} max={10} value={form.attachment_max_files_per_message} onChange={(e) => setForm({ ...form, attachment_max_files_per_message: Number(e.target.value) })} />}</Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">Formats autorisés (liste blanche)</legend>
            <div className="flex flex-wrap gap-1.5">
              {s.supported_extensions.map((e) => (
                <button key={e} type="button" aria-pressed={form.attachment_allowed_extensions.includes(e)} onClick={() => toggleExt(e)} className={`rounded-lg border px-2.5 py-1 font-mono text-xs ${form.attachment_allowed_extensions.includes(e) ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 text-slate-600"}`}>
                  .{e}
                </button>
              ))}
            </div>
          </fieldset>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Règles à valider (PRD §21)" description="Paramétrables pour éviter toute ambiguïté en production." />
        <CardBody className="space-y-4">
          <Checkbox label="L’apprenant peut clôturer une demande" description="Par défaut désactivé : seuls le coach responsable et l’administrateur clôturent." checked={form.learner_can_close} onChange={(v) => setForm({ ...form, learner_can_close: v })} />
          <Checkbox label="Un message de l’apprenant après la réponse finale relance le traitement" description="La demande repasse « En cours » au lieu de rester en attente de clôture." checked={form.learner_follow_up_reopens_processing} onChange={(v) => setForm({ ...form, learner_follow_up_reopens_processing: v })} />
          <Checkbox label="Le coach consulte ses évaluations" checked={form.coach_can_view_ratings} onChange={(v) => setForm({ ...form, coach_can_view_ratings: v })} />
          <Field label="Nombre maximal de tentatives d’envoi d’un e-mail" hint="Relances à 5 min, 15 min, 1 h puis 4 h.">
            {(p) => <Input {...p} type="number" min={1} max={10} value={form.email_max_attempts} onChange={(e) => setForm({ ...form, email_max_attempts: Number(e.target.value) })} />}
          </Field>
        </CardBody>
      </Card>
      <div className="lg:col-span-2">
        <Button onClick={() => setConfirm(true)}>Enregistrer les paramètres</Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Enregistrer les paramètres ?"
        confirmLabel="Enregistrer"
        reason={{ label: "Motif", required: true }}
        onConfirm={async (reason) => {
          await api.settings.updateAppSettings({ ...form, reason });
          toast.success("Paramètres enregistrés.");
        }}
      />
    </div>
  );
}

function Categories() {
  const q = useApi(["categories", "all"], () => api.settings.listCategories(true));
  const [edit, setEdit] = useState<{ id: string | null; name: string; description: string; is_active: boolean } | null>(null);
  const save = useAction(() => api.settings.saveCategory(edit!.id, { name: edit!.name, description: edit!.description, is_active: edit!.is_active }), { success: "Catégorie enregistrée.", silentError: true, onSuccess: () => setEdit(null) });
  const move = useAction((id: string, dir: -1 | 1) => api.settings.moveCategory(id, dir));
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <Card>
      <CardHeader
        title="Catégories de demandes"
        icon={<FolderTree className="h-4 w-4" />}
        description="Thématiques pédagogiques — elles ne constituent pas des recommandations financières."
        actions={
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ id: null, name: "", description: "", is_active: true })}>
            Nouvelle catégorie
          </Button>
        }
      />
      <ul className="divide-y divide-slate-100">
        {q.data!.map((c, i) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
            <div className="flex flex-col">
              <button aria-label="Monter" disabled={i === 0} onClick={() => void move.run(c.id, -1)} className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button aria-label="Descendre" disabled={i === q.data!.length - 1} onClick={() => void move.run(c.id, 1)} className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                {c.name} {!c.is_active && <Badge>Désactivée</Badge>}
              </p>
              {c.description && <p className="truncate text-xs text-slate-500">{c.description}</p>}
            </div>
            <Button size="sm" variant="outline" onClick={() => setEdit({ id: c.id, name: c.name, description: c.description, is_active: c.is_active })}>
              Modifier
            </Button>
          </li>
        ))}
      </ul>
      {edit && (
        <Dialog
          open
          onOpenChange={(v) => !v && setEdit(null)}
          title={edit.id ? "Modifier la catégorie" : "Nouvelle catégorie"}
          footer={
            <>
              <Button variant="outline" onClick={() => setEdit(null)}>
                Annuler
              </Button>
              <Button onClick={() => void save.run()} loading={save.pending}>
                Enregistrer
              </Button>
            </>
          }
        >
          <Field label="Nom" required error={save.fieldErrors.name}>
            {(p) => <Input {...p} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={80} />}
          </Field>
          <Field label="Description">{(p) => <Textarea {...p} rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} maxLength={300} />}</Field>
          <Checkbox label="Active (proposée aux apprenants)" checked={edit.is_active} onChange={(v) => setEdit({ ...edit, is_active: v })} />
          <FormError message={save.error && !Object.keys(save.fieldErrors).length ? save.error.message : null} />
        </Dialog>
      )}
    </Card>
  );
}
