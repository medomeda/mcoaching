/**
 * Envoi des push après les notifications : texte par type, envoi après validation seulement, confidentialité,
 * instance ou compte suspendu, clés absentes (base PostgreSQL jetable).
 */
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createLiveDb, liveDbAvailable } from "./liveDb";

type Mods = {
  push: typeof import("@/server/live/push");
  queue: typeof import("@/server/live/pushQueue");
  helpers: typeof import("@/server/live/helpers");
  brand: typeof import("@/server/live/branding");
  ops: typeof import("@/server/ops/usage");
  db: typeof import("@/server/pg/client");
  schema: typeof import("@/server/pg/schema");
};
type NotifyInput = Parameters<Mods["helpers"]["notify"]>[1];

const TITLES = [
  "Nouvelle demande",
  "Demande affectée",
  "Nouveau message",
  "Précisions demandées",
  "Réponse de votre coach",
  "Demande clôturée",
  "Demande réouverte",
  "Évaluation",
  "Échéance proche",
  "Demande en retard",
  "Information de la plateforme",
];
const PRIVATE = ["Gérer un découragement", "Kouadio Yao", "Texte privé du message"];

let drop: () => Promise<void>;
let m: Mods;
let n = 0;
let sent: Array<{ endpoint: string; payload: Record<string, string>; raw: string }> = [];

const userRow = async (id: string) => (await m.db.db.select().from(m.schema.user).where(eq(m.schema.user.id, id)))[0]!;

/** Appelle notify() dans sa propre transaction, comme le font les modules métier. */
async function notifyOnce(recipient: string, over: Partial<NotifyInput> = {}) {
  const r = await userRow(recipient);
  await m.db.db.transaction((tx) =>
    m.helpers.notify(tx, { recipients: [r], type: "NEW_MESSAGE", title: "Gérer un découragement", summary: "Texte privé du message", eventKey: `test:${++n}`, requestId: null, email: false, ...over }),
  );
}

async function subscribe(userId: string, endpoint = `https://push.example.test/${userId}`) {
  await m.db.db.insert(m.schema.pushSubscription).values({ id: `psh_${userId}_${n++}`, userId, endpoint, p256dh: "p", auth: "a" });
}

