/** Abonnements push côté serveur : appareils, réattribution, état, envoi de test (base PostgreSQL jetable). */
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createLiveDb, liveDbAvailable } from "./liveDb";

const PASSWORD = "Mdp-de-test-2027";
type Mods = {
  push: typeof import("@/server/live/push");
  auth: typeof import("@/server/auth");
  cred: typeof import("@/server/live/credentials");
  db: typeof import("@/server/pg/client");
  schema: typeof import("@/server/pg/schema");
};

let drop: () => Promise<void>;
let m: Mods;
let callA: { headers: Headers };
let callB: { headers: Headers };

const device = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`, keys: { p256dh: `p256dh-${n}`, auth: `auth-${n}` } });

/** Vraie session BetterAuth : le cookie renvoyé par la connexion devient les en-têtes de l'appel. */
async function sessionFor(email: string): Promise<{ headers: Headers }> {
  const res = await m.auth.auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { headers: new Headers({ cookie }) };
}

async function createUser(id: string, email: string) {
  const hash = await m.cred.hashPassword(PASSWORD);
  await m.db.db.transaction(async (tx) => {
    await tx.insert(m.schema.user).values({ id, name: id, email, role: "LEARNER", status: "ACTIVE", emailVerified: true });
    await m.cred.setCredentialPassword(tx, id, hash);
  });
}

const rows = () => m.db.db.select().from(m.schema.pushSubscription);

describe.skipIf(!liveDbAvailable)("abonnements push", () => {
  beforeAll(async () => {
    ({ drop } = await createLiveDb());
    process.env.VAPID_PUBLIC_KEY = "cle-publique-de-test";
    process.env.VAPID_PRIVATE_KEY = "cle-privee-de-test";
    m = {
      push: await import("@/server/live/push"),
      auth: await import("@/server/auth"),
      cred: await import("@/server/live/credentials"),
      db: await import("@/server/pg/client"),
      schema: await import("@/server/pg/schema"),
    };
    await createUser("usr_a", "a@push.test");
    await createUser("usr_b", "b@push.test");
    callA = await sessionFor("a@push.test");
    callB = await sessionFor("b@push.test");
  });

  afterEach(async () => {
    m.push.setPushSender(null);
    process.env.VAPID_PUBLIC_KEY = "cle-publique-de-test";
    process.env.VAPID_PRIVATE_KEY = "cle-privee-de-test";
    await m.db.db.delete(m.schema.pushSubscription);
  });

  afterAll(async () => {
    await drop?.();
  });

  it("réattribue un appareil à la personne qui s'y connecte ensuite (appareil partagé)", async () => {
    await m.push.savePushSubscription(callA, device(1));
    await m.push.savePushSubscription(callB, device(1));
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]!.userId).toBe("usr_b");
    expect((await m.push.getPushState(callA)).endpoints).toEqual([]);
  });

  it("ne retire que les appareils de l'appelant", async () => {
    await m.push.savePushSubscription(callA, device(1));
    await m.push.savePushSubscription(callB, device(2));
    await m.push.removePushSubscription(callB, { endpoint: device(1).endpoint }); // celui d'une autre personne
    expect(await rows()).toHaveLength(2);
    await m.push.removePushSubscription(callB, { endpoint: device(2).endpoint });
    expect((await rows()).map((x) => x.userId)).toEqual(["usr_a"]);
  });

  it("renvoie l'état de l'appelant : disponible, clé publique, ses appareils seulement", async () => {
    await m.push.savePushSubscription(callA, device(1));
    await m.push.savePushSubscription(callB, device(2));
    expect(await m.push.getPushState(callA)).toEqual({ available: true, publicKey: "cle-publique-de-test", endpoints: [device(1).endpoint] });
  });

  it("sans clés VAPID : non disponible, sans erreur, et l'enregistrement est refusé proprement", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    expect(await m.push.getPushState(callA)).toEqual({ available: false, publicKey: null, endpoints: [] });
    await expect(m.push.savePushSubscription(callA, device(1))).rejects.toMatchObject({ code: "BUSINESS_RULE" });
    expect(await rows()).toHaveLength(0);
  });

  it("refuse un point d'accès qui n'est pas en https ou des clés vides", async () => {
    await expect(m.push.savePushSubscription(callA, { ...device(1), endpoint: "http://push.example.test/x" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(m.push.savePushSubscription(callA, { endpoint: device(1).endpoint, keys: { p256dh: "", auth: "a" } })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("n'accepte que les services push des navigateurs : jamais une adresse interne ou arbitraire (requête serveur vers un tiers)", async () => {
    const accepted = [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
      "https://web.push.apple.com/abc",
    ];
    for (const endpoint of accepted) {
      await m.push.savePushSubscription(callA, { ...device(1), endpoint });
      await m.push.removePushSubscription(callA, { endpoint });
    }
    const refused = [
      "https://10.0.0.5:8443/internal",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://coolify-db/x",
      "https://evil.example.com/x",
      "https://fcm.googleapis.com.evil.com/x", // préfixe trompeur
      "https://fcm.googleapis.com@evil.com/x", // identifiants avant le vrai hôte
      "https://user:pass@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x", // port non standard
      "https://evilfcm.googleapis.com/x",
      "https://notpush.apple.com.evil.io/x",
    ];
    for (const endpoint of refused) {
      await expect(m.push.savePushSubscription(callA, { ...device(1), endpoint }), endpoint).rejects.toMatchObject({ code: "VALIDATION" });
    }
    expect(await rows()).toHaveLength(0);
  });

  it("exige une session", async () => {
    await expect(m.push.getPushState({ headers: new Headers() })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("envoie un texte de test fixe à tous les appareils de l'appelant", async () => {
    const sent: Array<{ endpoint: string; payload: Record<string, string> }> = [];
    m.push.setPushSender(async (t, payload) => void sent.push({ endpoint: t.endpoint, payload: JSON.parse(payload) }));
    await m.push.savePushSubscription(callA, device(1));
    await m.push.savePushSubscription(callA, device(2));
    await m.push.savePushSubscription(callB, device(3));
    expect(await m.push.sendTestPush(callA)).toEqual({ sent: 2 });
    expect(sent.map((s) => s.endpoint).sort()).toEqual([device(1).endpoint, device(2).endpoint]);
    expect(sent[0]!.payload).toMatchObject({ title: "Notification de test", url: "/" });
  });

  it("supprime l'appareil expiré (410) mais conserve celui d'une panne passagère (500), sans jamais lever", async () => {
    await m.push.savePushSubscription(callA, device(1));
    m.push.setPushSender(async () => Promise.reject({ statusCode: 410 }));
    expect(await m.push.sendTestPush(callA)).toEqual({ sent: 0 });
    expect(await rows()).toHaveLength(0);

    await m.push.savePushSubscription(callA, device(2));
    m.push.setPushSender(async () => Promise.reject({ statusCode: 500 }));
    expect(await m.push.sendTestPush(callA)).toEqual({ sent: 0 });
    expect(await rows()).toHaveLength(1);
  });

  it("enregistre la date du dernier envoi réussi", async () => {
    await m.push.savePushSubscription(callA, device(1));
    m.push.setPushSender(async () => undefined);
    await m.push.sendTestPush(callA);
    const [r] = await m.db.db.select().from(m.schema.pushSubscription).where(eq(m.schema.pushSubscription.endpoint, device(1).endpoint));
    expect(r!.lastSuccessAt).toBeInstanceOf(Date);
  });
});
