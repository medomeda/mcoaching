/** Service worker de la PWA : contenu du script et en-têtes de la route /sw.js. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServiceWorker } from "@/lib/pwa/sw-script";

describe("buildServiceWorker", () => {
  it("nomme le cache d'après la version du build", () => {
    expect(buildServiceWorker("abc")).toContain("mentora-static-");
    expect(buildServiceWorker("abc")).toContain(JSON.stringify("abc"));
  });

  it("change de contenu d'une version à l'autre (c'est ce qui déclenche la mise à jour)", () => {
    expect(buildServiceWorker("v1")).not.toBe(buildServiceWorker("v2"));
  });

  it("gère l'activation sur demande, la page hors ligne et les notifications", () => {
    const sw = buildServiceWorker("abc");
    expect(sw).toContain("SKIP_WAITING");
    expect(sw).toContain('"/offline"');
    expect(sw).toContain('addEventListener("push"');
    expect(sw).toContain('addEventListener("notificationclick"');
  });

  it("n'ouvre jamais un lien d'une autre origine depuis une notification", () => {
    expect(buildServiceWorker("abc")).toContain("target.origin !== self.location.origin");
  });

  it("ne met rien en cache de l'API ni des pages : seuls les fichiers versionnés le sont", () => {
    const sw = buildServiceWorker("abc");
    expect(sw).not.toContain("/api");
    expect(sw).toContain('"/_next/static/"');
    expect(sw).toContain('"/icons/"');
  });

  it("n'affiche que ce que le serveur envoie, avec un lien interne par défaut", () => {
    const sw = buildServiceWorker("abc");
    expect(sw).toContain('typeof data.url === "string" ? data.url : "/"');
  });
});

describe("route /sw.js", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("répond en JavaScript, sans cache, avec une politique de sécurité restrictive", async () => {
    const { GET } = await import("@/app/sw.js/route");
    const res = GET();
    expect(res.headers.get("content-type")).toContain("application/javascript");
    expect(res.headers.get("cache-control")).toBe("no-cache, no-store, must-revalidate");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'self'; script-src 'self'");
  });

  it("injecte l'identifiant de build de l'environnement", async () => {
    vi.stubEnv("MENTORA_BUILD_ID", "build123");
    const { GET } = await import("@/app/sw.js/route");
    expect(await GET().text()).toContain("build123");
  });

  it("utilise « dev » sans identifiant de build", async () => {
    vi.stubEnv("MENTORA_BUILD_ID", "");
    delete process.env.MENTORA_BUILD_ID;
    const { GET } = await import("@/app/sw.js/route");
    expect(await GET().text()).toContain(JSON.stringify("dev"));
  });
});
