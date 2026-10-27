"use client";
import { CheckCircle2, FilePlus2, MessageSquare, ShieldCheck, Star, UsersRound } from "lucide-react";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { Alert, Avatar, Badge, Card, CardBody, CardHeader, EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/display";
import { useSession } from "@/components/providers";
import { PriorityBadge, StatusBadge } from "@/components/requests/badges";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { fmtDate, fmtDateTime, fmtRelative } from "@/lib/format";
import { ENTITLEMENT_STATUS_LABELS } from "@/lib/labels";
import { appNow } from "@/lib/clock";

export default function LearnerHome() {
  const { user } = useSession();
  const elig = useApi(["eligibility"], () => api.requests.myEligibility());
  const dash = useApi(["learner-dashboard"], () => api.reports.learnerDashboard());

  if (elig.isLoading || dash.isLoading) return <Loading />;
  if (elig.error || dash.error) return <ErrorState error={elig.error ?? dash.error} onRetry={() => void Promise.all([elig.refetch(), dash.refetch()])} />;
  const e = elig.data!;
  const d = dash.data!;
  const status = e.entitlementStatus;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Bonjour ${user?.full_name.split(" ")[0] ?? ""}`}
        description="Retrouvez vos demandes de coaching et vos échanges avec votre coach."
        actions={
          e.ok ? (
            <LinkButton href="/learner/requests/new" icon={<FilePlus2 className="h-4 w-4" />}>
              Nouvelle demande
            </LinkButton>
          ) : null
        }
      />

      {!e.ok && (
        <Alert tone="warning" title="Vous ne pouvez pas soumettre de nouvelle demande">
          <ul className="list-inside list-disc">
            {e.messages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader title="Mon coach" icon={<UsersRound className="h-4 w-4" />} />
          <CardBody>
            {e.coach ? (
              <Link href="/learner/coach" className="flex items-center gap-3 hover:opacity-80">
                <Avatar name={e.coach.full_name} />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{e.coach.full_name}</span>
                  <span className="text-xs text-brand-700">Voir le profil</span>
                </span>
              </Link>
            ) : (
              <p className="text-sm text-slate-500">Aucun coach ne vous est encore affecté.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Droit au coaching" icon={<ShieldCheck className="h-4 w-4" />} />
          <CardBody className="space-y-1">
            <Badge tone={status === "ACTIVE" ? "success" : status === "NONE" ? "neutral" : "warning"}>{ENTITLEMENT_STATUS_LABELS[status]}</Badge>
            {e.entitlement?.expires_at && <p className="text-xs text-slate-500">Valable jusqu’au {fmtDate(e.entitlement.expires_at)}</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Quota" icon={<CheckCircle2 className="h-4 w-4" />} />
          <CardBody>
            {e.balance.enabled ? (
              <div>
                <p className="text-2xl font-semibold tabular-nums text-slate-900">
                  {e.balance.remaining} <span className="text-sm font-normal text-slate-500">demande(s) restante(s)</span>
                </p>
                <p className="text-xs text-slate-500">
                  {e.balance.used} utilisée(s) sur {(e.balance.limit ?? 0) + e.balance.corrections}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-600">{status === "NONE" ? "—" : "Pas de limite de nombre de demandes."}</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Demandes en cours" actions={<Link href="/learner/requests" className="text-xs font-medium text-brand-700 hover:underline">Tout voir</Link>} />
          {d.open.length === 0 && d.drafts.length === 0 ? (
            <EmptyState title="Aucune demande en cours" description={e.ok ? "Posez une question à votre coach à tout moment." : undefined} action={e.ok ? <LinkButton href="/learner/requests/new" size="sm">Nouvelle demande</LinkButton> : undefined} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {[...d.drafts, ...d.open].map((r) => (
                <li key={r.id}>
                  <Link href={`/learner/requests/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-500">{r.reference ?? "Brouillon"}</span>
                        <StatusBadge status={r.status} />
                        <PriorityBadge priority={r.priority} hideNormal />
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-slate-900">{r.subject}</p>
                    </div>
                    {r.unread > 0 && <Badge tone="brand">{r.unread} nouveau(x)</Badge>}
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
                    <Link href={`/learner/requests/${m.request_id}`} className="block px-4 py-3 hover:bg-slate-50 sm:px-5">
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
          <Card>
            <CardHeader title="Clôturées récemment" />
            {d.recently_closed.length === 0 ? (
              <EmptyState title="Aucune demande clôturée" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {d.recently_closed.map((r) => (
                  <li key={r.id}>
                    <Link href={`/learner/requests/${r.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50 sm:px-5">
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-slate-800">{r.subject}</span>
                        <span className="text-xs text-slate-500">Clôturée le {fmtDateTime(r.closed_at)}</span>
                      </span>
                      {!r.rated ? (
                        <Badge tone="warning" icon={<Star className="h-3 w-3" />}>
                          À évaluer
                        </Badge>
                      ) : (
                        <Badge tone="success">Évaluée</Badge>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