describe.skipIf(!liveDbAvailable)("envoi des push", () => {
  beforeAll(async () => {
    ({ drop } = await createLiveDb());
    m = {
      push: await import("@/server/live/push"),
      queue: await import("@/server/live/pushQueue"),
      helpers: await import("@/server/live/helpers"),
      brand: await import("@/server/live/branding"),
      ops: await import("@/server/ops/usage"),
      db: await import("@/server/pg/client"),
      schema: await import("@/server/pg/schema"),
    };
    const u = (id: string, name: string, status: "ACTIVE" | "SUSPENDED") => ({ id, name, email: `${id}@push.test`, role: "LEARNER" as const, status, emailVerified: true });
    await m.db.db.insert(m.schema.user).values([u("usr_k", "Kouadio Yao", "ACTIVE"), u("usr_s", "Compte Suspendu", "SUSPENDED")]);
  });

  const arm = () => {
    process.env.VAPID_PUBLIC_KEY = "cle-publique-de-test";
    process.env.VAPID_PRIVATE_KEY = "cle-privee-de-test";
    sent = [];
    m.push.setPushSender(async (t, payload) => void sent.push({ endpoint: t.endpoint, payload: JSON.parse(payload), raw: payload }));
  };

  afterEach(async () => {
    m.push.setPushSender(null);
    await m.ops.setSuspension(false, null);
    await m.db.db.delete(m.schema.pushSubscription);
    arm();
  });
  afterAll(async () => {
    await drop?.();
  });

  it("donne, pour chacun des types, un titre du tableau du spec et un corps qui ne contient que le nom de la plateforme", () => {
    const types = m.schema.notificationTypeEnum.enumValues;
    expect(types).toHaveLength(16);
    for (const t of types) {
      const text = m.push.pushTextFor(t, "Ma Plateforme");
      expect(TITLES, t).toContain(text.title);
      expect(text.body).toBe("Ouvrez Ma Plateforme pour les détails.");
    }
  });

  it("construit un lien interne vers la demande, ou vers les notifications", () => {
    expect(m.helpers.notificationPath("LEARNER", "req_1")).toBe("/learner/requests/req_1");
    expect(m.helpers.notificationPath("COACH", "req_1")).toBe("/coach/requests/req_1");
    expect(m.helpers.notificationPath("ADMIN", null)).toBe("/admin/notifications");
  });

  it("envoie le type d'événement à tous les appareils du destinataire, sans aucun contenu privé", async () => {
    arm();
    await subscribe("usr_k", "https://push.example.test/k1");
    await subscribe("usr_k", "https://push.example.test/k2");
    await m.queue.withPushDelivery(() => notifyOnce("usr_k"));
    await m.queue.settlePushDeliveries();
    expect(sent.map((s) => s.endpoint).sort()).toEqual(["https://push.example.test/k1", "https://push.example.test/k2"]);
    const body = sent[0]!.payload;
    expect(body).toMatchObject({ title: "Nouveau message", url: "/learner/notifications" });
    expect(body.body).toBe(`Ouvrez ${await m.brand.getBrandName()} pour les détails.`);
    expect(body.tag).toMatch(/^mentora-ntf_/);
    for (const secret of PRIVATE) expect(sent[0]!.raw).not.toContain(secret);
  });

  it("n'envoie rien à une personne sans appareil abonné", async () => {
    arm();
    await m.queue.withPushDelivery(() => notifyOnce("usr_k"));
    await m.queue.settlePushDeliveries();
    expect(sent).toHaveLength(0);
  });

  it("n'envoie rien si la transaction est annulée après notify()", async () => {
    arm();
    await subscribe("usr_k");
    await m.queue.withPushDelivery(async () => {
      await expect(
        m.db.db.transaction(async (tx) => {
          const r = await userRow("usr_k");
          await m.helpers.notify(tx, { recipients: [r], type: "NEW_MESSAGE", title: "t", summary: "s", eventKey: `test:${++n}`, requestId: null, email: false });
          throw new Error("opération annulée");
        }),
      ).rejects.toThrow("opération annulée");
    });
    await m.queue.settlePushDeliveries();
    expect(sent).toHaveLength(0);
  });

  it("n'envoie rien quand l'instance est suspendue", async () => {
    arm();
    await subscribe("usr_k");
    await m.ops.setSuspension(true, null);
    await m.queue.withPushDelivery(() => notifyOnce("usr_k"));
    await m.queue.settlePushDeliveries();
    expect(sent).toHaveLength(0);
  });

  it("n'envoie rien à un compte suspendu", async () => {
    arm();
    await subscribe("usr_s");
    await m.queue.withPushDelivery(() => notifyOnce("usr_s"));
    await m.queue.settlePushDeliveries();
    expect(sent).toHaveLength(0);
  });

  it("sans clés VAPID : aucun envoi et aucune erreur", async () => {
    arm();
    await subscribe("usr_k");
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    await expect(m.queue.withPushDelivery(() => notifyOnce("usr_k"))).resolves.toBeUndefined();
    await m.queue.settlePushDeliveries();
    expect(sent).toHaveLength(0);
  });

  it("un envoi en échec ne fait jamais échouer l'opération métier", async () => {
    arm();
    await subscribe("usr_k");
    m.push.setPushSender(async () => Promise.reject(new Error("service push indisponible")));
    const result = await m.queue.withPushDelivery(async () => {
      await notifyOnce("usr_k");
      return "opération réussie";
    });
    expect(result).toBe("opération réussie");
    await m.queue.settlePushDeliveries();
  });

  it("hors collecteur, notify() n'envoie rien et n'échoue pas", async () => {
    arm();
    await subscribe("usr_k");
    await notifyOnce("usr_k");
    await m.queue.settlePushDeliveries();
    expect(sent).toHaveLength(0);
    const count = await m.db.db.select().from(m.schema.notification).where(eq(m.schema.notification.userId, "usr_k"));
    expect(count.length).toBeGreaterThan(0); // la notification interne, elle, existe bien
  });
});
