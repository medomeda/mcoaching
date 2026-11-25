import { Check } from "lucide-react";
import Link from "next/link";
import { annualPriceOf, formatFcfa, limitLabel, type PublicPlan } from "@/lib/plans";

function Price({ plan }: { plan: PublicPlan }) {
  const annual = annualPriceOf(plan);
  if (plan.monthlyPrice === null && annual === null) return <p className="mt-4 text-lg font-semibold text-brand-900">Sur demande</p>;
  return (
    <div className="mt-4">
      {plan.monthlyPrice !== null ? (
        <p><span className="text-3xl font-bold text-brand-900">{formatFcfa(plan.monthlyPrice)}</span><span className="text-slate-600"> / mois</span></p>
      ) : null}
      {annual !== null ? <p className="mt-1 text-sm text-slate-600">ou {formatFcfa(annual)} / an</p> : null}
    </div>
  );
}

export function PricingTable({ plans }: { plans: PublicPlan[] }) {
  if (plans.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-lg font-semibold text-brand-900">Demandez un essai</p>
        <p className="mt-2 text-slate-600">Nous vous présentons la formule adaptée à votre activité et mettons votre espace en place.</p>
        <Link href="/essai" className="mt-5 inline-flex rounded-lg bg-brand-900 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-800">Demander un essai gratuit</Link>
      </div>
    );
  }
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {plans.map((p) => (
        <article key={p.id} className={`flex flex-col rounded-xl border bg-white p-6 ${p.highlighted ? "border-gold-500 ring-1 ring-gold-500" : "border-slate-200"}`}>
          {p.highlighted ? <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-700">Recommandée</p> : null}
          <h3 className="text-xl font-bold text-brand-900">{p.name}</h3>
          {p.description ? <p className="mt-1 text-slate-600">{p.description}</p> : null}
          <Price plan={p} />
          <ul className="mt-5 space-y-2 text-sm text-slate-700">
            <li className="flex gap-2"><Check className="size-4 shrink-0 text-gold-500" aria-hidden />{limitLabel(p.maxCoaches, "coachs")}</li>
            <li className="flex gap-2"><Check className="size-4 shrink-0 text-gold-500" aria-hidden />{limitLabel(p.maxMembers, "membres actifs")}</li>
            {p.features.map((f) => <li key={f} className="flex gap-2"><Check className="size-4 shrink-0 text-gold-500" aria-hidden />{f}</li>)}
          </ul>
          <Link href="/essai" className="mt-auto inline-flex justify-center rounded-lg bg-brand-900 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-800 [margin-top:1.5rem]">
            {p.trialDays > 0 ? `Essai gratuit de ${p.trialDays} jours` : "Demander un essai"}
          </Link>
        </article>
      ))}
    </div>
  );
}
