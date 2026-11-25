import { Compass } from "lucide-react";
import Link from "next/link";

const NAV = [
  { href: "/fonctionnalites", label: "Fonctionnalités" },
  { href: "/pour-qui", label: "Pour qui" },
  { href: "/tarifs", label: "Tarifs" },
  { href: "/faq", label: "Questions fréquentes" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-brand-900">
          <span className="grid size-8 place-items-center rounded-lg bg-brand-900 text-gold-500"><Compass className="size-5" aria-hidden /></span>
          Mentora
        </Link>
        <nav aria-label="Navigation principale" className="hidden items-center gap-6 text-sm text-slate-700 md:flex">
          {NAV.map((n) => <Link key={n.href} href={n.href} className="hover:text-brand-700">{n.label}</Link>)}
        </nav>
        <Link href="/essai" className="rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">Essai gratuit</Link>
      </div>
      <nav aria-label="Navigation mobile" className="flex gap-4 overflow-x-auto border-t border-slate-100 px-4 py-2 text-sm text-slate-700 md:hidden">
        {NAV.map((n) => <Link key={n.href} href={n.href} className="whitespace-nowrap">{n.label}</Link>)}
      </nav>
    </header>
  );
}
