import { features } from "@/content/features";
import { CtaBand, Section } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";

// Rendu à la demande : SITE_URL et LEGAL_* sont lues à l'exécution (voir dynamic-pages.test.ts).
export const dynamic = "force-dynamic";

export const metadata = pageMetadata("/fonctionnalites");

export default function FeaturesPage() {
  return (
    <>
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 pb-4 pt-14">
          <h1 className="text-3xl font-bold text-brand-900 sm:text-4xl">Tout pour structurer votre accompagnement</h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">De la première demande au rapport de qualité, Mentora couvre l’essentiel de l’accompagnement individuel, sans complexité.</p>
        </div>
      </section>
      <Section title="Les fonctionnalités">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <article key={f.title} className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="font-semibold text-brand-900">{f.title}</h3>
              <p className="mt-2 text-slate-600">{f.text}</p>
            </article>
          ))}
        </div>
      </Section>
      <CtaBand />
    </>
  );
}
