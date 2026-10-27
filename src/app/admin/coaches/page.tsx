"use client";
import { Plane, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/display";
import { CreateUserDialog } from "@/components/admin/user-dialogs";
import { UserStatusBadge } from "@/components/admin/users-table";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { fmtDateTime, fmtScore } from "@/lib/format";

export default function AdminCoachesPage() {
  const q = useApi(["coaches"], () => api.coaches.listCoaches());
  const [create, setCreate] = useState(false);
  return (
    <>
      <PageHeader
        title="Coachs"
        description="Charge, retards, disponibilités et apprenants suivis."
        actions={
          <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setCreate(true)}>
            Nouveau coach
          </Button>
        }
      />
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data!.length === 0 ? (
        <Card>
          <EmptyState title="Aucun coach" action={<Button size="sm" onClick={() => setCreate(true)}>Créer un coach</Button>} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {q.data!.map((c) => (
            <Link key={c.id} href={`/admin/coaches/${c.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-brand-300 hover:shadow-sm">
              <div className="flex items-start gap-3">
                <Avatar name={c.full_name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{c.full_name}</p>
                  <p className="truncate text-xs text-slate-500">{c.email}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <UserStatusBadge status={c.status} />
                    {c.absent_now && (
                      <Badge tone="warning" icon={<Plane className="h-3 w-3" />}>
                        Absent jusqu’au {fmtDateTime(c.absent_now.ends_at)}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                {[
                  ["Apprenants", c.stats.assigned_learners, ""],
                  ["Ouvertes", c.stats.open_requests, ""],
                  ["En retard", c.stats.overdue_requests, c.stats.overdue_requests ? "text-red-600" : ""],
                  ["Note", fmtScore(c.stats.average_rating).replace(" / 5", ""), ""],
                ].map(([l, v, cls]) => (
                  <div key={l as string} className="rounded-lg bg-slate-50 px-1 py-2">
                    <dt className="text-[11px] text-slate-500">{l}</dt>
                    <dd className={`text-base font-semibold tabular-nums text-slate-900 ${cls}`}>{v}</dd>
                  </div>
                ))}
              </dl>
            </Link>
          ))}
        </div>
      )}
      <CreateUserDialog open={create} onOpenChange={setCreate} defaultRole="COACH" lockRole />
    </>
  );
}
