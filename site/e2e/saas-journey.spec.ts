import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { createAuth } from "../src/server/auth";
import { createOperator } from "../src/server/operator";
import { codeFromUri } from "../src/test/totp";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";
import { ADMIN_HOST, E2E_AUTH_SECRET, E2E_DB, INSTANCE_PORTS, SITE_HOST } from "../playwright.config";
import { createInstance, type Instance } from "./support/two-instances";

const EMAIL = "operateur@mentora.test";
const PASSWORD = "Un-mot-de-passe-solide-42";
const adminUrl = process.env.SITE_TEST_DATABASE_URL ?? "";

let acme: Instance;
let beta: Instance;
let totpUri = "";
let pool: Pool;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  pool = new Pool({ connectionString: adminUrl.replace(/\/[^/?]*(\?.*)?$/, `/${E2E_DB}$1`), max: 2 });
  pool.on("error", () => undefined);
  const db = drizzle(pool, { schema, casing: "snake_case" });
  const auth = createAuth(db, { baseURL: ADMIN_HOST, secret: E2E_AUTH_SECRET });
  await createOperator(auth, db, { email: EMAIL, password: PASSWORD });
  // Active le second facteur comme le ferait l'opérateur (même moteur que le serveur testé).
  const r = await auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD }, asResponse: true });
  const h = new Headers({ cookie: r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") });
  const en = await auth.api.enableTwoFactor({ body: { password: PASSWORD }, headers: h });
  if (!("totpURI" in en)) throw new Error("TOTP attendu");
  totpUri = en.totpURI;
  await auth.api.verifyTOTP({ body: { code: await codeFromUri(totpUri) }, headers: h });
  acme = await createInstance("acme", INSTANCE_PORTS.acme, adminUrl);
  beta = await createInstance("beta", INSTANCE_PORTS.beta, adminUrl);
});

test.afterAll(async () => {
  await acme?.drop();
  await beta?.drop();
  await pool?.end();
});

async function loginOperator(page: Page) {
  await page.goto(`${ADMIN_HOST}/admin`);
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByLabel("Adresse e-mail").fill(EMAIL);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByLabel(/Code à 6 chiffres/).fill(await codeFromUri(totpUri));
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Accueil" })).toBeVisible();
}

async function createClientViaUi(page: Page, opts: { name: string; sub: string; fromProspect: boolean }): Promise<string> {
  if (opts.fromProspect) {
    await page.goto(`${ADMIN_HOST}/admin/prospects`);
    await page.getByRole("link", { name: "Convertir en client" }).first().click();
    await expect(page.getByLabel("Nom du client")).toHaveValue("Awa Traoré");
  } else {
    await page.goto(`${ADMIN_HOST}/admin/clients/nouveau`);
    await page.getByLabel("Nom du client").fill(opts.name);
  }
  await page.getByLabel(/Sous-domaine/).fill(opts.sub);
  await page.getByLabel("Formule").selectOption({ label: "Solo" });
  await page.getByRole("button", { name: "Créer le client" }).click();
  const key = page.getByLabel("Clé d’accès de l’instance");
  await expect(key).toBeVisible();
  const value = await key.inputValue();
  expect(value.length).toBeGreaterThanOrEqual(40);
  await page.getByRole("link", { name: /J’ai copié la clé/ }).click();
  await expect(page.getByRole("heading", { name: opts.fromProspect ? "Awa Traoré" : opts.name })).toBeVisible();
  return value;
}

