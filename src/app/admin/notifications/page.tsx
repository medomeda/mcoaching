"use client";
import { keepPreviousData } from "@tanstack/react-query";
import { MailWarning, Play, RotateCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, EmptyState, ErrorState, Loading, PageHeader, Pagination, StatCard, Tabs } from "@/components/ui/display";
import { NotificationsList } from "@/components/shared/notifications-list";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { fmtDateTime } from "@/lib/format";
import { EMAIL_STATUS_LABELS } from "@/lib/labels";

type Tab = "mine" | "emails" | "jobs";
type EmailStatus = "PENDING" | "RETRY" | "SENT" | "FAILED";

export default function AdminNotificationsPage() {
  const [tab, setTab] = useState<Tab>("mine");
  const summary = useApi(["incidents-summary"], () => api.notifications.incidentsSummary());
  return (
    <div className="space-y-4">
      <PageHeader title="Notifications et incidents" description="Vos notifications, la supervision des envois d’e-mails et des tâches planifiées." />
      {summary.data && summary.data.failed_emails > 0 && (
        <Alert tone="danger" icon={<MailWarning className="h-4 w-4" />} title={`${summary.data.failed_emails} e-mail(s) en échec définitif`}>
          Les demandes et messages concernés restent enregistrés. Vous pouvez relancer les envois depuis l’onglet « Envois d’e-mails ».
        </Alert>
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "mine", label: "Mes notifications" },
          { value: "emails", label: "Envois d’e-mails", count: summary.data ? summary.data.failed_emails + summary.data.retrying_emails : undefined },
          { value: "jobs", label: "Tâches planifiées", count: summary.data?.failed_jobs || undefined },
        ]}
      />
      {tab === "mine" && <NotificationsList base="/admin" />}
      {tab === "emails" && <Emails />}
      {tab === "jobs" && <Jobs />}
    </div>
  );
}

function Emails() {
  const [status, setStatus] = useState<EmailStatus | "">("FAILED");
  const [page, setPage] = useState(1);
  const q = useApi(["emails", status, page], () => api.notifications.listEmailDeliveries({ status: status || undefined, page, pageSize: 20 }), { placeholderData: keepPreviousData });
  const retry = useAction((id: string) => api.notifications.retryEmail(id), { success: "Nouvelle tentative d’envoi lancée." });
  return (
    <div className="space-y-3">
      {q.data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(["FAILED", "RETRY", "PENDING", "SENT"] as const).map((s) => (
            <button key={s} onClick={() => (setStatus(s), setPage(1))} className="text-left">
              <StatCard label={EMAIL_STATUS_LABELS[s]} value={q.data.counts[s]} tone={s === "FAILED" && q.data.counts[s] ? "danger" : s === "RETRY" && q.data.counts[s] ? "warning" : "neutral"} />
            </button>
          ))}
        </div>
      )}
      <Card>
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 text-sm sm:px-5">
          <span className="font-medium text-slate-700">{status ? EMAIL_STATUS_LABELS[status] : "Tous les envois"}</span>
          {status && (
            <Button size="sm" variant="ghost" onClick={() => setStatus("")}>
              Voir tout
            </Button>
          )}
        </div>
        {q.isLoading ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data!.items.length === 0 ? (
          <EmptyState title="Aucun envoi" filtered={!!status} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Destinataire</th>
                    <th className="px-3 py-2.5 font-medium">Gabarit</th>
                    <th className="px-3 py-2.5 font-medium">Statut</th>
                    <th className="px-3 py-2.5 font-medium">Tentatives</th>
                    <th className="px-3 py-2.5 font-medium">Dernière tentative</th>
                    <th className="px-3 py-2.5 font-medium">Erreur</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {q.data!.items.map((e) => (
                    <tr key={e.id}>
                      <td className="px-5 py-2.5 text-slate-800">{e.recipient}</td>
                      <td className="px-3 py-2.5 text-slate-600">
                        {e.template_key}
                        {e.template_params.title && <span className="block max-w-[16rem] truncate text-xs text-slate-400">{e.template_params.title}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={e.status === "SENT" ? "success" : e.status === "FAILED" ? "danger" : "warning"}>{EMAIL_STATUS_LABELS[e.status]}</Badge>
                        {e.status === "RETRY" && e.next_attempt_at && <span className="block text-[11px] text-slate-400">prochaine : {fmtDateTime(e.next_attempt_at)}</span>}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{e.attempt_count}</td>
                      <td className="px-3 py-2.5 text-slate-600">{fmtDateTime(e.last_attempt_at)}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-red-600">{e.error_code ?? ""}</td>
                      <td className="px-3 py-2.5 text-right">
                        {e.status !== "SENT" && (
                          <Button size="sm" variant="outline" icon={<RotateCw className="h-3.5 w-3.5" />} loading={retry.pending} onClick={() => void retry.run(e.id)}>
                            Réessayer
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={q.data!.page} pages={q.data!.pages} total={q.data!.total} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}

function Jobs() {
  const q = useApi(["job-runs"], () => api.notifications.listJobRuns());
  const run = useAction(() => api.notifications.runJobsNow(), { success: "Tâches planifiées exécutées." });
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
        <p className="text-sm text-slate-600">Rappels (50 % / 75 %), retards, escalades, envois et relances d’e-mails, nettoyage technique. Traitements idempotents : aucun doublon.</p>
        <Button size="sm" icon={<Play className="h-4 w-4" />} loading={run.pending} onClick={() => void run.run()}>
          Exécuter maintenant
        </Button>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : q.data!.length === 0 ? (
        <EmptyState title="Aucune exécution ayant produit un effet" description="Seules les exécutions ayant envoyé un rappel, un e-mail ou rencontré une erreur sont conservées." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {q.data!.map((j) => (
            <li key={j.id} className="flex flex-col gap-1 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <span>
                <Badge tone={j.ok ? "success" : "danger"}>{j.ok ? "Succès" : "Erreur"}</Badge> <span className="text-slate-700">{j.summary}</span>
                {j.error && <span className="block font-mono text-xs text-red-600">{j.error}</span>}
              </span>
              <span className="text-xs text-slate-400">{fmtDateTime(j.started_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
