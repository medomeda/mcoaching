"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { DEMO_MODE } from "@/lib/api";
import { watchRegistration } from "@/lib/pwa/update-watcher";

const UPDATE_CHECK_MS = 60 * 60 * 1000;
const UPDATE_TOAST_ID = "mentora-update";

/**
 * Enregistre le service worker et gère le cycle de mise à jour :
 * 1. vérification à l'ouverture, au retour sur l'application et toutes les heures ;
 * 2. nouvelle version prête → message « Mettre à jour » (jamais de rechargement imposé) ;
 * 3. accord de l'utilisateur → activation de la nouvelle version puis rechargement unique.
 * Inactif en démonstration, et désactivé en développement (incompatible avec le rechargement à chaud).
 */
export function PwaManager() {
  useEffect(() => {
    if (DEMO_MODE || !("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // Un service worker resté d'un test de production perturberait le développement.
      void navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => void r.unregister()));
      return;
    }

    let cancelled = false;
    let registration: ServiceWorkerRegistration | undefined;
    let stopWatching: (() => void) | undefined;

    const check = () => void registration?.update().catch(() => undefined);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(check, UPDATE_CHECK_MS);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        if (cancelled) return;
        registration = reg;
        stopWatching = watchRegistration(reg, navigator.serviceWorker, {
          offerUpdate: (apply) =>
            toast("Nouvelle version disponible", {
              id: UPDATE_TOAST_ID,
              description: "Mettez à jour pour profiter des dernières améliorations.",
              duration: Infinity,
              action: { label: "Mettre à jour", onClick: apply },
            }),
          reload: () => window.location.reload(),
        });
      })
      .catch((err) => console.warn("[mentora] service worker non enregistré", err));

    return () => {
      cancelled = true;
      stopWatching?.();
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
