import Link from "next/link";
import type { ReactNode } from "react";

export function Section({ id, title, intro, children, tone = "white" }: { id?: string; title: string; intro?: string; children: ReactNode; tone?: "white" | "canvas" }) {
  return (
    <section id={id} className={tone === "white" ? "bg-white" : "bg-canvas"}>
      <div className="mx-auto max-w-6xl px-4 py-14 sm:py-16">
        <h2 className="text-2xl font-bold text-brand-900 sm:text-3xl">{title}</h2>
        {intro ? <p className="mt-3 max-w-2xl text-slate-600">{intro}</p> : null}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" }) {
  const base = "inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold transition-colors";
  const cls = variant === "primary" ? "bg-brand-900 text-white hover:bg-brand-800" : "border border-slate-300 bg-white text-brand-900 hover:bg-slate-50";
  return <Link href={href} className={`${base} ${cls}`}>{children}</Link>;
}

export function CtaBand() {
  return (
    <section className="bg-brand-900">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-12 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-xl font-semibold text-white">Prêt à structurer votre accompagnement ? Demandez votre essai gratuit.</p>
        <Link href="/essai" className="rounded-lg bg-gold-500 px-5 py-3 text-sm font-semibold text-brand-900 hover:bg-gold-100">Demander un essai gratuit</Link>
      </div>
    </section>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-3xl space-y-4 px-4 py-14 leading-relaxed text-slate-700 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-brand-900 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-brand-900 [&_ul]:list-disc [&_ul]:pl-6">{children}</div>;
}

export function Faq({ items }: { items: { question: string; answer: string }[] }) {
  return (
    <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
      {items.map((f) => (
        <details key={f.question} className="group p-5">
          <summary className="cursor-pointer list-none font-semibold text-brand-900 marker:hidden">{f.question}</summary>
          <p className="mt-3 text-slate-600">{f.answer}</p>
        </details>
      ))}
    </div>
  );
}
