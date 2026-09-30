import { defineConfig, devices } from "@playwright/test";

// E2E contra o stack local: Supabase (supabase start + functions serve com o
// stub de e-mail configurado) e o build estático servido como no GitHub Pages.
// Os fusos dos navegadores são diferentes de America/Sao_Paulo de propósito:
// a agenda da loja não pode depender do relógio do cliente.
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    locale: "pt-BR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], timezoneId: "America/New_York" } },
    { name: "mobile", use: { ...devices["Pixel 7"], timezoneId: "Asia/Tokyo" }, testMatch: /(store|checkout|admin-mobile)\.spec\.ts/ },
  ],
  webServer: [
    {
      command: "npm run build && node tests/stubs/pages-server.mjs",
      url: "http://127.0.0.1:4173/",
      env: { VITE_SITE_URL: "http://127.0.0.1:4173", VITE_BASE_PATH: "/" },
      reuseExistingServer: !CI,
      timeout: 180_000,
    },
    {
      command: "node tests/stubs/email-stub.mjs",
      url: "http://127.0.0.1:54401/__emails",
      reuseExistingServer: true,
    },
  ],
});
