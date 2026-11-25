import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/admin/page-header";
import { db } from "@/db/client";
import { plan } from "@/db/schema";
import { prospectToClientDraft } from "@/server/prospects";
import { ClientForm, type Draft } from "./client-form";

export const dynamic = "force-dynamic";

export default async function NewClientPage({ searchParams }: { searchParams: Promise<{ prospect?: string }> }) {
  const { prospect } = await searchParams;
  let draft: Draft = {};
  let error: string | null = null;
  if (prospect) {
    try {
      draft = await prospectToClientDraft(prospect, db);
    } catch (e) {
      error = e instanceof Error ? e.message : "Prospect invalide.";
    }
  }
  const plans = (await db.select({ id: plan.id, name: plan.name }).from(plan).orderBy(asc(plan.position))).map((p) => ({ id: p.id, name: p.name }));
  return (
    <>
      <PageHeader title="Nouveau client" description="La clé d’accès de l’instance est générée à la création et affichée une seule fois." />
      {error ? <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      <ClientForm draft={draft} plans={plans} domain={process.env.INSTANCE_DOMAIN ?? "mentora.app"} />
    </>
  );
}
