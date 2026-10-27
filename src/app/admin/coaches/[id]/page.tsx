"use client";
import { CalendarClock, Plane, UserCog, UsersRound } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense } from "react";
import { LinkButton } from "@/components/ui/button";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, ErrorState, Loading, PageHeader, StatCard } from "@/components/ui/display";
import { UserStatusBadge } from "@/components/admin/users-table";
import { RequestList } from "@/components/requests/request-list";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { fmtDate, fmtDateTime, fmtScore } from "@/lib/format";
import { DAY_LABELS } from "@/lib/labels";

export default function AdminCoachDetail() {
  const { id } = useParams<{ id: string }>();
  const q = useApi(["coach", id], () => api.coaches.getCoachDetail(id));
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data!;
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/admin/coaches", label: "Coachs" }}
        title={d.coach.full_name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {d.coach.email} <UserStatusBadge status={d.coach.status} />
          </span>
        }
        actions={
          <LinkButton href={`/admin/users/${d.coach.id}`} size="sm" variant="outline" icon={<UserCog className="h-4 w-4" />}>
            Gérer le compte
          </LinkButton>
        }
      />
      {d.coach.status === "SUSPENDED" && d.stats.open_requests > 0 && (
        <Alert tone="danger" title="Continuité de service">
          Ce coach est suspendu et reste responsable de {d.stats.open_requests} demande(s) ouverte(s). Réaffectez-les depuis la liste ci-dessous.
        </Alert>
      )}
      {d.absent_now && d.stats.awaiting_coach > 0 && (
        <Alert tone="warning" icon={<Plane className="h-4 w-4" />} title="Coach absent">
          Absent jusqu’au {fmtDateTime(d.absent_now.ends_at)} avec {d.stats.awaiting_coach} demande(s) nécessitant une action. Les échéances ne sont pas suspendues.
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Apprenants" value={d.stats.assigned_learners} />
        <StatCard label="Demandes ouvertes" value={d.stats.open_requests} />
        <StatCard label="Action du coach attendue" value={d.stats.awaiting_coach} />
        <StatCard label="En retard" value={d.stats.overdue_requests} tone={d.stats.overdue_requests ? "danger" : "neutral"} />
        <StatCard label="Satisfaction" value={fmtScore(d.stats.average_rating)} hint={`${d.stats.ratings_count} évaluation(s)`} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Apprenants affectés" icon={<UsersRound className="h-4 w-4" />} />
          {d.learners.length === 0 ? (
            <EmptyState title="Aucun apprenant" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.learners.map((l) => (
                <li key={l.id}>
                  <Link href={`/admin/users/${l.id}`} className="block px-4 py-2.5 text-sm hover:bg-slate-50 sm:px-5">
                    <span className="font-medium text-slate-800">{l.full_name}</span>
                    <span className="block text-xs text-slate-500">depuis le {fmtDate(l.since)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Disponibilités" icon={<CalendarClock className="h-4 w-4" />} />
          <CardBody>
            {d.availability.length === 0 ? (
              <p className="text-sm text-slate-500">Non renseignées.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {d.availability.map((s) => (
                  <li key={s.id} className={s.is_active ? "" : "text-slate-400 line-through"}>
                    {DAY_LABELS[s.day_of_week]} · {s.start_time} – {s.end_time}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Absences" icon={<Plane className="h-4 w-4" />} />
          <CardBody>
            {d.absences.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune absence déclarée.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {d.absences.map((a) => (
                  <li key={a.id}>
                    {fmtDateTime(a.starts_at)} → {fmtDateTime(a.ends_at)} {d.absent_now?.id === a.id && <Badge tone="warning">En cours</Badge>}
                    {a.reason && <span className="block text-xs text-slate-500">{a.reason}</span>}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
      <h2 className="text-sm font-semibold text-slate-700">Demandes du coach</h2>
      <Suspense>
        <RequestList role="ADMIN" base="/admin/requests" fixedCoachId={d.coach.id} />
      </Suspense>
    </div>
  );
}
