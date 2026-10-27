import { SearchX } from "lucide-react";
import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-4 text-center">
      <div className="rounded-full bg-slate-100 p-3 text-slate-400">
        <SearchX className="h-6 w-6" />
      </div>
      <h1 className="text-lg font-semibold text-slate-900">Page introuvable</h1>
      <p className="max-w-sm text-sm text-slate-500">La page demandée n’existe pas ou a été déplacée.</p>
      <LinkButton href="/" variant="outline">
        Retour à l’accueil
      </LinkButton>
    </div>
  );
}
