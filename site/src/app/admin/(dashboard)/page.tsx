import { AlertList } from "@/components/admin/alert-list";
import { PageHeader } from "@/components/admin/page-header";
import { db } from "@/db/client";
import { computeAlerts } from "@/lib/alerts";
import { loadClientStates } from "@/server/client-state";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const now = new Date();
  const { states, plans, newProspects } = await loadClientStates(db, now);
  const alerts = computeAlerts({ now, clients: states, newProspects, plans });
  return (
    <>
      <PageHeader title="Accueil" description="Alertes calculées à partir de l’état et de l’usage de vos clients." />
      <AlertList alerts={alerts} />
    </>
  );
}
