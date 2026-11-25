import { defineConfig } from "@playwright/test";

/** E2E du site : le serveur est lancé sur une base jetable (créée par global-setup) avec deux noms d'hôte simulés. */
try {
  process.loadEnvFile(new URL(".env.local", import.meta.url));
} catch {
  /* variables déjà dans l'environnement */
}

export const E2E_DB = "site_e2e";
export const E2E_AUTH_SECRET = "e2e-secret-e2e-secret-e2e-secret-e2e-1234567890";
export const SITE_HOST = "http://site.localtest.me:3601";
export const ADMIN_HOST = "http://admin.localtest.me:3601";
export const INSTANCE_PORTS = { acme: 3721, beta: 3722 } as const;
const adminUrl = process.env.SITE_TEST_DATABASE_URL ?? "";
const dbUrl = adminUrl.replace(/\/[^/]*$/, `/${E2E_DB}`);

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://127.0.0.1:3601",
    // *.localtest.me → 127.0.0.1 sans DNS (les deux noms d'hôte du site sont simulés dans le navigateur).
    launchOptions: { args: ["--host-resolver-rules=MAP *.localtest.me 127.0.0.1"] },
  },
  webServer: {
    command: "sh -c \"rm -rf .next/standalone/.next/cache && mkdir -p .next/standalone/.next && cp -R .next/static .next/standalone/.next/ && PORT=3601 HOSTNAME=127.0.0.1 node .next/standalone/server.js\"",
    port: 3601,
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      DATABASE_URL: dbUrl,
      SITE_URL: "http://site.localtest.me:3601",
      ADMIN_HOST: "admin.localtest.me:3601",
      INSTANCE_DOMAIN: "localtest.me",
      AUTH_SECRET: E2E_AUTH_SECRET,
      // Les adresses https://acme.localtest.me restent validées ; seule la destination réseau est redirigée vers les instances locales.
      INSTANCE_CONNECT_OVERRIDES: JSON.stringify({
        "acme.localtest.me": `http://127.0.0.1:${INSTANCE_PORTS.acme}`,
        "beta.localtest.me": `http://127.0.0.1:${INSTANCE_PORTS.beta}`,
      }),
      MASTER_KEY: Buffer.alloc(32, 7).toString("base64"),
      MONITORING: "off",
    },
  },
});
