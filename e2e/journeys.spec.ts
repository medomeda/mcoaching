/**
 * Parcours de bout en bout dans un vrai navigateur.
 * Un même contexte = même base locale ; chaque onglet a sa propre session (sessionStorage).
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const PASSWORD = "Demo-Coaching-2026";
const D = "coaching-demo.example";

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("Download the React DevTools")) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function login(context: BrowserContext, email: string) {
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByRole("textbox", { name: "Mot de passe" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/(admin|coach|learner)/);
  return { page, errors };
}

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let requestUrl = "";

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ locale: "fr-FR", timezoneId: "Africa/Abidjan" });
});
test.afterAll(async () => context.close());

test("base vide : écran d'initialisation puis chargement de la démo", async () => {
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto("/login");
  await expect(page.getByText("Plateforme non initialisée")).toBeVisible();
  await page.getByRole("button", { name: "Charger les données de démonstration" }).click();
  await expect(page.getByText("Connexion rapide")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(`admin@${D}`)).toBeVisible();
  expect(errors).toEqual([]);
  await page.close();
});

test("apprenant : création et soumission d'une demande", async () => {
  const { page, errors } = await login(context, `kouadio.yao@${D}`);
  await expect(page.getByRole("heading", { name: /Bonjour Kouadio/ })).toBeVisible();
  await page.getByRole("link", { name: "Nouvelle demande" }).first().click();
  await page.getByLabel(/Gestion du risque/).check();
  await page.getByLabel("Sujet").fill("Comprendre le risque de liquidité d’un titre");
  await page.getByLabel("Description").fill("Certains titres sont très peu échangés. Comment cela affecte-t-il le risque de mon investissement ?");
  await page.getByRole("button", { name: "Vérifier le récapitulatif" }).click();
  await expect(page.getByText("Récapitulatif", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Soumettre la demande" }).click();
  await page.waitForURL(/\/learner\/requests\/req_/);
  await expect(page.getByText(/COA-\d{4}-\d{6}/).first()).toBeVisible();
  await expect(page.getByText("Soumise", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Message automatique/)).toBeVisible();
  requestUrl = new URL(page.url()).pathname;
  expect(errors).toEqual([]);
});

test("coach : consultation (enregistrement initial) puis demande de précisions", async () => {
  const { page, errors } = await login(context, `moussa.diabate@${D}`);
  await page.goto(requestUrl.replace("/learner/", "/coach/"));
  await expect(page.getByText("En attente du coach").first()).toBeVisible();
  await page.getByRole("radio", { name: "Demander des précisions" }).click();
  await page.getByLabel("Message", { exact: true }).fill("Bonjour Kouadio, de quel titre parlez-vous précisément ?");
  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByText("En attente de l’apprenant").first()).toBeVisible();
  await page.getByLabel("Nouvelle note interne").fill("Note privée : vérifier la liquidité du titre.");
  await page.getByRole("button", { name: "Ajouter la note" }).click();
  await expect(page.getByText("Note privée : vérifier la liquidité du titre.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("apprenant : voit la demande de précisions, répond, ne voit pas les notes", async () => {
  const { page, errors } = await login(context, `kouadio.yao@${D}`);
  await page.goto(requestUrl);
  await expect(page.getByText("Votre coach attend votre réponse")).toBeVisible();
  await expect(page.getByText("Note privée")).toHaveCount(0);
  await page.getByLabel("Message", { exact: true }).fill("Il s’agit d’un titre du compartiment secondaire.");
  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByText("En cours").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("coach non responsable : accès refusé par URL directe (REC-09)", async () => {
  const { page, errors } = await login(context, `fatou.ndiaye@${D}`);
  await page.goto(requestUrl.replace("/learner/", "/coach/"));
  await expect(page.getByText("Accès refusé")).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByText(/Cet espace est réservé/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("apprenant au quota épuisé : soumission impossible et explication", async () => {
  const { page, errors } = await login(context, `ibrahim.sanogo@${D}`);
  await expect(page.getByText("Vous ne pouvez pas soumettre de nouvelle demande")).toBeVisible();
  await expect(page.getByText(/toutes les demandes prévues par votre quota/)).toBeVisible();
  await page.goto("/learner/entitlement");
  await expect(page.getByText("0 restante(s)")).toBeVisible();
  expect(errors).toEqual([]);
});

test("admin : supervision, réaffectation d'une demande en retard, audit", async () => {
  const { page, errors } = await login(context, `admin@${D}`);
  await expect(page.getByText("Demandes nécessitant une intervention")).toBeVisible();
  await page.getByRole("link", { name: /En retard/ }).first().click();
  await page.waitForURL(/view=overdue/);
  await page.getByText("Gestion d’une baisse importante").click();
  await expect(page.getByText(/Consultation à des fins de supervision/)).toBeVisible();
  await page.getByRole("button", { name: "Réaffecter" }).click();
  const fatouOption = await page.getByLabel("Nouveau coach").locator("option", { hasText: "Fatou Ndiaye" }).getAttribute("value");
  await page.getByLabel("Nouveau coach").selectOption(fatouOption!);
  await page.getByLabel("Motif").fill("Coach principal surchargé");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Confirmer la réaffectation" }).click();
  await expect(page.getByText("Demande réaffectée.")).toBeVisible();
  await expect(page.getByText(/Réaffectation : Moussa Diabaté → Fatou Ndiaye/)).toBeVisible();
  await page.goto("/admin/audit");
  await expect(page.locator("main li").getByText("Réaffectation d’une demande").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("admin crée un apprenant ; activation par le lien reçu dans la boîte mail de démo", async () => {
  const { page, errors } = await login(context, `admin@${D}`);
  await page.goto("/admin/learners");
  await page.getByRole("button", { name: "Nouvel apprenant" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nom complet").fill("Nouvel Apprenant Test");
  await dialog.getByLabel("Adresse e-mail").fill("nouvel.apprenant@test.example");
  await dialog.getByRole("button", { name: "Créer le compte" }).click();
  await expect(page.getByText(/Compte créé pour Nouvel Apprenant Test/)).toBeVisible();
  await expect(page.locator("main table").getByText("Nouvel Apprenant Test")).toBeVisible();
  await page.getByRole("button", { name: /^Démo/ }).click();
  await page.getByRole("button", { name: "Exécuter les tâches planifiées" }).click();
  await page.getByRole("button", { name: /Boîte mail de démo/ }).click();
  const mail = page.getByRole("dialog").locator("li", { hasText: "nouvel.apprenant@test.example" }).first();
  await mail.getByRole("link", { name: "Activer le compte" }).click();
  await page.waitForURL(/\/activate\?token=/);
  await expect(page.getByText("Nouvel Apprenant Test")).toBeVisible();
  await page.getByRole("textbox", { name: "Mot de passe" }).fill("Activation-2026");
  await page.getByRole("textbox", { name: "Confirmation" }).fill("Activation-2026");
  await page.getByRole("button", { name: "Activer mon compte" }).click();
  await page.waitForURL(/\/login\?reset=1|\/admin/);
  // Nouvel onglet = nouvelle session (l'onglet courant est encore connecté en administrateur).
  const learner = await context.newPage();
  await learner.goto("/login");
  await learner.getByLabel("Adresse e-mail").fill("nouvel.apprenant@test.example");
  await learner.getByRole("textbox", { name: "Mot de passe" }).fill("Activation-2026");
  await learner.getByRole("button", { name: "Se connecter" }).click();
  await learner.waitForURL(/\/learner/);
  // Sans coach ni droit : explication et pas de bouton de soumission (PRD §6.1).
  await expect(learner.getByText(/Aucun droit au coaching ne vous a été attribué/)).toBeVisible();
  await expect(learner.getByText(/Aucun coach ne vous est encore affecté/).first()).toBeVisible();
  await expect(learner.getByRole("link", { name: "Nouvelle demande" }).and(learner.locator("main a"))).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("horloge de démo : le dépassement d'échéance produit le retard et l'alerte", async () => {
  const { page, errors } = await login(context, `admin@${D}`);
  await page.getByRole("button", { name: /^Démo/ }).click();
  await page.getByRole("button", { name: "+3 jours" }).click();
  await expect(page.getByText(/Horloge avancée/)).toBeVisible();
  await page.goto("/admin/requests?view=overdue");
  await expect(page.getByText("Ouvrir un compte titres auprès d’une SGI")).toBeVisible();
  await page.goto("/admin/notifications");
  await expect(page.getByText(/Escalade/).first()).toBeVisible();
  await page.getByRole("button", { name: /^Démo/ }).click();
  await page.getByRole("button", { name: "Réel" }).click();
  expect(errors).toEqual([]);
});

test("toutes les pages de chaque espace se chargent sans erreur", async () => {
  const routes: Record<string, string[]> = {
    [`admin@${D}`]: ["/admin", "/admin/requests", "/admin/learners", "/admin/coaches", "/admin/assignments", "/admin/entitlements", "/admin/reports", "/admin/notifications", "/admin/users", "/admin/settings", "/admin/audit", "/admin/profile"],
    [`moussa.diabate@${D}`]: ["/coach", "/coach/requests", "/coach/learners", "/coach/availability", "/coach/notifications", "/coach/profile"],
    [`awa.coulibaly@${D}`]: ["/learner", "/learner/requests", "/learner/requests/new", "/learner/coach", "/learner/entitlement", "/learner/notifications", "/learner/profile"],
  };
  for (const [email, paths] of Object.entries(routes)) {
    const { page, errors } = await login(context, email);
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      await expect(page.getByText("Le chargement a échoué")).toHaveCount(0);
      await expect(page.getByText("Accès refusé")).toHaveCount(0);
    }
    // Navigation dans des sous-pages de détail
    if (email.startsWith("admin")) {
      await page.goto("/admin/coaches");
      await page.getByText("Moussa Diabaté").first().click();
      await expect(page.getByText("Apprenants affectés")).toBeVisible();
      await page.goto("/admin/entitlements");
      await page.getByRole("link", { name: "Mariam Traoré" }).click();
      await expect(page.getByText("Registre des mouvements de quota")).toBeVisible();
    }
    expect(errors, `Erreurs pour ${email}`).toEqual([]);
    await page.close();
  }
});

test("mobile : la messagerie reste utilisable", async ({ browser }) => {
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "fr-FR" });
  // Le contexte mobile a sa propre base : on recharge la démo.
  const page = await mobile.newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: "Charger les données de démonstration" }).click();
  await expect(page.getByText("Connexion rapide")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Adresse e-mail").fill(`awa.coulibaly@${D}`);
  await page.getByRole("textbox", { name: "Mot de passe" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/learner/);
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await page.getByRole("link", { name: "Mes demandes" }).click();
  await page.getByText("Comment évaluer le niveau de risque").click();
  await expect(page.getByLabel("Message", { exact: true })).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(392);
  await mobile.close();
});
