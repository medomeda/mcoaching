"use client";

import { useSyncExternalStore } from "react";
import { installModeOf, type InstallMode } from "@/lib/pwa/install";

/**
 * État d'installation de la PWA, partagé entre le gestionnaire (qui capte les événements du navigateur)
 * et les boutons « Installer » de l'interface.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function captureInstallPrompt(e: Event) {
  e.preventDefault(); // on garde la main : l'invite s'affiche quand l'utilisateur clique sur « Installer »
  deferred = e as BeforeInstallPromptEvent;
  emit();
}

export function markInstalled() {
  installed = true;
  deferred = null;
  emit();
}

const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);

const getMode = (): InstallMode => installModeOf({ installed, standalone: isStandalone(), hasPrompt: deferred !== null, ios: isIos() });

export function useInstallMode(): InstallMode {
  return useSyncExternalStore(subscribe, getMode, () => "unsupported");
}

/** Affiche l'invite d'installation native (Android / Chrome / Edge). Renvoie vrai si l'utilisateur accepte. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  emit();
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === "accepted") markInstalled();
  return outcome === "accepted";
}

const DISMISS_KEY = "mentora:install-card-dismissed";

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** La carte d'invitation de l'accueil a-t-elle été masquée ? (vrai côté serveur : rien à afficher) */
export function useInstallCardDismissed(): boolean {
  return useSyncExternalStore(subscribe, readDismissed, () => true);
}

export function dismissInstallCard() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* stockage indisponible : la carte reviendra à la prochaine visite */
  }
  emit();
}
