import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Mentora — L’accompagnement individuel, enfin structuré.</p>
        <nav aria-label="Informations légales" className="flex flex-wrap gap-x-5 gap-y-1">
          <Link href="/mentions-legales" className="hover:text-brand-700">Mentions légales</Link>
          <Link href="/conditions" className="hover:text-brand-700">Conditions d’utilisation</Link>
          <Link href="/confidentialite" className="hover:text-brand-700">Confidentialité</Link>
        </nav>
      </div>
    </footer>
  );
}
