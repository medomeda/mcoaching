import { TrialForm } from "./trial-form";
import { pageMetadata } from "@/lib/seo";

// Rendu à la demande : SITE_URL et LEGAL_* sont lues à l'exécution (voir dynamic-pages.test.ts).
export const dynamic = "force-dynamic";

export const metadata = pageMetadata("/essai");

export default function TrialPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      <h1 className="text-3xl font-bold text-brand-900">Demander un essai gratuit</h1>
      <p className="mt-3 text-slate-600">Dites-nous qui vous êtes : nous vous répondons et préparons votre espace Mentora.</p>
      <div className="relative mt-8 rounded-xl border border-slate-200 bg-white p-6"><TrialForm /></div>
    </div>
  );
}
