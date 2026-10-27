"use client";
import { keepPreviousData } from "@tanstack/react-query";
import { ChevronDown, Search, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, EmptyState, ErrorState, Loading, PageHeader, Pagination } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/form";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { fmtDateTime } from "@/lib/format";
import { AUDIT_ACTION_LABELS } from "@/lib/labels";

export default function AuditPage() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [debounced, action, entityType]);
  const filters = { q: debounced || undefined, action: action || undefined, entityType: entityType || undefined, page, pageSize: 25 };
  const list = useApi(["audit", filters], () => api.reports.listAuditLogs(filters), { placeholderData: keepPreviousData });

  return (
    <>
      <PageHeader title="Journal d’audit" description="Actions sensibles enregistrées de façon permanente. Ce journal ne peut être ni modifié ni supprimé depuis l’application." />
      <Card>
        <div className="flex flex-col gap-2 border-b border-slate-100 p-3 sm:flex-row sm:px-5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input aria-label="Rechercher" placeholder="Auteur, motif, objet…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select aria-label="Action" value={action} onChange={(e) => setAction(e.target.value)} className="sm:w-64">
            <option value="">Toutes les actions</option>
            {list.data?.actions.map((a) => (
              <option key={a} value={a}>
                {AUDIT_ACTION_LABELS[a] ?? a}
              </option>
            ))}
          </Select>
          <Select aria-label="Type d’objet" value={entityType} onChange={(e) => setEntityType(e.target.value)} className="sm:w-48">
            <option value="">Tous les objets</option>
            {list.data?.entity_types.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </div>
        {list.isLoading ? (
          <Loading />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data!.items.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="h-6 w-6" />} filtered={!!(debounced || action || entityType)} title="Aucun événement" />
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {list.data!.items.map((l) => (
                <li key={l.id}>
                  <button onClick={() => setOpen(open === l.id ? null : l.id)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-slate-50 sm:px-5" aria-expanded={open === l.id}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium text-slate-900">{AUDIT_ACTION_LABELS[l.action] ?? l.action}</span>
                        {l.entity_label && <span className="text-slate-600"> · {l.entity_label}</span>}
                      </p>
                      <p className="text-xs text-slate-500">
                        {l.actor_name} · {fmtDateTime(l.created_at)}
                        {l.reason && ` · Motif : ${l.reason}`}
                      </p>
                    </div>
                    <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-slate-400 transition ${open === l.id ? "rotate-180" : ""}`} />
                  </button>
                  {open === l.id && (
                    <pre className="mx-4 mb-3 max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100 sm:mx-5">{JSON.stringify({ action: l.action, entity_type: l.entity_type, entity_id: l.entity_id, metadata: l.metadata }, null, 2)}</pre>
                  )}
                </li>
              ))}
            </ul>
            <Pagination page={list.data!.page} pages={list.data!.pages} total={list.data!.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
