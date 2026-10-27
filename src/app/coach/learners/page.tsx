"use client";
import Link from "next/link";
import { Avatar, Badge, Card, EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/display";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { fmtDate, fmtRelative } from "@/lib/format";
import { appNow } from "@/lib/clock";

export default function CoachLearnersPage() {
  const q = useApi(["coach-learners"], () => api.coaches.myLearners());
  return (
    <>
      <PageHeader title="Mes apprenants" description="Apprenants qui vous sont affectés ou dont vous suivez une demande." />
      <Card>
        {q.isLoading ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data!.length === 0 ? (
          <EmptyState title="Aucun apprenant" description="L’administrateur ne vous a pas encore affecté d’apprenant." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {q.data!.map((l) => (
              <li key={l.id}>
                <Link href={`/coach/learners/${l.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                  <Avatar name={l.full_name} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                      {l.full_name}
                      {!l.is_assigned && <Badge tone="neutral">Demande suivie</Badge>}
                      {l.status !== "ACTIVE" && <Badge tone="warning">Compte suspendu</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {l.assigned_since ? `Affecté(e) depuis le ${fmtDate(l.assigned_since)}` : "Non affecté(e) à vous"} · {l.total_requests} demande(s)
                      {l.last_activity && ` · activité ${fmtRelative(l.last_activity, appNow())}`}
                    </p>
                  </div>
                  {l.open_requests > 0 && <Badge tone="brand">{l.open_requests} ouverte(s)</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
