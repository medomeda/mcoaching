import { JsonLd } from "@/components/json-ld";
import { softwareLd } from "@/lib/seo";
import { CtaBand, Section } from "@/components/ui";
import { PricingTable } from "@/components/pricing-table";
import { listPublishedPlans } from "@/lib/plans";
import { pageMetadata } from "@/lib/seo";

// Rendue à la demande : aucune base n'est requise à la compilation. Les données sont mises en cache
// (étiquette « plans ») et invalidées dès qu'une formule change (Tâche 10).
export const metadata = pageMetadata("/tarifs");

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const plans = await listPublishedPlans();
  return (
    <>
      <JsonLd data={softwareLd(plans)} />
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 pb-4 pt-14">
          <h1 className="text-3xl font-bold text-brand-900 sm:text-4xl">Tarifs</h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">Des formules simples, avec un essai gratuit pour tester Mentora avec vos propres membres.</p>
        </div>
      </section>
      <Section title="Choisissez votre formule"><PricingTable plans={plans} /></Section>
      <CtaBand />
    </>
  );
}
