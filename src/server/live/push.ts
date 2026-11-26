/**
 * Notifications push (Web Push, clés VAPID) : appareils abonnés, état et envoi de test. Elles doublent les
 * notifications internes (l'application reste la référence) : un échec d'envoi ne bloque jamais l'opération métier.
 * Sans clés VAPID, la fonction est simplement « non disponible ».
 */
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { businessRule } from "@/modules/core/errors";
import { parse } from "@/modules/core/validation";
import { newId } from "../crypto";
import { db } from "../pg/client";
import { pushSubscription } from "../pg/schema";
import { authenticate, type LiveCall } from "./context";

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

const zSubscription = z.object({
  endpoint: z.string().trim().max(2048).refine((u) => u.startsWith("https://") && URL.canParse(u), "Adresse d’appareil invalide."),
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
