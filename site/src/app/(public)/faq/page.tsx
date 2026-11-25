import { faqItems } from "@/content/faq";
import { JsonLd } from "@/components/json-ld";
import { faqLd } from "@/lib/seo";
import { CtaBand, Faq, Section } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/faq");

export default function FaqPage() {
  return (
    <>
      <JsonLd data={faqLd(faqItems)} />
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
