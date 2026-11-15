"use client";

import { useEffect, type ReactNode } from "react";
import { ActiveAstronautBar } from "@/components/crew/ActiveAstronautBar";
import { BottomNav } from "@/components/common/BottomNav";
import { ReminderBanner } from "@/components/common/ReminderBanner";
import { CrewScreen } from "@/components/crew/CrewScreen";
import { useReminderScheduler } from "@/lib/notifications/useReminderScheduler";
import { useActiveAstronautStore } from "@/lib/store/activeAstronaut";
import { useAutoLock } from "@/lib/store/useAutoLock";
import { useOfflineRouteWarmup } from "@/lib/pwa/useOfflineRouteWarmup";
import { startSync, stopSync } from "@/lib/sync/controller";

/** SPEC §8.3 screen 0 is "the first screen of the app" — whenever no
 * astronaut is unlocked, every route under (app) falls back to the Crew
 * screen instead of its own content, regardless of which URL was hit. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const activeAstronautId = useActiveAstronautStore((s) => s.activeAstronautId);
  useAutoLock(activeAstronautId !== null);
  // SPEC §9: runs on every screen, locked or not, so a reminder still
  // fires after the app auto-locks (see docs/DECISIONS.md).
  useReminderScheduler();
  // Rule 1 (offline-first): stores every screen for offline use on the
  // first online visit, locked or not. Background only.
  useOfflineRouteWarmup();
  // SPEC 7.4: background sync. Optional and non-blocking: with no server
  // set up, or no link, it does nothing and the app is unaffected. It
  // also runs while the app is locked, like the reminder scheduler.
  useEffect(() => {
    startSync();
    return () => stopSync();
  }, []);

  if (!activeAstronautId) {
    return (
      <>
        <ReminderBanner />
        <CrewScreen />
      </>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <ActiveAstronautBar />
      <ReminderBanner />
      <main className="flex-1 pb-16">{children}</main>
      <BottomNav />
    </div>
  );
}
