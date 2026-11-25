import Link from "next/link";
import { DataTable } from "@/components/admin/data-table";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { db } from "@/db/client";
import { plan } from "@/db/schema";
import { listClients } from "@/server/clients";
import { instanceUrl } from "@/server/instance-address";

export const dynamic = "force-dynamic";
type Row = Awaited<ReturnType<typeof listClients>>[number];
const fmt = (d: string | null) => (d ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(`${d}T00:00:00Z`)) : "—");

export default async function ClientsPage() {
  const [rows, plans] = await Promise.all([listClients(db), db.select().from(plan)]);
  const planName = new Map(plans.map((p) => [p.id, p.name]));
  return (
    <>
      <PageHeader title="Clients" actions={<Link href="/admin/clients/nouveau" className="rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white">Nouveau client</Link>} />
      <DataTable<Row>
        rows={rows}
        rowKey={(c) => c.id}
        empty="Aucun client. Convertissez un prospect ou créez un client."
        columns={[
          { header: "Client", cell: (c) => <Link href={`/admin/clients/${c.id}`} className="font-semibold text-brand-700 underline">{c.name}</Link> },
          { header: "Adresse", cell: (c) => instanceUrl(c.instanceHost)?.replace("https://", "") ?? "—" },
          { header: "Formule", cell: (c) => (c.planId ? planName.get(c.planId) ?? "—" : "—") },
          { header: "Statut", cell: (c) => <StatusBadge status={c.status} /> },
          { header: "Prochaine échéance", cell: (c) => fmt(c.nextDueOn) },
        ]}
      />
    </>
  );
}
