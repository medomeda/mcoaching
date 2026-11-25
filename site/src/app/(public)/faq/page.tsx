import { faqItems } from "@/content/faq";
import { CtaBand, Faq, Section } from "@/components/ui";

export default function FaqPage() {
  return (
    <>
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 pb-4 pt-14">
          <h1 className="text-3xl font-bold text-brand-900 sm:text-4xl">Questions fréquentes</h1>
        </div>
      </section>
      <Section title="Vos questions, nos réponses"><Faq items={faqItems} /></Section>
      <CtaBand />
    </>
  );
}
