import Link from "next/link";
import { DataTable } from "@/components/admin/data-table";
import { PageHeader } from "@/components/admin/page-header";
import { STATUS_LABELS, StatusBadge } from "@/components/admin/status-badge";
import { db } from "@/db/client";
import { PROSPECT_STATUSES, type Prospect } from "@/db/schema";
import { listProspects } from "@/server/prospects";
import { setStatusAction } from "./actions";

export const dynamic = "force-dynamic";
const fmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const { statut } = await searchParams;
  const filter = (PROSPECT_STATUSES as readonly string[]).includes(statut ?? "") ? (statut as (typeof PROSPECT_STATUSES)[number]) : undefined;
  const rows = await listProspects(db, filter);
  return (
    <>
      <PageHeader title="Prospects" description="Demandes d’essai reçues depuis la vitrine." />
      <nav aria-label="Filtrer par statut" className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/prospects" className={`rounded-full px-3 py-1 ${!filter ? "bg-brand-900 text-white" : "bg-white text-slate-700"}`}>Tous</Link>
        {PROSPECT_STATUSES.map((s) => <Link key={s} href={`/admin/prospects?statut=${s}`} className={`rounded-full px-3 py-1 ${filter === s ? "bg-brand-900 text-white" : "bg-white text-slate-700"}`}>{STATUS_LABELS[s]}</Link>)}
      </nav>
      <DataTable<Prospect>
        rows={rows}
        rowKey={(p) => p.id}
        empty="Aucune demande pour le moment."
        columns={[
          { header: "Dernière demande", cell: (p) => fmt.format(p.updatedAt) },
          { header: "Contact", cell: (p) => <><span className="font-semibold">{p.name}</span><br /><span className="text-slate-600">{p.email}{p.phone ? ` · ${p.phone}` : ""}</span></> },
          { header: "Activité", cell: (p) => p.activity || "—" },
          { header: "Message", cell: (p) => <span className="line-clamp-2 max-w-xs text-slate-600">{p.message || "—"}</span> },
          { header: "Statut", cell: (p) => <StatusBadge status={p.status} /> },
          {
            header: "Actions",
            cell: (p) =>
              p.status === "CONVERTI" ? (
                <span className="text-slate-500">Converti</span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/clients/nouveau?prospect=${p.id}`} className="rounded-lg bg-brand-900 px-3 py-1 text-xs font-semibold text-white">Convertir en client</Link>
                  {(["CONTACTE", "PERDU"] as const).filter((s) => s !== p.status).map((s) => (
                    <form key={s} action={setStatusAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="status" value={s} />
                      <button className="rounded-lg border border-slate-300 px-3 py-1 text-xs">{STATUS_LABELS[s]}</button>
                    </form>
                  ))}
                </div>
              ),
          },
        ]}
      />
    </>
  );
}
