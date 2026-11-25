import { Check } from "lucide-react";
import { audiences } from "@/content/audiences";
import { faqItems } from "@/content/faq";
import { benefits, PROMISES, SLOGAN, steps, SUBTITLE } from "@/content/home";
import { JsonLd } from "@/components/json-ld";
import { organizationLd, softwareLd } from "@/lib/seo";
import { ProductShot } from "@/components/product-shot";
import { PricingTable } from "@/components/pricing-table";
import { listPublishedPlans } from "@/lib/plans";
import { ButtonLink, CtaBand, Faq, Section } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";

// Rendu à la demande : SITE_URL et LEGAL_* sont lues à l'exécution (voir dynamic-pages.test.ts).
export const dynamic = "force-dynamic";

export const metadata = pageMetadata("/");

export default async function Home() {
  const plans = await listPublishedPlans();
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={softwareLd([])} />
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:py-20 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">Pour coachs, formateurs et mentors</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight text-brand-900 sm:text-5xl">{SLOGAN}</h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">{SUBTITLE}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/essai">Demander un essai gratuit</ButtonLink>
              <ButtonLink href="/fonctionnalites" variant="secondary">Voir les fonctionnalités</ButtonLink>
            </div>
            <ul className="mt-8 flex flex-wrap gap-3 text-sm text-brand-900">
              {PROMISES.map((p) => (
                <li key={p} className="rounded-full bg-slate-100 px-4 py-1.5">{p}</li>
              ))}
            </ul>
          </div>
          <ProductShot src="/images/tableau-de-bord.webp" alt="Tableau de bord Mentora : demandes ouvertes, retards, réponses dans les délais et satisfaction" priority />
        </div>
      </section>

      <Section title="Pourquoi Mentora" tone="canvas">
        <div className="grid gap-5 sm:grid-cols-2">
          {benefits.map((b) => (
            <article key={b.title} className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="flex items-start gap-2 font-semibold text-brand-900"><Check className="mt-0.5 size-5 shrink-0 text-gold-500" aria-hidden />{b.title}</h3>
              <p className="mt-2 text-slate-600">{b.text}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Comment ça marche" id="comment-ca-marche">
        <ol className="grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-xl border border-slate-200 p-6">
              <span className="grid size-8 place-items-center rounded-full bg-brand-900 text-sm font-bold text-white">{i + 1}</span>
              <h3 className="mt-3 font-semibold text-brand-900">{s.title}</h3>
              <p className="mt-2 text-slate-600">{s.text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="L’application, vue de l’intérieur" intro="Vos membres déposent et suivent leurs demandes ; vous répondez dans les délais et pilotez l’ensemble. Captures d’écran avec des données fictives.">
        <div className="grid gap-8 lg:grid-cols-2">
          <figure>
            <ProductShot src="/images/espace-membre.webp" alt="Espace d’un membre : son coach, son droit d’accompagnement, ses demandes en cours et les derniers messages" />
            <figcaption className="mt-3 text-sm text-slate-600"><strong className="text-brand-900">Côté membre</strong> : son coach, ses demandes et les réponses reçues, au même endroit.</figcaption>
          </figure>
          <figure>
            <ProductShot src="/images/echange.webp" alt="Une demande d’accompagnement avec son fil d’échanges, son échéance et son historique" />
            <figcaption className="mt-3 text-sm text-slate-600"><strong className="text-brand-900">Chaque demande</strong> a son fil d’échanges, son échéance et son historique.</figcaption>
          </figure>
        </div>
      </Section>

      <Section title="Pour qui ?" tone="canvas">
        <div className="grid gap-5 md:grid-cols-3">
          {audiences.map((a) => (
            <article key={a.id} className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="font-semibold text-brand-900">{a.title}</h3>
              <p className="mt-2 text-slate-600">{a.text}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Des formules adaptées à votre activité" intro="Choisissez la formule qui correspond à votre nombre de membres, avec un essai gratuit pour commencer." tone="canvas">
        <PricingTable plans={plans} />
        {plans.length > 0 ? <div className="mt-6"><ButtonLink href="/tarifs" variant="secondary">Comparer les formules</ButtonLink></div> : null}
      </Section>

      <Section title="Questions fréquentes">
        <Faq items={faqItems.slice(0, 5)} />
      </Section>
      <CtaBand />
    </>
  );
}
