import { expect, test } from "@playwright/test";
import {
  acceptConsentIfShown,
  completeCheckin,
  enterPin,
  expectUnlocked,
  navTo,
  openFromMore,
  registerAndUnlock,
  type TestAstronaut,
} from "./helpers";
import { APP_ROUTES } from "../../lib/pwa/appRoutes";

// SPEC §14 "Offline" + C16: go offline, register, check in, reload, data
// persists, go online, the outbox drains, and the server holds each record
// exactly once. Runs against `npm run start` (service worker active) and a
// throwaway backend: see playwright.offline.config.ts.

const BACKEND = "http://127.0.0.1:8765";
const SYNC_KEY = "e2e-only-sync-key-not-a-secret";
const ASTRONAUT: TestAstronaut = {
  name: "Offline Tester",
  crewCode: "E2E-OFF-1",
  role: "astronaut",
  pin: "4826",
};

async function serverCount(
  request: import("@playwright/test").APIRequestContext,
  entity: string,
): Promise<number> {
  const response = await request.get(`${BACKEND}/api/v1/sync/pull`, {
    headers: { "X-Sync-Key": SYNC_KEY },
  });
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    changes: Record<string, { deleted: boolean }[]>;
  };
  return (body.changes[entity] ?? []).filter((c) => !c.deleted).length;
}

test("works offline end to end, then syncs exactly once", async ({
  page,
  context,
  request,
}) => {
  // 1. First visit online: the service worker installs and precaches.
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  // Still step 1: the app stores every screen for offline use in the
  // background once the worker is in control (two small payloads per
  // route). Wait until all of them are stored before cutting the network.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const cache = await caches.open("ahm-route-prefetch");
          return (await cache.keys()).length;
        }),
      { timeout: 60_000 },
    )
    .toBeGreaterThanOrEqual(APP_ROUTES.length * 2);
  expect(await serverCount(request, "astronaut")).toBe(0);

  // 2. Network off for everything below until step 6.
  await context.setOffline(true);
  await page.reload(); // served by the service worker
  await acceptConsentIfShown(page);
  await expect(page.getByText("No astronauts registered yet")).toBeVisible();

  // 3. Register and check in, offline.
  await registerAndUnlock(page, ASTRONAUT);
  await completeCheckin(page, "72");
  await navTo(page, "Home");
  await expect(page.getByText("72 bpm", { exact: true }).first()).toBeVisible();

  // 4. Reload offline: the app shell comes from the cache, data from
  // IndexedDB. Unlock again (reload locks the app by design).
  await page.reload();
  await page
    .getByRole("button", { name: new RegExp(ASTRONAUT.crewCode) })
    .click();
  await enterPin(page, ASTRONAUT.pin);
  await expectUnlocked(page, ASTRONAUT);
  await expect(page.getByText("72 bpm", { exact: true }).first()).toBeVisible();

  // 5. Point the device at the server (saved locally, still offline).
  await openFromMore(page, "Sync and data");
  await page.getByLabel("Server address").fill(BACKEND);
  await page.getByLabel("Sync key").fill(SYNC_KEY);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const pending = page
    .getByRole("definition")
    .filter({ hasText: /^(\d+ changes?|Nothing to sync)$/ });
  await expect(pending).toHaveText(/^\d+ changes?$/);
  expect(await serverCount(request, "daily_log")).toBe(0);

  // 6. Network back: the outbox drains on its own ("online" event).
  await context.setOffline(false);
  await expect(pending).toHaveText("Nothing to sync", { timeout: 60_000 });
  expect(await serverCount(request, "astronaut")).toBe(1);
  expect(await serverCount(request, "daily_log")).toBe(1);
  expect(await serverCount(request, "evaluation")).toBe(1);

  // 7. Syncing again sends nothing twice.
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByRole("button", { name: "Sync now" })).toBeEnabled();
  expect(await serverCount(request, "astronaut")).toBe(1);
  expect(await serverCount(request, "daily_log")).toBe(1);
});
