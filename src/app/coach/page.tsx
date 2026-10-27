"use client";
import { AlarmClock, AlertOctagon, Hourglass, Inbox, MessageSquare, Star, UserRoundSearch } from "lucide-react";
import Link from "next/link";
import { Card, CardHeader, EmptyState, ErrorState, Loading, PageHeader, StatCard } from "@/components/ui/display";
import { PriorityBadge, SlaBadge, StatusBadge } from "@/components/requests/badges";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { fmtDateTime, fmtRelative, fmtScore } from "@/lib/format";
import { appNow } from "@/lib/clock";

export default function CoachDashboard() {
  const q = useApi(["coach-dashboard"], () => api.reports.coachDashboard());
  const space = useApi(["coach-space"], () => api.coaches.myCoachSpace());
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data!;
  return (
    <div className="space-y-5">
      <PageHeader title="Tableau de bord" description="Vos demandes à traiter, échéances et derniers messages." />
      {space.data?.absent_now && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Vous êtes déclaré absent jusqu’au {fmtDateTime(space.data.absent_now.ends_at)}. Les échéances de vos demandes ne sont pas suspendues : l’administrateur est alerté si une action est nécessaire.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="À traiter" value={d.counts.todo} tone="brand" href="/coach/requests?view=todo" icon={<Inbox className="h-4 w-4" />} />
        <StatCard label="En attente de ma réponse" value={d.counts.new} hint="Non encore prises en charge" href="/coach/requests?view=todo" icon={<Hourglass className="h-4 w-4" />} />
        <StatCard label="Attente apprenant" value={d.counts.waiting_learner} href="/coach/requests?view=waiting_learner" icon={<UserRoundSearch className="h-4 w-4" />} />
        <StatCard label="En retard" value={d.counts.overdue} tone={d.counts.overdue ? "danger" : "neutral"} href="/coach/requests?view=overdue" icon={<AlertOctagon className="h-4 w-4" />} />
        <StatCard label="Échéances proches" value={d.counts.due_soon} tone={d.counts.due_soon ? "warning" : "neutral"} href="/coach/requests?view=todo" icon={<AlarmClock className="h-4 w-4" />} />
        <StatCard label="Messages non lus" value={d.counts.unread} icon={<MessageSquare className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Premières réponses attendues" description="Triées par échéance — délai cible en heures ouvrées." actions={<Link href="/coach/requests?view=todo" className="text-xs font-medium text-brand-700 hover:underline">Tout voir</Link>} />
          {d.urgent.length === 0 ? (
            <EmptyState title="Aucune première réponse en attente" description="Toutes vos demandes ont reçu une première réponse." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.urgent.map((r) => (
                <li key={r.id}>
                  <Link href={`/coach/requests/${r.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-500">{r.reference}</span>
                        <StatusBadge status={r.status} />
                        <PriorityBadge priority={r.priority} hideNormal />
                        <SlaBadge sla={r.sla} />
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-slate-900">{r.subject}</p>
                      <p className="text-xs text-slate-500">{r.learner.full_name}</p>
                    </div>
                    <div className="text-xs text-slate-500 sm:text-right">
                      Échéance
                      <span className="block font-medium text-slate-800">{fmtDateTime(r.due_at)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Derniers messages reçus" icon={<MessageSquare className="h-4 w-4" />} />
            {d.last_messages.length === 0 ? (
              <EmptyState title="Aucun message" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {d.last_messages.map((m) => (
                  <li key={m.id}>
                    <Link href={`/coach/requests/${m.request_id}`} className="block px-4 py-3 hover:bg-slate-50 sm:px-5">
                      <p className="text-xs text-slate-500">
                        {m.sender} · {m.reference} · {fmtRelative(m.created_at, appNow())}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-slate-700">{m.excerpt}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {d.ratings && (
            <Card>
              <CardHeader title="Mes évaluations" icon={<Star className="h-4 w-4" />} description={`${d.ratings.count} évaluation(s) · moyenne ${fmtScore(d.ratings.average)}`} />
              {d.ratings.recent.length === 0 ? (
                <EmptyState title="Aucune évaluation" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {d.ratings.recent.map((r, i) => (
                    <li key={i} className="px-4 py-2.5 text-sm sm:px-5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-slate-500">{r.reference}</span>
                        <span className="flex" aria-label={`${r.score} sur 5`}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star key={n} className={`h-3.5 w-3.5 ${n <= r.score ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                          ))}
                        </span>
                      </div>
                      {r.comment && <p className="mt-1 text-slate-600">« {r.comment} »</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