test("de la demande d'essai à la suspension et à la réactivation d'une instance", async ({ page }) => {
  // 1. La vitrine : demande d'essai.
  await page.goto(`${SITE_HOST}/essai`);
  await page.getByLabel("Nom et prénom").fill("Awa Traoré");
  await page.getByLabel("Adresse e-mail").fill("awa@example.com");
  await page.getByLabel("Votre activité ou domaine").fill("Coaching de carrière");
  await page.getByRole("button", { name: "Demander mon essai gratuit" }).click();
  // Sans consentement, rien n'est enregistré.
  await expect(page.getByText("Votre consentement est nécessaire")).toBeVisible();
  await page.getByLabel(/J’accepte que mes informations/).check();
  await page.getByRole("button", { name: "Demander mon essai gratuit" }).click();
  await expect(page.getByText("votre demande est bien reçue")).toBeVisible();

  // 2. Connexion de l'opérateur (mot de passe + code), alerte « nouvelle demande ».
  await loginOperator(page);
  await expect(page.getByText(/1 nouvelle\(s\) demande\(s\) d’essai/)).toBeVisible();

  // 3. Une formule publiée apparaît sur la page Tarifs, jamais avant publication.
  await page.goto(`${SITE_HOST}/tarifs`);
  await expect(page.getByText("Demandez un essai").first()).toBeVisible();
  await page.goto(`${ADMIN_HOST}/admin/formules?nouveau=1`);
  await page.getByLabel("Nom", { exact: true }).fill("Solo");
  await page.getByLabel(/Prix mensuel/).fill("10000");
  await page.getByLabel(/Coachs maximum/).fill("1");
  await page.getByLabel(/Membres actifs maximum/).fill("10");
  await page.getByLabel(/Publiée sur la page Tarifs/).check();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("cell", { name: "Solo", exact: true })).toBeVisible();
  await page.goto(`${SITE_HOST}/tarifs`);
  await expect(page.getByRole("heading", { name: "Solo" })).toBeVisible();
  await expect(page.getByText(/10.000.FCFA/)).toBeVisible();

  // 4. Prospect converti en client ; la clé s'affiche une seule fois.
  const keyAcme = await createClientViaUi(page, { name: "Awa Traoré", sub: "acme", fromProspect: true });
  await page.goto(`${ADMIN_HOST}/admin/prospects`);
  await expect(page.locator("tbody").getByText("Converti").first()).toBeVisible();

  // 5. Deuxième client indépendant.
  const keyBeta = await createClientViaUi(page, { name: "Cabinet Beta", sub: "beta", fromProspect: false });
  expect(keyBeta).not.toBe(keyAcme);

  // 6. Les instances démarrent avec leur clé ; compteurs différents, non mélangés.
  await acme.seedUsers([{ role: "COACH" }, { role: "LEARNER" }, { role: "LEARNER" }]);
  await beta.seedUsers([{ role: "LEARNER" }]);
  await acme.start(keyAcme);
  await beta.start(keyBeta);

  const clients = await page.goto(`${ADMIN_HOST}/admin/clients`).then(() => page.locator("tbody tr"));
  await page.getByRole("link", { name: "Awa Traoré" }).click();
  await page.getByRole("button", { name: "Tester la connexion" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Santé" })).toContainText("en ligne");
  await expect(page.getByRole("status").filter({ hasText: "Santé" })).toContainText("1 coachs · 2 membres actifs");
  await expect(page.getByRole("status").filter({ hasText: "Santé" })).toContainText("e2e-1.0.0");
  void clients;

  await page.goto(`${ADMIN_HOST}/admin/clients`);
  await page.getByRole("link", { name: "Cabinet Beta" }).click();
  await page.getByRole("button", { name: "Tester la connexion" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Santé" })).toContainText("0 coachs · 1 membres actifs");

  // 7. Une clé refusée n'expose rien : l'instance beta avec la clé d'acme ne répond pas au test.
  await beta.start(keyAcme);
  await page.getByRole("button", { name: "Tester la connexion" }).click();
  await expect(page.getByText("Compteurs indisponibles")).toBeVisible();
  await beta.start(keyBeta);

  // 8. Suspension d'acme : message visible sur l'instance, beta intacte.
  await page.goto(`${ADMIN_HOST}/admin/clients`);
  await page.getByRole("link", { name: "Awa Traoré" }).click();
  await page.getByLabel(/Message affiché/).fill("Abonnement impayé.");
  await page.getByRole("button", { name: "Suspendre l’instance" }).click();
  await expect(page.getByRole("button", { name: "Réactiver l’instance" })).toBeVisible();
  await page.goto(`${acme.url}/login`);
  await expect(page.getByText("Abonnement impayé.")).toBeVisible();
  await page.goto(`${beta.url}/login`);
  await expect(page.getByText("Abonnement impayé.")).toHaveCount(0);

  // 9. Échec de l'appel : instance arrêtée → statut inchangé et erreur affichée.
  await page.goto(`${ADMIN_HOST}/admin/clients`);
  await page.getByRole("link", { name: "Cabinet Beta" }).click();
  await beta.stop();
  await page.getByRole("button", { name: "Suspendre l’instance" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Le statut n’a pas été modifié" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Suspendre l’instance" })).toBeVisible();
  await beta.start(keyBeta);

  // 10. Réactivation d'acme : le message disparaît.
  await page.goto(`${ADMIN_HOST}/admin/clients`);
  await page.getByRole("link", { name: "Awa Traoré" }).click();
  await page.getByRole("button", { name: "Réactiver l’instance" }).click();
  await expect(page.getByRole("button", { name: "Suspendre l’instance" })).toBeVisible();
  await page.goto(`${acme.url}/login`);
  await expect(page.getByText("Abonnement impayé.")).toHaveCount(0);

  // 11. Le journal garde la trace des actions (sans clé ni secret).
  await page.goto(`${ADMIN_HOST}/admin/journal`);
  await expect(page.getByText("CLIENT_CREATED").first()).toBeVisible();
  await expect(page.locator("main")).not.toContainText(keyAcme);
});
