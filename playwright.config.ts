import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", screenshot: "only-on-failure", locale: "fr-FR", timezoneId: "Africa/Abidjan" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "npx next start -p 3100", url: "http://localhost:3100/login", reuseExistingServer: true, timeout: 120_000, env: { NEXT_PUBLIC_DEMO_MODE: "true" } },
});
