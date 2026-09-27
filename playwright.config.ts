import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3300);
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/tomas_e2e";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "movil", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/, dependencies: ["escritorio"] },
  ],
  webServer: {
    command: "node e2e/reset-db.mjs && node apps/api/dist/server.js",
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: "development",
      PORT: String(PORT),
      DATABASE_URL,
      AUTO_MIGRATE: "true",
      FAKE_TODAY: "2026-10-07",
      LOG_LEVEL: "warn",
      LOGIN_RATE_LIMIT: "1000",
      SEED_ADMIN_PASSWORD: "admin-e2e-password",
      SEED_STUDENT_PASSWORD: "1234",
    },
  },
});
