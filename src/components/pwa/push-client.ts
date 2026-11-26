"use client";

import { api } from "@/lib/api";

/** Côté navigateur des notifications push : prise en charge, abonnement, désabonnement. */
export type PushSupport = "ok" | "ios-not-installed" | "no-service-worker" | "unsupported";

/** Logique pure : que permet ce navigateur ? (iPhone : seulement une fois l'application installée.) */
export function pushSupportOf(e: { serviceWorker: boolean; pushManager: boolean; notification: boolean; ios: boolean; standalone: boolean; registered: boolean }): PushSupport {
  if (!e.serviceWorker || !e.pushManager || !e.notification) return e.ios && !e.standalone ? "ios-not-installed" : "unsupported";
  // Le service worker n'est enregistré qu'en production : sans lui, aucun push possible.
  return e.registered ? "ok" : "no-service-worker";
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export async function pushSupport(): Promise<PushSupport> {
  const serviceWorker = "serviceWorker" in navigator;
  return pushSupportOf({
    serviceWorker,
    pushManager: "PushManager" in window,
    notification: "Notification" in window,
    ios: isIos(),
    standalone: isStandalone(),
    registered: serviceWorker ? Boolean(await navigator.serviceWorker.getRegistration()) : false,
  });
}

function toKey(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Point d'accès push de cet appareil, s'il est abonné. */
export async function currentEndpoint(): Promise<string | null> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return (await reg?.pushManager.getSubscription())?.endpoint ?? null;
  } catch {
    return null;
  }
}

/** Demande l'autorisation (sur clic uniquement), s'abonne, puis enregistre l'appareil côté serveur. */
export async function enablePush(publicKey: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, message: "Autorisation refusée. Vous pouvez la modifier dans les réglages du navigateur." };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
    const json = sub.toJSON();
    await api.push.save({ endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } });
    return { ok: true };
  } catch (err) {
    console.warn("[mentora] abonnement push impossible", err); // console du navigateur uniquement
    return { ok: false, message: "L’activation a échoué sur cet appareil. Réessayez, ou utilisez un autre navigateur." };
  }
}

/**
 * Retire l'appareil du serveur puis se désabonne du navigateur. Ne lève jamais. Même si le retrait côté serveur échoue,
 * le désabonnement a lieu : le point d'accès devient invalide et le serveur l'oublie au prochain envoi.
 */
export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await api.push.remove({ endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe();
  } catch {
    /* sans conséquence : l'abonnement serveur sera purgé au prochain échec d'envoi */
  }
}

/** L'abonnement de cet appareil appartient-il à quelqu'un d'autre que la personne connectée ? */
export function isForeignSubscription(localEndpoint: string | null, ownEndpoints: string[]): boolean {
  return localEndpoint !== null && !ownEndpoints.includes(localEndpoint);
}

/**
 * À l'ouverture d'une session : l'appareil est peut-être resté abonné pour la personne précédente (session expirée,
 * mot de passe changé, compte suspendu… sans passer par « Se déconnecter »). On se désabonne alors localement : le
 * service push invalide l'adresse, donc l'ancien compte ne reçoit plus rien ici et le serveur l'oublie au prochain
 * envoi. La nouvelle personne active ses propres notifications d'un clic. Ne lève jamais ; sans état serveur lisible,
 * on ne touche à rien.
 */
export async function releaseForeignPushSubscription(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const state = await api.push.state();
    if (isForeignSubscription(sub.endpoint, state.endpoints)) await sub.unsubscribe();
  } catch {
    /* sans conséquence : l'abonnement serveur sera purgé au prochain échec d'envoi */
  }
}

/** À la déconnexion : rien ne doit rester sur un appareil partagé. Vide les caches de l'application. Ne lève jamais. */
export async function clearAppCaches(): Promise<void> {
  try {
    if (!("caches" in globalThis)) return;
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("mentora-")).map((k) => caches.delete(k)));
  } catch {
    /* sans conséquence : le cache ne contient de toute façon aucune donnée personnelle */
  }
}
