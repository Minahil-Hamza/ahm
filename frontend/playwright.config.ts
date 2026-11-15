import { defineConfig, devices } from "@playwright/test";

// This machine's C: drive runs critically low on space, and Playwright's
// default browser cache lives under %LOCALAPPDATA% (on C:) regardless of
// where the project itself is checked out. Redirect it to sit next to the
// project instead so installs don't fail with ENOSPC. (Windows only: on
// Linux/WSL and CI the default cache under ~/.cache is used.)
if (process.platform === "win32") {
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= "E:/ms-playwright";
}

export default defineConfig({
  testDir: "./tests/e2e",
  // The offline/PWA test needs a production build: playwright.offline.config.ts.
  testIgnore: /offline\.pwa\.spec\.ts$/,
  timeout: 120_000,
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
