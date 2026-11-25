import { audiences } from "@/content/audiences";
import { CtaBand, Section } from "@/components/ui";

export default function AudiencesPage() {
  return (
    <>
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 pb-4 pt-14">
          <h1 className="text-3xl font-bold text-brand-900 sm:text-4xl">Mentora, pour ceux qui accompagnent</h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">Que vous soyez coach, formateur ou mentor, vous avez le même besoin : répondre bien, dans les délais, et garder la trace.</p>
        </div>
      </section>
      <Section title="Votre activité">
        <div className="grid gap-5 md:grid-cols-3">
          {audiences.map((a) => (
            <article key={a.id} id={a.id} className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-semibold text-brand-900">{a.title}</h2>
              <p className="mt-2 text-slate-600">{a.text}</p>
            </article>
          ))}
        </div>
      </Section>
      <CtaBand />
    </>
  );
}
