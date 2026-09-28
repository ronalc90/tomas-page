import { defineConfig, devices } from "@playwright/test";

/** Pruebas de la versión sin servidor que se publica en GitHub Pages. */
const PORT = Number(process.env.PAGES_PORT ?? 4300);

export default defineConfig({
  testDir: "e2e-pages",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never", outputFolder: "playwright-report-pages" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}/tomas-page/`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "pages", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    cwd: "apps/web",
    url: `http://localhost:${PORT}/tomas-page/`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { VITE_BASE: "/tomas-page/", VITE_DATA_MODE: "local" },
  },
});
