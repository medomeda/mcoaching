"use client";
import { keepPreviousData } from "@tanstack/react-query";
import { AlertOctagon, Clock, Inbox, Percent, Star, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState, ErrorState, Loading, PageHeader, StatCard } from "@/components/ui/display";
import { usePeriod } from "@/components/admin/period";
import { PriorityBadge, SlaBadge, StatusBadge } from "@/components/requests/badges";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { fmtDateTime, fmtPercent, fmtRelative, fmtScore, fmtWorkingMinutes } from "@/lib/format";
import { appNow } from "@/lib/clock";

export default function AdminDashboard() {
  const { period, picker } = usePeriod("30");
  const q = useApi(["admin-dashboard", period.from, period.to], () => api.reports.adminDashboard({ from: period.from, to: period.to }), { placeholderData: keepPreviousData });

  return (
    <div className="space-y-5">
      <PageHeader title="Tableau de bord" description="Supervision du service de coaching individuel." actions={picker} />
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <Content data={q.data!} />
      )}
    </div>
  );
}

function Content({ data }: { data: Awaited<ReturnType<typeof api.reports.adminDashboard>> }) {
  const m = data.metrics;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Demandes ouvertes" value={m.open_now} tone="brand" href="/admin/requests?view=open" icon={<Inbox className="h-4 w-4" />} hint="En ce moment" />
        <StatCard label="En retard" value={m.overdue_now} tone={m.overdue_now ? "danger" : "success"} href="/admin/requests?view=overdue" icon={<AlertOctagon className="h-4 w-4" />} hint="Sans première réponse" />
        <StatCard label="Reçues sur la période" value={m.received} href="/admin/reports" icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="Réponses dans les délais" value={fmtPercent(m.first_response.on_time_rate)} tone={m.first_response.on_time_rate !== null && m.first_response.on_time_rate < 0.8 ? "warning" : "success"} href="/admin/reports" icon={<Percent className="h-4 w-4" />} hint={`${m.first_response.on_time}/${m.first_response.measured} cycles mesurés`} />
        <StatCard label="1ʳᵉ réponse moyenne" value={fmtWorkingMinutes(m.first_response.avg_working_minutes, "")} href="/admin/reports" icon={<Clock className="h-4 w-4" />} hint="En heures ouvrées" />
        <StatCard label="Satisfaction" value={fmtScore(m.satisfaction.avg_score)} href="/admin/reports" icon={<Star className="h-4 w-4" />} hint={`${m.satisfaction.ratings} évaluation(s) · taux ${fmtPercent(m.satisfaction.rating_rate)}`} />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Demandes nécessitant une intervention"
            description="Retards, coach suspendu ou absent, demande sans coach — classées par ancienneté."
            actions={<Link href="/admin/requests?view=needs_attention" className="text-xs font-medium text-brand-700 hover:underline">Tout voir ({data.attention_total})</Link>}
          />
          {data.attention.length === 0 ? (
            <EmptyState title="Aucune intervention requise" description="Toutes les demandes ouvertes sont suivies normalement." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.attention.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/requests/${r.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs text-slate-500">{r.reference}</span>
                        <StatusBadge status={r.status} />
                        <PriorityBadge priority={r.priority} hideNormal />
                        {r.attention.map((a) => (
                          <Badge key={a} tone="danger">
                            {a}
                          </Badge>
                        ))}
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-slate-900">{r.subject}</p>
                      <p className="text-xs text-slate-500">
                        {r.learner.full_name} · Coach : {r.coach?.full_name ?? "—"}
                      </p>
                    </div>
                    <div className="text-xs text-slate-500 sm:text-right">
                      Soumise {fmtRelative(r.submitted_at, appNow())}
                      <span className="block">Échéance {fmtDateTime(r.due_at)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Demandes ouvertes les plus anciennes" />
          {data.oldest.length === 0 ? (
            <EmptyState title="Aucune demande ouverte" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.oldest.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/requests/${r.id}`} className="block px-4 py-2.5 hover:bg-slate-50 sm:px-5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs text-slate-500">{r.reference}</span>
                      <SlaBadge sla={r.sla} />
                    </div>
                    <p className="truncate text-sm text-slate-800">{r.subject}</p>
                    <p className="text-xs text-slate-500">Soumise le {fmtDateTime(r.submitted_at)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Charge par coach" description="Demandes reçues sur la période et situation actuelle." />
        {m.by_coach.length === 0 ? (
          <EmptyState title="Aucun coach" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Coach</th>
                  <th className="px-3 py-2.5 text-right font-medium">Reçues</th>
                  <th className="px-3 py-2.5 text-right font-medium">Ouvertes</th>
                  <th className="px-3 py-2.5 text-right font-medium">En retard</th>
                  <th className="px-3 py-2.5 text-right font-medium">1ʳᵉ réponse moy.</th>
                  <th className="px-3 py-2.5 text-right font-medium">Dans les délais</th>
                  <th className="px-3 py-2.5 text-right font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {m.by_coach.map((c) => (
                  <tr key={c.coach_id} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5">
                      <Link href={`/admin/coaches/${c.coach_id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {c.coach_name}
                      </Link>
                      {c.coach_status !== "ACTIVE" && <Badge tone="danger" className="ml-2">Suspendu</Badge>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.received}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <Link href={`/admin/requests?view=open&coachId=${c.coach_id}`} className="hover:underline">
                        {c.open_now}
                      </Link>
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${c.overdue_now ? "font-semibold text-red-600" : ""}`}>{c.overdue_now}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtWorkingMinutes(c.avg_first_response_minutes, "")}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtPercent(c.on_time_rate)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtScore(c.avg_rating)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
