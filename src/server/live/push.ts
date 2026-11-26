/**
 * Notifications push (Web Push, clés VAPID) : appareils abonnés, état et envoi de test. Elles doublent les
 * notifications internes (l'application reste la référence) : un échec d'envoi ne bloque jamais l'opération métier.
 * Sans clés VAPID, la fonction est simplement « non disponible ».
 */
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { businessRule } from "@/modules/core/errors";
import type { NotificationType } from "@/modules/core/types";
import { parse } from "@/modules/core/validation";
import { newId } from "../crypto";
import { db } from "../pg/client";
import { getSuspension } from "../ops/usage";
import { notification, pushSubscription, user } from "../pg/schema";
import { getBrandName } from "./branding";
import { authenticate, type LiveCall } from "./context";
import { notificationPath } from "./helpers";

export const pushConfigured = (): boolean => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
export const vapidPublicKey = (): string | null => process.env.VAPID_PUBLIC_KEY || null;

export interface PushPayload {
  title: string;
  body: string;
  /** Chemin interne ouvert au clic. */
  url: string;
  /** Regroupe les notifications d'un même sujet sur l'appareil. */
  tag: string;
}

type Target = { endpoint: string; keys: { p256dh: string; auth: string } };
type Sender = (target: Target, payload: string) => Promise<unknown>;

let vapidReady = false;
const realSender: Sender = async (target, payload) => {
  const webpush = await import("web-push");
  if (!vapidReady) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:contact@localhost", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    vapidReady = true;
  }
  return webpush.sendNotification(target, payload, { TTL: 24 * 3600, urgency: "normal" });
};
let sender: Sender = realSender;
/** Tests : remplace l'envoi réel (null = envoi réel). */
export function setPushSender(fn: Sender | null) {
  sender = fn ?? realSender;
}

/**
 * Services push des navigateurs : seuls leurs hôtes sont acceptés. Sans cette liste, n'importe quel utilisateur
 * connecté pourrait faire envoyer au serveur une requête vers une adresse interne ou arbitraire (« Envoyer un test »),
 * et déduire de la réponse ce qui répond à l'intérieur du réseau.
 */
const PUSH_HOSTS = ["fcm.googleapis.com", "android.googleapis.com"]; // Chrome, Edge, Opera, Samsung… (FCM)
const PUSH_HOST_SUFFIXES = [".push.services.mozilla.com", ".notify.windows.com", ".push.apple.com"]; // Firefox, Windows, Safari

export function isPushServiceUrl(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
    const host = u.hostname.toLowerCase();
    return PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
}

const zSubscription = z.object({
  endpoint: z.string().trim().max(2048).refine(isPushServiceUrl, "Ce navigateur utilise un service de notification non pris en charge."),
  keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) }),
});
const zEndpoint = z.object({ endpoint: z.string().trim().min(1).max(2048) });

export async function savePushSubscription(call: LiveCall, input: unknown) {
  const a = await authenticate(call);
  if (!pushConfigured()) throw businessRule("Les notifications push ne sont pas activées sur cette instance.");
  const data = parse(zSubscription, input);
  const userAgent = call.headers.get("user-agent")?.slice(0, 300) ?? null;
  // Un appareil = un abonnement : si une autre personne s'y connecte, la ligne lui est réattribuée.
  await db
    .insert(pushSubscription)
    .values({ id: newId("psh"), userId: a.user.id, endpoint: data.endpoint, p256dh: data.keys.p256dh, auth: data.keys.auth, userAgent })
    .onConflictDoUpdate({ target: pushSubscription.endpoint, set: { userId: a.user.id, p256dh: data.keys.p256dh, auth: data.keys.auth, userAgent } });
  return null;
}

export async function removePushSubscription(call: LiveCall, input: unknown) {
  const a = await authenticate(call);
  const { endpoint } = parse(zEndpoint, input);
  await db.delete(pushSubscription).where(and(eq(pushSubscription.userId, a.user.id), eq(pushSubscription.endpoint, endpoint)));
  return null;
}

export async function getPushState(call: LiveCall) {
  const a = await authenticate(call);
  const rows = await db.select({ endpoint: pushSubscription.endpoint }).from(pushSubscription).where(eq(pushSubscription.userId, a.user.id));
  return { available: pushConfigured(), publicKey: vapidPublicKey(), endpoints: rows.map((r) => r.endpoint) };
}

/**
 * Envoie une charge à des appareils (par lots de 10). Un abonnement expiré ou révoqué (404/410) est supprimé ;
 * les autres échecs sont journalisés sans détail (le point d'accès identifie un appareil). Ne lève jamais.
 */
