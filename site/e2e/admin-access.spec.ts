import { expect, test } from "@playwright/test";

const PUBLIC = { Host: "site.localtest.me:3601" };
const ADMIN = { Host: "admin.localtest.me:3601" };

test("l'hôte public ne sert jamais l'administration", async ({ request }) => {
  expect((await request.get("/admin", { headers: PUBLIC })).status()).toBe(404);
  expect((await request.get("/admin/login", { headers: PUBLIC })).status()).toBe(404);
  expect((await request.get("/api/admin/auth/get-session", { headers: PUBLIC })).status()).toBe(404);
});

test("l'hôte d'administration ne sert pas les pages publiques", async ({ request }) => {
  expect((await request.get("/tarifs", { headers: ADMIN })).status()).toBe(404);
  expect((await request.get("/", { headers: ADMIN })).status()).toBe(404);
});

test("sans session, /admin redirige vers la connexion, en noindex", async ({ request }) => {
  const res = await request.get("/admin", { headers: ADMIN, maxRedirects: 0 });
  expect([307, 308]).toContain(res.status());
  expect(res.headers()["location"]).toContain("/admin/login");
  expect(res.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  const login = await request.get("/admin/login", { headers: ADMIN });
  expect(login.status()).toBe(200);
  expect(login.headers()["x-robots-tag"]).toBe("noindex, nofollow");
});

test("un hôte inconnu reçoit 404 mais la sonde de santé répond", async ({ request }) => {
  expect((await request.get("/", { headers: { Host: "evil.example" } })).status()).toBe(404);
  expect((await request.get("/api/health", { headers: { Host: "evil.example" } })).status()).toBe(200);
});
