import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchHealth, fetchUsage, setInstanceSuspension } from "./instance-client";

let server: Server;
let base: URL;
const seen: { auth?: string; path?: string; body?: string }[] = [];
const USAGE = { version: "1.0.0", generated_at: "2027-01-10T10:00:00Z", suspended: false, coaches_active: 2, members_active: 5, requests_this_month: 7, requests_overdue: 1, last_activity_at: null };

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ auth: req.headers.authorization, path: req.url, body });
      if (req.url === "/api/health") return void res.writeHead(200, { "content-type": "application/json" }).end('{"status":"ok"}');
      if (req.url === "/redirect/api/health") return void res.writeHead(302, { location: "http://169.254.169.254/" }).end();
      if (req.url === "/slow/api/health") return; // ne répond jamais
      if (req.url === "/api/ops/usage") {
        if (req.headers.authorization !== "Bearer bonne-cle") return void res.writeHead(401).end();
        // Champs en trop et contenu sensible : ils ne doivent pas traverser.
        return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ...USAGE, email: "secret@x.io" }));
      }
      if (req.url === "/api/ops/suspension") return void res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
});
afterAll(() => server.close());

describe("fetchHealth", () => {
  it("200 : ok avec latence", async () => {
    const r = await fetchHealth(base);
    expect(r).toMatchObject({ ok: true, status: 200 });
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });
  it("redirection : ok=false, jamais suivie", async () => {
    const r = await fetchHealth(new URL("/redirect", base));
    expect(r).toMatchObject({ ok: false, status: 302 });
  });
  it("délai dépassé : ok=false, status null", async () => {
    const r = await fetchHealth(new URL("/slow", base), { timeoutMs: 150 });
    expect(r).toMatchObject({ ok: false, status: null });
  });
  it("instance injoignable : ok=false", async () => {
    expect(await fetchHealth(new URL("http://127.0.0.1:1"), { timeoutMs: 500 })).toMatchObject({ ok: false, status: null });
  });
});

describe("fetchUsage", () => {
  it("renvoie uniquement les champs du contrat", async () => {
    const u = await fetchUsage(base, "bonne-cle");
    expect(u).toEqual(USAGE);
    expect(JSON.stringify(u)).not.toContain("secret@x.io");
  });
  it("mauvaise clé ou réponse invalide : null", async () => {
    expect(await fetchUsage(base, "mauvaise")).toBeNull();
    expect(await fetchUsage(new URL("/slow", base), "bonne-cle", { timeoutMs: 150 })).toBeNull();
  });
});

describe("INSTANCE_CONNECT_OVERRIDES (tests de bout en bout uniquement)", () => {
  it("redirige l'adresse validée vers l'origine locale indiquée, sans effet sur les autres hôtes", async () => {
    process.env.INSTANCE_CONNECT_OVERRIDES = JSON.stringify({ "acme.mentora.app": base.origin });
    try {
      expect(await fetchHealth(new URL("https://acme.mentora.app"))).toMatchObject({ ok: true, status: 200 });
      expect(await fetchHealth(new URL("https://autre.mentora.app"), { timeoutMs: 300 })).toMatchObject({ ok: false });
    } finally {
      delete process.env.INSTANCE_CONNECT_OVERRIDES;
    }
  });
});

describe("setInstanceSuspension", () => {
  it("envoie la clé en en-tête et le corps attendu", async () => {
    seen.length = 0;
    expect(await setInstanceSuspension(base, "bonne-cle", true, "Impayé")).toBe(true);
    expect(seen[0]).toMatchObject({ auth: "Bearer bonne-cle", path: "/api/ops/suspension" });
    expect(JSON.parse(seen[0]!.body!)).toEqual({ suspended: true, message: "Impayé" });
  });
});
