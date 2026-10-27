"use client";
import { keepPreviousData } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";
import { REQUEST_STATUSES } from "@/modules/core/types";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardBody, CardHeader, ErrorState, Loading, PageHeader, StatCard } from "@/components/ui/display";
import { Select } from "@/components/ui/form";
import { usePeriod } from "@/components/admin/period";
import { api, downloadText } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { fmtHours, fmtPercent, fmtScore, fmtWorkingMinutes } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/labels";

function Bar({ value, max, label, count }: { value: number; max: number; label: string; count: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-3 text-sm">
      <span className="truncate text-slate-600" title={label}>
        {label}
      </span>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
      </div>
      <span className="text-right font-medium tabular-nums text-slate-800">{count}</span>
    </div>
  );
}

export default function ReportsPage() {
  const { period, picker } = usePeriod("90");
  const [coachId, setCoachId] = useState("");
  const coaches = useApi(["coaches-assignable"], () => api.coaches.assignableCoaches());
  const params = { from: period.from, to: period.to, coachId: coachId || undefined };
  const q = useApi(["report", params], () => api.reports.reportMetrics(params), { placeholderData: keepPreviousData });
  const exp = useAction(
    async () => {
      const csv = await api.reports.exportRequestsCsv(params);
      if (!csv) throw new Error("Aucune demande sur la période.");
      downloadText(`demandes-${period.from.slice(0, 10)}-${period.to.slice(0, 10)}.csv`, csv);
    },
    { success: "Export téléchargé (métadonnées uniquement, sans contenu des échanges)." },
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rapports"
        description="Indicateurs calculés à partir des données enregistrées, par cycle de traitement."
        actions={
          <>
            {picker}
            <Select aria-label="Coach" value={coachId} onChange={(e) => setCoachId(e.target.value)} className="w-48">
              <option value="">Tous les coachs</option>
              {coaches.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </Select>
            <Button variant="outline" icon={<Download className="h-4 w-4" />} loading={exp.pending} onClick={() => void exp.run()}>
              Exporter (CSV)
            </Button>
          </>
        }
      />
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        (() => {
          const m = q.data!;
          const maxStatus = Math.max(1, ...Object.values(m.by_status).map((v) => v ?? 0));
          const maxCat = Math.max(1, ...m.by_category.map((c) => c.count));
          return (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
                <StatCard label="Reçues" value={m.received} />
                <StatCard label="Ouvertes (période)" value={m.open_in_period} />
                <StatCard label="Clôturées" value={m.closed} />
                <StatCard label="Annulées" value={m.cancelled} />
                <StatCard label="En retard (actuel)" value={m.overdue_now} tone={m.overdue_now ? "danger" : "neutral"} />
                <StatCard label="Réouvertures" value={m.reopened} />
                <StatCard label="Note moyenne" value={fmtScore(m.satisfaction.avg_score)} />
                <StatCard label="Taux d’évaluation" value={fmtPercent(m.satisfaction.rating_rate)} />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Délais" description="Les durées ouvrées excluent nuits, week-ends, pauses et jours fériés." />
                  <CardBody>
                    <dl className="divide-y divide-slate-100 text-sm">
                      {[
                        ["Délai moyen de première réponse", fmtWorkingMinutes(m.first_response.avg_working_minutes)],
                        ["Premières réponses dans le délai cible", `${fmtPercent(m.first_response.on_time_rate)} (${m.first_response.on_time}/${m.first_response.measured})`],
                        ["Durée moyenne de résolution (ouvrée)", fmtWorkingMinutes(m.resolution.avg_working_minutes)],
                        ["Durée moyenne de résolution (calendaire)", fmtHours(m.resolution.avg_calendar_hours)],
                        ["Temps moyen d’attente de l’apprenant", fmtWorkingMinutes(m.resolution.avg_learner_waiting_minutes)],
                        ["Résolution nette (hors attente apprenant)", fmtWorkingMinutes(m.resolution.avg_net_working_minutes)],
                        ["Cycles clôturés mesurés", m.resolution.cycles],
                      ].map(([k, v]) => (
                        <div key={k as string} className="flex justify-between gap-4 py-2">
                          <dt className="text-slate-600">{k}</dt>
                          <dd className="font-medium tabular-nums text-slate-900">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader title="Quotas" description="Droits en vigueur avec quota activé." />
                  <CardBody className="space-y-3">
                    <p className="text-3xl font-semibold tabular-nums text-slate-900">{fmtPercent(m.quota.usage_rate)}</p>
                    <p className="text-sm text-slate-600">
                      {m.quota.used} unité(s) consommée(s) sur {m.quota.total} attribuée(s) · {m.quota.learners} apprenant(s) concerné(s)
                    </p>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full bg-gold-500" style={{ width: `${(m.quota.usage_rate ?? 0) * 100}%` }} />
                    </div>
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader title="Demandes par statut" description="Statut actuel des demandes reçues sur la période." />
                  <CardBody className="space-y-2">
                    {REQUEST_STATUSES.filter((s) => s !== "DRAFT").map((s) => (
                      <Bar key={s} label={STATUS_LABELS[s]} value={m.by_status[s] ?? 0} max={maxStatus} count={m.by_status[s] ?? 0} />
                    ))}
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader title="Demandes par catégorie" />
                  <CardBody className="space-y-2">
                    {m.by_category.map((c) => (
                      <Bar key={c.category_id} label={c.name} value={c.count} max={maxCat} count={c.count} />
                    ))}
                  </CardBody>
                </Card>
              </div>

              <Card>
                <CardHeader title="Par coach" />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-2.5 font-medium">Coach</th>
                        <th className="px-3 py-2.5 text-right font-medium">Reçues</th>
                        <th className="px-3 py-2.5 text-right font-medium">Clôturées</th>
                        <th className="px-3 py-2.5 text-right font-medium">Ouvertes</th>
                        <th className="px-3 py-2.5 text-right font-medium">En retard</th>
                        <th className="px-3 py-2.5 text-right font-medium">1ʳᵉ réponse moy.</th>
                        <th className="px-3 py-2.5 text-right font-medium">Dans les délais</th>
                        <th className="px-3 py-2.5 text-right font-medium">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {m.by_coach.map((c) => (
                        <tr key={c.coach_id}>
                          <td className="px-5 py-2.5 font-medium text-slate-900">{c.coach_name}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{c.received}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{c.closed}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{c.open_now}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{c.overdue_now}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{fmtWorkingMinutes(c.avg_first_response_minutes, "")}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{fmtPercent(c.on_time_rate)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{fmtScore(c.avg_rating)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Alert tone="neutral">
                Définitions : la première réponse est le premier message humain du coach dans un cycle (l’accusé de réception automatique n’est pas compté). Un cycle dont l’échéance est dépassée sans réponse est compté hors délai. Les réouvertures créent de nouveaux cycles, mesurés séparément.
              </Alert>
            </>
          );
        })()
      )}
    </div>
  );
}
