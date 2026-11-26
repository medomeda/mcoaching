"use client";

import { Download, Share, SquarePlus, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/display";
import { DEMO_MODE } from "@/lib/api";
import { dismissInstallCard, promptInstall, useInstallCardDismissed, useInstallMode } from "./install-store";

function IosSteps() {
  return (
    <ol className="mt-2 space-y-1.5 text-sm">
      <li className="flex items-center gap-2">
        <span className="font-semibold">1.</span> Touchez <Share className="h-4 w-4 shrink-0" aria-label="Partager" /> en bas de Safari
      </li>
      <li className="flex items-center gap-2">
        <span className="font-semibold">2.</span> Choisissez <SquarePlus className="h-4 w-4 shrink-0" aria-hidden /> « Sur l’écran d’accueil »
      </li>
    </ol>
  );
}

async function install() {
  if (await promptInstall()) toast.success("L’application est installée sur votre appareil.");
}

/**
 * Carte d'invitation à installer l'application (accueil des trois espaces). Affichée tant qu'elle n'est pas masquée
 * ni l'application installée ; absente en démonstration.
 */
export function InstallCard() {
  const mode = useInstallMode();
  const dismissed = useInstallCardDismissed();
  if (DEMO_MODE || dismissed || (mode !== "prompt" && mode !== "ios")) return null;

  return (
    <div className="relative flex gap-3 rounded-xl border border-gold-500/40 bg-gold-100/50 p-4 pr-10 text-brand-900">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold-500 text-brand-900">
        <Download className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Installez l’application sur votre appareil</p>
        <p className="text-sm text-slate-700">Accès en un geste depuis l’écran d’accueil, en plein écran, comme une application.</p>
        {mode === "ios" ? (
          <IosSteps />
        ) : (
          <Button size="sm" className="mt-3" onClick={() => void install()} icon={<Download className="h-4 w-4" />}>
            Installer l’application
          </Button>
        )}
      </div>
      <button type="button" onClick={dismissInstallCard} className="absolute right-2 top-2 rounded-md p-2 text-slate-600 hover:bg-gold-500/20" aria-label="Masquer">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Section « Application » du profil : toujours disponible, même après avoir masqué la carte d'accueil. */
export function InstallSection() {
  const mode = useInstallMode();
  if (DEMO_MODE) return null;

  return (
    <Card>
      <CardHeader title="Application" icon={<Smartphone className="h-4 w-4" />} />
      <CardBody className="space-y-2 text-sm text-slate-700">
        {mode === "installed" && <p>L’application est installée sur cet appareil.</p>}
        {mode === "prompt" && (
          <>
            <p>Installez l’application pour y accéder depuis l’écran d’accueil, en plein écran.</p>
            <Button size="sm" onClick={() => void install()} icon={<Download className="h-4 w-4" />}>
              Installer l’application
            </Button>
          </>
        )}
        {mode === "ios" && (
          <>
            <p>Sur iPhone et iPad, l’installation se fait depuis Safari :</p>
            <IosSteps />
          </>
        )}
        {mode === "unsupported" && <p>Ce navigateur ne propose pas l’installation. Utilisez Chrome, Edge ou Safari pour installer l’application.</p>}
      </CardBody>
    </Card>
  );
}
