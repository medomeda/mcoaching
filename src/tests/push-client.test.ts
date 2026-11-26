/** Côté navigateur du push : prise en charge, repli en démonstration, nettoyage sans erreur. */
import { beforeAll, describe, expect, it } from "vitest";

type Api = typeof import("@/lib/api");
type Client = typeof import("@/components/pwa/push-client");
let apiMod: Api;
let client: Client;

const full = { serviceWorker: true, pushManager: true, notification: true, ios: false, standalone: false, registered: true };

describe("pushSupportOf", () => {
  beforeAll(async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    apiMod = await import("@/lib/api");
    client = await import("@/components/pwa/push-client");
  });

  it("« ok » quand tout est présent et que le service worker est enregistré", () => {
    expect(client.pushSupportOf(full)).toBe("ok");
  });

  it("« ios-not-installed » sur iPhone tant que l'application n'est pas installée", () => {
    expect(client.pushSupportOf({ ...full, pushManager: false, ios: true, standalone: false })).toBe("ios-not-installed");
  });

  it("sur iPhone, l'application installée avec push disponible est « ok »", () => {
    expect(client.pushSupportOf({ ...full, ios: true, standalone: true })).toBe("ok");
  });

  it("« unsupported » sans service worker dans le navigateur", () => {
    expect(client.pushSupportOf({ ...full, serviceWorker: false })).toBe("unsupported");
  });

  it("« unsupported » sans notifications ni push (hors iPhone)", () => {
    expect(client.pushSupportOf({ ...full, pushManager: false })).toBe("unsupported");
    expect(client.pushSupportOf({ ...full, notification: false })).toBe("unsupported");
  });

  it("« no-service-worker » quand tout est présent mais le worker n'est pas enregistré (développement)", () => {
    expect(client.pushSupportOf({ ...full, registered: false })).toBe("no-service-worker");
  });
});

describe("isForeignSubscription (appareil partagé)", () => {
  const mine = ["https://fcm.googleapis.com/fcm/send/mien"];

  it("reconnaît l'abonnement d'une autre personne : l'appareil est abonné mais pas pour le compte connecté", () => {
    expect(client.isForeignSubscription("https://fcm.googleapis.com/fcm/send/ancien-compte", mine)).toBe(true);
    expect(client.isForeignSubscription("https://fcm.googleapis.com/fcm/send/ancien-compte", [])).toBe(true);
  });

  it("laisse en place l'abonnement du compte connecté", () => {
    expect(client.isForeignSubscription(mine[0]!, mine)).toBe(false);
  });

  it("ne fait rien sans abonnement sur l'appareil", () => {
    expect(client.isForeignSubscription(null, mine)).toBe(false);
  });
});

describe("api.push en démonstration", () => {
  it("indique que la fonction n'est pas disponible, sans appel au serveur", async () => {
    expect(await apiMod.api.push.state()).toEqual({ available: false, publicKey: null, endpoints: [] });
  });

  it("refuse l'enregistrement, le retrait et le test", async () => {
    await expect(apiMod.api.push.save({})).rejects.toMatchObject({ code: "BUSINESS_RULE" });
    await expect(apiMod.api.push.remove({})).rejects.toMatchObject({ code: "BUSINESS_RULE" });
    await expect(apiMod.api.push.test()).rejects.toMatchObject({ code: "BUSINESS_RULE" });
  });
});

describe("nettoyage à la déconnexion", () => {
  it("disablePush et clearAppCaches ne lèvent jamais, même sans navigateur complet", async () => {
    await expect(client.disablePush()).resolves.toBeUndefined();
    await expect(client.clearAppCaches()).resolves.toBeUndefined();
  });
});
