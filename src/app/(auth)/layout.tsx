import { TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { Suspense } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-brand-900 via-brand-800 to-brand-700 lg:flex-row">
      <section className="hidden flex-1 flex-col justify-between p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-500 shadow">
            <TrendingUp className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-lg font-semibold">Coaching BRVM</span>
        </div>
        <div className="max-w-md space-y-4">
          <h1 className="text-3xl font-semibold leading-tight">Un accompagnement individuel suivi, traçable et dans les délais.</h1>
          <ul className="space-y-2 text-sm text-brand-100">
            <li>• Chaque demande a un responsable identifiable.</li>
            <li>• Chaque échéance de réponse est calculée en heures ouvrées.</li>
            <li>• Chaque échange et chaque action importante sont tracés.</li>
          </ul>
        </div>
        <p className="text-xs text-brand-300">Bourse Régionale des Valeurs Mobilières — espace d’apprentissage de la communauté.</p>
      </section>
      <section className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center lg:max-w-xl lg:bg-canvas">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-center gap-2 text-white lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-500">
              <TrendingUp className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-lg font-semibold">Coaching BRVM</span>
          </div>
          <Suspense>{children}</Suspense>
        </div>
      </section>
    </div>
  );
}
