"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { APP_ROUTES } from "./appRoutes";

/**
 * Offline-first (CLAUDE.md rule 1): makes every screen reachable with the
 * network off, starting from the very first online visit.
 *
 * Moving between screens needs each route's small prefetch payload. Next
 * only fetches those for links that are on screen, so a fresh install that
 * went offline before unlocking (no navigation links yet) could open the
 * start screen but nothing else. This asks for every route once the
 * service worker controls the page; the worker stores the answers (rule
 * "ahm-route-prefetch" in `next.config.ts`) and serves them when offline.
 *
 * Background only: it never blocks the UI, does nothing in development
 * (no service worker there) and failures are ignored (already offline).
 */
/** Wait before the first request, then between routes (about 3 seconds
 * for the whole app). */
const START_DELAY_MS = 500;
const STEP_MS = 100;

export function useOfflineRouteWarmup(): void {
  const router = useRouter();
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const container = navigator.serviceWorker;
    let started = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const warm = () => {
      // Only requests that pass through the worker get stored.
      if (started || !container.controller) return;
      started = true;
      // One route at a time with a pause in between, so this never shows
      // up as a long task while the first screen is becoming usable.
      let index = 0;
      const next = () => {
        if (index >= APP_ROUTES.length) return;
        router.prefetch(APP_ROUTES[index]);
        index += 1;
        timer = setTimeout(next, STEP_MS);
      };
      timer = setTimeout(next, START_DELAY_MS);
    };
    warm();
    container.addEventListener("controllerchange", warm);
    return () => {
      container.removeEventListener("controllerchange", warm);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [router]);
}
