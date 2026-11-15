import { defineConfig, devices } from "@playwright/test";

// Offline / PWA test (SPEC §14 "Offline"). The service worker only exists
// in a production build, so this config runs `npm run start` (build first:
// `npm run build`) plus a throwaway backend for the "outbox drains" half.
// Run with: npm run test:e2e:offline

if (process.platform === "win32") {
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= "E:/ms-playwright";
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /offline\.pwa\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 180_000,
  use: {
    baseURL: "http://localhost:3100",
    serviceWorkers: "allow",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run start",
      url: "http://localhost:3100",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "node tests/e2e/start-backend.mjs",
      url: "http://127.0.0.1:8765/api/v1/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
