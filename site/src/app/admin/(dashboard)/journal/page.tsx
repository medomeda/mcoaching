import { desc } from "drizzle-orm";
import { DataTable } from "@/components/admin/data-table";
import { PageHeader } from "@/components/admin/page-header";
import { db } from "@/db/client";
import { auditLog } from "@/db/schema";

export const dynamic = "force-dynamic";
const fmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

export default async function JournalPage() {
  const rows = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(200);
  return (
    <>
      <PageHeader title="Journal" description="Actions de l’opérateur (200 dernières)." />
      <DataTable rows={rows} rowKey={(r) => r.id} empty="Aucune action enregistrée." columns={[
        { header: "Date", cell: (r) => fmt.format(r.createdAt) },
        { header: "Action", cell: (r) => <code>{r.action}</code> },
        { header: "Cible", cell: (r) => r.target ?? "—" },
      ]} />
    </>
  );
}
