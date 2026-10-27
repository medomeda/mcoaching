"use client";
import { keepPreviousData } from "@tanstack/react-query";
import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Card, EmptyState, ErrorState, Loading, PageHeader, Pagination } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/form";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { fmtDate } from "@/lib/format";
import { ENTITLEMENT_STATUS_LABELS } from "@/lib/labels";

type St = "ACTIVE" | "SUSPENDED" | "EXPIRED" | "NOT_STARTED" | "NONE";

export default function EntitlementsPage() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<St | "">("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [debounced, status]);
  const filters = { q: debounced || undefined, status: status || undefined, page, pageSize: 20 };
  const list = useApi(["entitlements", filters], () => api.entitlements.listEntitlements(filters), { placeholderData: keepPreviousData });

  return (
    <>
      <PageHeader title="Droits et quotas" description="Droit au coaching de chaque apprenant. Le solde est calculé à partir du registre des mouvements." />
      <Card>
        <div className="flex flex-col gap-2 border-b border-slate-100 p-3 sm:flex-row sm:px-5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input aria-label="Rechercher" placeholder="Rechercher un apprenant…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select aria-label="Statut du droit" value={status} onChange={(e) => setStatus(e.target.value as St | "")} className="sm:w-52">
            <option value="">Tous les statuts</option>
            {(["ACTIVE", "SUSPENDED", "EXPIRED", "NOT_STARTED", "NONE"] as const).map((s) => (
              <option key={s} value={s}>
                {ENTITLEMENT_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        {list.isLoading ? (
          <Loading />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data!.items.length === 0 ? (
          <EmptyState filtered={!!(debounced || status)} title="Aucun apprenant" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Apprenant</th>
                    <th className="px-3 py-2.5 font-medium">Statut</th>
                    <th className="px-3 py-2.5 font-medium">Période</th>
                    <th className="px-3 py-2.5 font-medium">Quota</th>
                    <th className="px-3 py-2.5 font-medium">Restant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.data!.items.map(({ learner, entitlement: e }) => (
                    <tr key={learner.id} className="hover:bg-slate-50">
                      <td className="px-5 py-2.5">
                        <Link href={`/admin/entitlements/${learner.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                          {learner.full_name}
                        </Link>
                        <span className="block text-xs text-slate-500">{learner.email}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={e?.effective_status === "ACTIVE" ? "success" : !e ? "neutral" : "warning"}>{ENTITLEMENT_STATUS_LABELS[e?.effective_status ?? "NONE"]}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{e ? `${fmtDate(e.starts_at)} → ${e.expires_at ? fmtDate(e.expires_at) : "sans fin"}` : "—"}</td>
                      <td className="px-3 py-2.5 text-slate-600">{e ? (e.quota_enabled ? `${(e.balance.limit ?? 0) + e.balance.corrections} demande(s)` : "Illimité") : "—"}</td>
                      <td className="px-3 py-2.5 font-medium tabular-nums">{e?.quota_enabled ? <span className={e.balance.remaining === 0 ? "text-red-600" : ""}>{e.balance.remaining}</span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={list.data!.page} pages={list.data!.pages} total={list.data!.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
