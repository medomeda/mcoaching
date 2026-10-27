"use client";
import { keepPreviousData } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Bell, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, ErrorState, Loading, Pagination, Tabs } from "@/components/ui/display";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { NOTIFICATION_TYPE_LABELS } from "@/lib/labels";
import { appNow } from "@/lib/clock";

export function NotificationsList({ base }: { base: string }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(1);
  const q = useApi(["notifications", filter, page], () => api.notifications.listMyNotifications({ unreadOnly: filter === "unread", page, pageSize: 20 }), { placeholderData: keepPreviousData });
  const markAll = useAction(() => api.notifications.markAllNotificationsRead(), { success: "Toutes les notifications sont marquées comme lues." });

  const open = async (id: string, requestId: string | null) => {
    await api.notifications.markNotificationRead(id).catch(() => undefined);
    if (requestId) router.push(`${base}/requests/${requestId}`);
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3 sm:px-5">
        <Tabs
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
          items={[
            { value: "all", label: "Toutes" },
            { value: "unread", label: "Non lues", count: q.data?.unread },
          ]}
        />
        <Button size="sm" variant="ghost" icon={<CheckCheck className="h-4 w-4" />} disabled={!q.data?.unread} loading={markAll.pending} onClick={() => void markAll.run()}>
          Tout marquer comme lu
        </Button>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <EmptyState icon={<Bell className="h-6 w-6" />} title={filter === "unread" ? "Aucune notification non lue" : "Aucune notification"} />
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {q.data!.items.map((n) => (
              <li key={n.id}>
                <button onClick={() => void open(n.id, n.related_request_id)} className={clsx("flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 sm:px-5", !n.read_at && "bg-brand-50/50")}>
                  <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-brand-600")} aria-label={n.read_at ? undefined : "Non lue"} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={clsx("text-sm", n.read_at ? "text-slate-700" : "font-semibold text-slate-900")}>{n.title}</span>
                      <Badge tone={["ESCALATION", "REQUEST_OVERDUE", "NOTIFICATION_FAILURE"].includes(n.type) ? "danger" : n.type === "DEADLINE_REMINDER" || n.type === "COACH_UNAVAILABLE" ? "warning" : "neutral"}>{NOTIFICATION_TYPE_LABELS[n.type]}</Badge>
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-600">{n.body}</span>
                    <span className="mt-0.5 block text-xs text-slate-400" title={fmtDateTime(n.created_at)}>
                      {fmtRelative(n.created_at, appNow())}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Pagination page={q.data!.page} pages={q.data!.pages} total={q.data!.total} onPage={setPage} />
        </>
      )}
    </Card>
  );
}
