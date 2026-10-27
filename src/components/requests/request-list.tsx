"use client";
import { keepPreviousData } from "@tanstack/react-query";
import { MessageSquare, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PRIORITIES, REQUEST_STATUSES, type Priority, type RequestStatus } from "@/modules/core/types";
import type { RequestListFilters } from "@/server/api/requests";
import { Badge, Card, EmptyState, ErrorState, Loading, Pagination, Tabs } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/form";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/labels";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { appNow } from "@/lib/clock";
import { PriorityBadge, SlaBadge, StatusBadge } from "./badges";

type View = NonNullable<RequestListFilters["view"]>;
export type ListRole = "ADMIN" | "COACH" | "LEARNER";

const VIEWS: Record<ListRole, Array<{ value: View; label: string }>> = {
  COACH: [
    { value: "all", label: "Toutes" },
    { value: "todo", label: "À traiter" },
    { value: "in_progress", label: "En cours" },
    { value: "waiting_learner", label: "En attente de l’apprenant" },
    { value: "overdue", label: "En retard" },
    { value: "closed", label: "Clôturées" },
  ],
  LEARNER: [
    { value: "all", label: "Toutes" },
    { value: "open", label: "En cours" },
    { value: "drafts", label: "Brouillons" },
    { value: "closed", label: "Clôturées" },
  ],
  ADMIN: [
    { value: "all", label: "Toutes" },
    { value: "open", label: "Ouvertes" },
    { value: "needs_attention", label: "Intervention requise" },
    { value: "overdue", label: "En retard" },
    { value: "due_soon", label: "Échéance proche" },
    { value: "closed", label: "Clôturées" },
  ],
};

function periodToRange(p: string): { from?: string; to?: string } {
  if (!p) return {};
  const days = Number(p);
  return { from: new Date(appNow() - days * 86_400_000).toISOString() };
}

export function RequestList({ role, base, emptyAction, learnerId, fixedCoachId }: { role: ListRole; base: string; emptyAction?: ReactNode; learnerId?: string; fixedCoachId?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [view, setView] = useState<View>((params.get("view") as View) || "all");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<RequestStatus | "">("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [categoryId, setCategoryId] = useState("");
  const [coachId, setCoachId] = useState(fixedCoachId ?? params.get("coachId") ?? "");
  const [period, setPeriod] = useState("");
  const [sort, setSort] = useState<NonNullable<RequestListFilters["sort"]>>(role === "COACH" ? "due_asc" : "updated_desc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [view, debounced, status, priority, categoryId, coachId, period, sort]);

  const filters: RequestListFilters = useMemo(
    () => ({
      view,
      q: debounced || undefined,
      statuses: status ? [status] : undefined,
      priority: priority || undefined,
      categoryId: categoryId || undefined,
      coachId: coachId || undefined,
      learnerId,
      sort,
      page,
      pageSize: 15,
      ...periodToRange(period),
    }),
    [view, debounced, status, priority, categoryId, coachId, learnerId, period, sort, page],
  );

  const list = useApi(["requests", role, filters], () => api.requests.listRequests(filters), { placeholderData: keepPreviousData });
  const categories = useApi(["categories"], () => api.settings.listCategories());
  const coaches = useApi(["coaches-assignable"], () => api.coaches.assignableCoaches(), { enabled: role === "ADMIN" });

  const filtered = !!(debounced || status || priority || categoryId || (coachId && !fixedCoachId) || period || view !== "all");

  const changeView = (v: View) => {
    setView(v);
    const sp = new URLSearchParams(params.toString());
    if (v === "all") sp.delete("view");
    else sp.set("view", v);
    router.replace(`?${sp.toString()}`, { scroll: false });
  };

  return (
    <Card>
      <div className="space-y-3 border-b border-slate-100 p-3 sm:p-4">
        <Tabs value={view} onChange={changeView} items={VIEWS[role]} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input aria-label="Rechercher" placeholder="Référence ou sujet…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select aria-label="Statut" value={status} onChange={(e) => setStatus(e.target.value as RequestStatus | "")}>
            <option value="">Tous les statuts</option>
            {REQUEST_STATUSES.filter((s) => role === "LEARNER" || s !== "DRAFT").map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <Select aria-label="Catégorie" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Toutes catégories</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {role !== "LEARNER" && (
            <Select aria-label="Priorité" value={priority} onChange={(e) => setPriority(e.target.value as Priority | "")}>
              <option value="">Toutes priorités</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          )}
          {role === "ADMIN" && !fixedCoachId && (
            <Select aria-label="Coach" value={coachId} onChange={(e) => setCoachId(e.target.value)}>
              <option value="">Tous les coachs</option>
              {coaches.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </Select>
          )}
          <Select aria-label="Période" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="">Toute période</option>
            <option value="7">7 derniers jours</option>
            <option value="30">30 derniers jours</option>
            <option value="90">90 derniers jours</option>
          </Select>
          <Select aria-label="Tri" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="updated_desc">Activité récente</option>
            <option value="due_asc">Échéance la plus proche</option>
            <option value="submitted_asc">Plus anciennes d’abord</option>
            <option value="submitted_desc">Plus récentes d’abord</option>
            {role !== "LEARNER" && <option value="priority_desc">Priorité</option>}
          </Select>
        </div>
      </div>

      {list.isLoading ? (
        <Loading />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data && list.data.items.length === 0 ? (
        filtered ? (
          <EmptyState filtered title="Aucun résultat" description="Aucune demande ne correspond à ces filtres." />
        ) : (
          <EmptyState title="Aucune demande pour le moment" action={emptyAction} />
        )
      ) : (
        <>
          <ul className="divide-y divide-slate-100" aria-busy={list.isFetching}>
            {list.data?.items.map((r) => (
              <li key={r.id}>
                <Link href={`${base}/${r.id}`} className="flex flex-col gap-2 px-4 py-3 transition hover:bg-slate-50 sm:px-5 lg:flex-row lg:items-center lg:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-mono text-xs text-slate-500">{r.reference ?? "Brouillon"}</span>
                      <StatusBadge status={r.status} />
                      <PriorityBadge priority={r.priority} hideNormal />
                      <SlaBadge sla={r.sla} />
                      {"attention" in r &&
                        (r as { attention: string[] }).attention.map((a) => (
                          <Badge key={a} tone="danger">
                            {a}
                          </Badge>
                        ))}
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-slate-900">{r.subject}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {r.category?.name}
                      {role !== "LEARNER" && ` · ${r.learner.full_name}`}
                      {role !== "COACH" && r.coach && ` · Coach : ${r.coach.full_name}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-xs text-slate-500 lg:w-64 lg:justify-end">
                    {r.unread > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-700 px-2 py-0.5 font-semibold text-white">
                        <MessageSquare className="h-3 w-3" aria-hidden /> {r.unread} nouveau{r.unread > 1 ? "x" : ""}
                      </span>
                    )}
                    <div className="text-right">
                      {r.due_at && r.sla?.awaiting_first_response ? <p>Échéance : {fmtDateTime(r.due_at)}</p> : <p>Soumise : {fmtDateTime(r.submitted_at ?? r.created_at)}</p>}
                      <p className="text-slate-400">Activité {fmtRelative(r.updated_at, appNow())}</p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {list.data && <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} onPage={setPage} />}
        </>
      )}
    </Card>
  );
}
