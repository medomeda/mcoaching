"use client";
import { keepPreviousData } from "@tanstack/react-query";
import { History, Link2, Search, Unlink } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, EmptyState, ErrorState, Loading, PageHeader, Pagination } from "@/components/ui/display";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { assignmentOverview } from "@/server/api/assignments";

type Row = Awaited<ReturnType<typeof assignmentOverview>>["items"][number];

export default function AssignmentsPage() {
  return (
    <Suspense>
      <Assignments />
    </Suspense>
  );
}

function Assignments() {
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [page, setPage] = useState(1);
  const [assignFor, setAssignFor] = useState<Row | null>(null);
  const [endFor, setEndFor] = useState<Row | null>(null);
  const [historyFor, setHistoryFor] = useState<Row | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [debounced, onlyUnassigned]);
  const filters = { q: debounced || undefined, onlyUnassigned, page, pageSize: 20 };
  const list = useApi(["assignments", filters], () => api.assignments.assignmentOverview(filters), { placeholderData: keepPreviousData });

  const preselect = params.get("learner");
  useEffect(() => {
    if (preselect && list.data && !assignFor) {
      const row = list.data.items.find((r) => r.learner.id === preselect);
      if (row) setAssignFor(row);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselect, list.data]);

  return (
    <>
      <PageHeader title="Affectations" description="Affectation manuelle du coach principal de chaque apprenant (au plus une affectation active)." />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-3 sm:flex-row sm:items-center sm:px-5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input aria-label="Rechercher un apprenant" placeholder="Rechercher un apprenant…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Checkbox label="Uniquement sans coach" checked={onlyUnassigned} onChange={setOnlyUnassigned} />
        </div>
        {list.isLoading ? (
          <Loading />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data!.items.length === 0 ? (
          <EmptyState filtered={!!(debounced || onlyUnassigned)} title={onlyUnassigned ? "Tous les apprenants ont un coach" : "Aucun apprenant"} />
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {list.data!.items.map((r) => (
                <li key={r.learner.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{r.learner.full_name}</p>
                    <p className="text-xs text-slate-500">
                      {r.learner.email} · {r.open_requests} demande(s) ouverte(s)
                    </p>
                  </div>
                  <div className="min-w-0 sm:w-64">
                    {r.assignment ? (
                      <p className="text-sm">
                        <span className="font-medium text-slate-800">{r.assignment.coach_name}</span>
                        <span className="block text-xs text-slate-500">depuis le {fmtDate(r.assignment.started_at)}</span>
                        {r.open_requests_other_coach > 0 && <Badge tone="warning">{r.open_requests_other_coach} demande(s) suivie(s) par un autre coach</Badge>}
                      </p>
                    ) : (
                      <Badge tone="warning">Aucun coach</Badge>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant={r.assignment ? "outline" : "primary"} icon={<Link2 className="h-4 w-4" />} onClick={() => setAssignFor(r)}>
                      {r.assignment ? "Changer" : "Affecter"}
                    </Button>
                    {r.assignment && <Button size="sm" variant="ghost" aria-label="Mettre fin à l’affectation" icon={<Unlink className="h-4 w-4" />} onClick={() => setEndFor(r)} />}
                    <Button size="sm" variant="ghost" aria-label="Historique" icon={<History className="h-4 w-4" />} onClick={() => setHistoryFor(r)} />
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={list.data!.page} pages={list.data!.pages} total={list.data!.total} onPage={setPage} />
          </>
        )}
      </Card>
      {assignFor && <AssignDialog row={assignFor} onClose={() => setAssignFor(null)} />}
      <ConfirmDialog
        open={!!endFor}
        onOpenChange={(v) => !v && setEndFor(null)}
        title={`Mettre fin à l’affectation de ${endFor?.learner.full_name} ?`}
        description="L’apprenant ne pourra plus soumettre de demande tant qu’un nouveau coach ne lui est pas affecté. Les demandes ouvertes restent attribuées à leur coach."
        confirmLabel="Mettre fin"
        tone="danger"
        reason={{ label: "Motif", required: true }}
        onConfirm={(reason) => api.assignments.endAssignment({ learnerId: endFor!.learner.id, reason })}
      />
      {historyFor && <HistoryDialog row={historyFor} onClose={() => setHistoryFor(null)} />}
    </>
  );
}

function AssignDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const coaches = useApi(["coaches-assignable"], () => api.coaches.assignableCoaches());
  const [coachId, setCoachId] = useState("");
  const [reason, setReason] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const change = !!row.assignment;
  const act = useAction(() => api.assignments.assignCoach({ learnerId: row.learner.id, coachId, reason: reason || null, reassignOpenRequests: moveOpen }), {
    silentError: true,
    success: (r) => `Affectation enregistrée${r.movedRequests ? ` · ${r.movedRequests} demande(s) réaffectée(s)` : ""}.`,
    onSuccess: onClose,
  });
  const coach = coaches.data?.find((c) => c.id === coachId);
  const needsConfirm = change || moveOpen;
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={change ? `Changer le coach de ${row.learner.full_name}` : `Affecter un coach à ${row.learner.full_name}`}
      description={change ? `Coach actuel : ${row.assignment!.coach_name}. L’ancienne affectation est conservée dans l’historique.` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={() => (confirm ? setConfirm(false) : onClose())}>
            {confirm ? "Retour" : "Annuler"}
          </Button>
          {confirm || !needsConfirm ? (
            <Button onClick={() => void act.run()} loading={act.pending} disabled={!coachId || (change && reason.trim().length < 3)}>
              Confirmer l’affectation
            </Button>
          ) : (
            <Button onClick={() => setConfirm(true)} disabled={!coachId || (change && reason.trim().length < 3)}>
              Continuer
            </Button>
          )}
        </>
      }
    >
      {!confirm ? (
        <>
          <Field label="Coach" required>
            {(p) => (
              <Select {...p} value={coachId} onChange={(e) => setCoachId(e.target.value)}>
                <option value="">Sélectionner un coach actif…</option>
                {coaches.data
                  ?.filter((c) => c.id !== row.assignment?.coach_id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} — {c.stats.assigned_learners} apprenant(s), {c.stats.open_requests} ouverte(s), {c.stats.overdue_requests} en retard{c.absent_now ? " · ABSENT" : ""}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          {coach?.absent_now && <Alert tone="warning">Ce coach est absent jusqu’au {fmtDateTime(coach.absent_now.ends_at)}.</Alert>}
          <Field label={change ? "Motif" : "Motif (facultatif)"} required={change}>
            {(p) => <Textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}
          </Field>
          {row.open_requests > 0 && (
            <Checkbox
              label={`Réaffecter aussi les ${row.open_requests} demande(s) ouverte(s) à ce coach`}
              description="Sinon, les demandes ouvertes restent suivies par leur coach actuel."
              checked={moveOpen}
              onChange={setMoveOpen}
            />
          )}
        </>
      ) : (
        <Alert tone="warning" title="Confirmation">
          {row.learner.full_name} sera suivi(e) par <strong>{coach?.full_name}</strong>
          {moveOpen ? ` et ses ${row.open_requests} demande(s) ouverte(s) lui seront réaffectées (messages conservés, échéances inchangées)` : ""}. Motif : « {reason || "—"} ».
        </Alert>
      )}
      <FormError message={act.error?.message} />
    </Dialog>
  );
}

function HistoryDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const q = useApi(["assignment-history", row.learner.id], () => api.assignments.assignmentHistory(row.learner.id));
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={`Historique des affectations — ${row.learner.full_name}`} size="lg">
      {q.isLoading ? (
        <Loading />
      ) : q.data!.length === 0 ? (
        <EmptyState title="Aucune affectation" />
      ) : (
        <ol className="space-y-2">
          {q.data!.map((a) => (
            <li key={a.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <p className="font-medium">
                {a.coach_name} {a.status === "ACTIVE" ? <Badge tone="success">Active</Badge> : <Badge>Terminée</Badge>}
              </p>
              <p className="text-xs text-slate-500">
                Du {fmtDateTime(a.started_at)} {a.ended_at && `au ${fmtDateTime(a.ended_at)}`} · affecté par {a.assigned_by_name}
                {a.ended_by_name && ` · terminé par ${a.ended_by_name}`}
              </p>
              {a.reason && <p className="text-xs text-slate-600">Motif : {a.reason}</p>}
              {a.end_reason && <p className="text-xs text-slate-600">Motif de fin : {a.end_reason}</p>}
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}
