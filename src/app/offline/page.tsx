import { WifiOff } from "lucide-react";
import { LogoMark } from "@/components/ui/logo-mark";

/**
 * Page de secours affichée par le service worker quand le réseau est absent. Publique, sans appel à la base :
 * elle ne contient aucune donnée de l'utilisateur.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-canvas px-6 text-center">
      <LogoMark size="lg" />
      <WifiOff className="h-8 w-8 text-brand-700" aria-hidden />
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">Vous êtes hors ligne</h1>
        <p className="text-sm text-slate-600">La connexion est indisponible. Vos données ne sont jamais stockées sur cet appareil : reconnectez-vous pour continuer.</p>
      </div>
      {/* Un simple lien : si le réseau est toujours absent, le service worker réaffiche cette page. */}
      <a href="/" className="rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">
        Réessayer
      </a>
    </main>
  );
}
