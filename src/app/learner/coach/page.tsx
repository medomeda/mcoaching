"use client";
import { CalendarDays, Plane } from "lucide-react";
import { Alert, Avatar, Badge, Card, CardBody, CardHeader, EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/display";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { DAY_LABELS } from "@/lib/labels";

export default function MyCoachPage() {
  const q = useApi(["my-coach"], () => api.coaches.myCoach());
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const c = q.data;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Mon coach" />
      {!c ? (
        <Card>
          <EmptyState title="Aucun coach affecté" description="L’administrateur doit vous affecter un coach avant que vous puissiez soumettre une demande." />
        </Card>
      ) : (
        <>
          {c.absent_until && (
            <Alert tone="warning" icon={<Plane className="h-4 w-4" />}>
              Votre coach est absent jusqu’au {fmtDateTime(c.absent_until)}. Vos demandes restent enregistrées et suivies par l’administration.
            </Alert>
          )}
          <Card>
            <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <Avatar name={c.full_name} className="h-16 w-16 text-lg" />
              <div className="space-y-2">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{c.full_name}</h2>
                  <p className="text-xs text-slate-500">Votre coach depuis le {fmtDate(c.since)}</p>
                </div>
                {c.profile?.bio && <p className="text-sm leading-relaxed text-slate-700">{c.profile.bio}</p>}
                {!!c.profile?.specialties.length && (
                  <div className="flex flex-wrap gap-1.5">
                    {c.profile.specialties.map((s) => (
                      <Badge key={s} tone="brand">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Disponibilités habituelles" icon={<CalendarDays className="h-4 w-4" />} description="Indicatives : les demandes sont traitées selon le délai cible en heures ouvrées." />
            <CardBody>
              {c.availability.length === 0 ? (
                <p className="text-sm text-slate-500">Non renseignées.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {c.availability.map((s) => (
                    <li key={s.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <span className="font-medium">{DAY_LABELS[s.day_of_week]}</span> · {s.start_time} – {s.end_time}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
