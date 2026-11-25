import { describe, expect, it } from "vitest";
import { classifyHost, decide } from "./host";

const env = { siteUrl: "https://mentora.app", adminHost: "admin.mentora.app" };

describe("classifyHost", () => {
  it("reconnaît l'hôte public malgré port et majuscules", () => {
    expect(classifyHost("MENTORA.app:443", env)).toBe("public");
  });
  it("reconnaît l'hôte d'administration malgré le point final", () => {
    expect(classifyHost("admin.mentora.app.", env)).toBe("admin");
  });
  it("refuse les hôtes inconnus ou usurpés", () => {
    expect(classifyHost(null, env)).toBe("unknown");
    expect(classifyHost("evil.com", env)).toBe("unknown");
    expect(classifyHost("admin.mentora.app.evil.com", env)).toBe("unknown");
  });
  it("compare le port quand la configuration en donne un", () => {
    const dev = { siteUrl: "http://localhost:3601", adminHost: "admin.localhost:3601" };
    expect(classifyHost("localhost:3601", dev)).toBe("public");
    expect(classifyHost("localhost:9999", dev)).toBe("unknown");
  });
});

describe("même hôte pour la vitrine et l'administration (développement local)", () => {
  const local = { siteUrl: "http://localhost:3601", adminHost: "localhost:3601" };
  it("classe l'hôte commun en « both »", () => {
    expect(classifyHost("localhost:3601", local)).toBe("both");
    expect(classifyHost("localhost:9999", local)).toBe("unknown");
  });
  it("sert à la fois les pages publiques et /admin", () => {
    expect(decide("both", "/tarifs")).toBe("next");
    expect(decide("both", "/admin/login")).toBe("next");
    expect(decide("both", "/api/admin/auth/get-session")).toBe("next");
  });
});

describe("decide", () => {
  it("l'hôte public ne sert jamais /admin ni /api/admin", () => {
    expect(decide("public", "/admin")).toBe("notfound");
    expect(decide("public", "/admin/clients")).toBe("notfound");
    expect(decide("public", "/api/admin/x")).toBe("notfound");
    expect(decide("public", "/tarifs")).toBe("next");
  });
  it("l'hôte d'administration ne sert pas les pages publiques", () => {
    expect(decide("admin", "/tarifs")).toBe("notfound");
    expect(decide("admin", "/admin/login")).toBe("next");
    expect(decide("admin", "/administration")).toBe("notfound");
  });
  it("laisse passer la santé et les ressources sur les deux hôtes, refuse l'inconnu", () => {
    expect(decide("admin", "/api/health")).toBe("next");
    expect(decide("public", "/_next/static/a.js")).toBe("next");
    expect(decide("unknown", "/")).toBe("notfound");
    expect(decide("unknown", "/admin")).toBe("notfound");
  });
  it("la sonde de santé répond sur n'importe quel hôte (contrôle interne de Docker/Coolify)", () => {
    expect(decide("unknown", "/api/health")).toBe("next");
  });
});