export async function sendToSubscriptions(subs: Array<typeof pushSubscription.$inferSelect>, payload: PushPayload): Promise<{ sent: number; removed: number }> {
  const body = JSON.stringify(payload);
  let sent = 0;
  const dead: string[] = [];
  const ok: string[] = [];
  for (let i = 0; i < subs.length; i += 10) {
    await Promise.allSettled(
      subs.slice(i, i + 10).map(async (s) => {
        try {
          await sender({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
          sent++;
          ok.push(s.id);
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) dead.push(s.id);
          else console.error("[push] envoi en échec", status ?? "sans code");
        }
      }),
    );
  }
  try {
    if (dead.length) await db.delete(pushSubscription).where(inArray(pushSubscription.id, dead));
    if (ok.length) await db.update(pushSubscription).set({ lastSuccessAt: new Date() }).where(inArray(pushSubscription.id, ok));
  } catch (err) {
    console.error("[push] mise à jour des appareils impossible", err instanceof Error ? err.message : err);
  }
  return { sent, removed: dead.length };
}

/** Bouton « Envoyer un test » du profil : texte fixe, vers tous les appareils de l'appelant. */
export async function sendTestPush(call: LiveCall) {
  const a = await authenticate(call);
  if (!pushConfigured()) throw businessRule("Les notifications push ne sont pas activées sur cette instance.");
  const subs = await db.select().from(pushSubscription).where(eq(pushSubscription.userId, a.user.id));
  const { sent } = await sendToSubscriptions(subs, { title: "Notification de test", body: "Les notifications fonctionnent sur cet appareil.", url: "/", tag: "mentora-test" });
  return { sent };
}

/* ------------------------------------------------------------------ Texte des notifications */

/**
 * Confidentialité : le texte affiché sur l'écran verrouillé n'est que le TYPE d'événement. Jamais de titre de demande,
 * de nom ni d'extrait de message : le détail se lit dans l'application, après connexion.
 */
const TITLES: Record<NotificationType, string> = {
  REQUEST_SUBMITTED: "Nouvelle demande",
  REQUEST_ASSIGNED: "Demande affectée",
  REASSIGNMENT: "Demande affectée",
  NEW_MESSAGE: "Nouveau message",
  CLARIFICATION_REQUESTED: "Précisions demandées",
  COACH_RESPONSE: "Réponse de votre coach",
  REQUEST_CLOSED: "Demande clôturée",
  REQUEST_REOPENED: "Demande réouverte",
  RATING_AVAILABLE: "Évaluation",
  RATING_RECEIVED: "Évaluation",
  DEADLINE_REMINDER: "Échéance proche",
  REQUEST_OVERDUE: "Demande en retard",
  ESCALATION: "Demande en retard",
  COACH_UNAVAILABLE: "Information de la plateforme",
  NOTIFICATION_FAILURE: "Information de la plateforme",
  ACCOUNT: "Information de la plateforme",
};

export function pushTextFor(type: NotificationType, brandName: string): { title: string; body: string } {
  return { title: TITLES[type], body: `Ouvrez ${brandName} pour les détails.` };
}

/**
 * Envoie les push correspondant à des notifications internes qui viennent d'être validées. Relit les lignes en base
 * (une transaction annulée n'en a créé aucune). Rien n'est envoyé sans clés VAPID, si l'instance est suspendue, ni
 * à un compte qui n'est pas actif. Ne lève jamais : renvoie le nombre d'envois réussis.
 */
export async function deliverPush(notificationIds: string[]): Promise<number> {
  try {
    if (notificationIds.length === 0 || !pushConfigured()) return 0;
    if ((await getSuspension()).suspended) return 0;
    const rows = await db
      .select({ n: notification, role: user.role, status: user.status })
      .from(notification)
      .innerJoin(user, eq(user.id, notification.userId))
      .where(inArray(notification.id, notificationIds));
    const active = rows.filter((r) => r.status === "ACTIVE");
    if (active.length === 0) return 0;
    const subs = await db.select().from(pushSubscription).where(inArray(pushSubscription.userId, [...new Set(active.map((r) => r.n.userId))]));
    if (subs.length === 0) return 0;
    const brand = await getBrandName();
    let total = 0;
    for (const r of active) {
      const mine = subs.filter((s) => s.userId === r.n.userId);
      if (mine.length === 0) continue;
      const payload: PushPayload = { ...pushTextFor(r.n.type, brand), url: notificationPath(r.role, r.n.relatedRequestId), tag: `mentora-${r.n.id}` };
      total += (await sendToSubscriptions(mine, payload)).sent;
    }
    return total;
  } catch (err) {
    console.error("[push] envoi impossible", err instanceof Error ? err.message : err);
    return 0;
  }
}
