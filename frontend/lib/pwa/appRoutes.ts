import { LEARN_TOPICS } from "@/config/learn";

/**
 * Every screen of the app, as a URL path. All of them are static pages.
 * Used to make each one available offline right after the first online
 * visit (see `useOfflineRouteWarmup` and `next.config.ts`). Add a new
 * screen here when one is added under `app/(app)/`; the test in
 * `tests/pwa/appRoutes.test.ts` fails if a page folder is missing.
 */
export const APP_ROUTES: readonly string[] = [
  "/",
  "/checkin",
  "/body",
  "/trends",
  "/settings",
  "/crew",
  "/environment",
  "/learn",
  "/learn/risks",
  ...LEARN_TOPICS.map((topic) => `/learn/${topic.slug}`),
  "/reminders",
  "/rewards",
  "/sync",
];
