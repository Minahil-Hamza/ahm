"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Wifi, WifiOff } from "lucide-react";
import {
  getLastSyncedAt,
  getPendingCount,
  getSyncConfig,
} from "@/lib/sync/store";

function timeOfDay(iso: string): string {
  const date = new Date(iso);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** SPEC §5.1 item 6: "Everything has a 'last synced' indicator and a
 * visible offline/online badge. Offline is a normal state, not an error."
 * Online/offline here is the browser's own view; whether the server can
 * actually be reached is shown on the Sync screen this links to. Every
 * value is real: the last successful sync and the count of changes still
 * waiting on this device. */
export function OfflineBadge() {
  // Lazy initializer, not an effect: this is a plain read of the current
  // value, not a setState call, so there's nothing for the effect below to
  // race against on first render.
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const sync = useLiveQuery(async () => {
    const [config, lastSyncedAt, pending] = await Promise.all([
      getSyncConfig(),
      getLastSyncedAt(),
      getPendingCount(),
    ]);
    return { configured: config !== null, lastSyncedAt, pending };
  }, []);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  let detail = "Sync not set up";
  if (sync?.configured) {
    const synced = sync.lastSyncedAt
      ? `Synced ${timeOfDay(sync.lastSyncedAt)}`
      : "Not synced yet";
    detail = sync.pending > 0 ? `${synced} · ${sync.pending} waiting` : synced;
  }

  return (
    <Link
      href="/sync"
      className="inline-flex min-h-11 items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400"
    >
      {online ? (
        <Wifi size={16} aria-hidden="true" />
      ) : (
        <WifiOff size={16} aria-hidden="true" />
      )}
      {online ? "Online" : "Offline"}
      <span className="text-zinc-600 dark:text-zinc-400">· {detail}</span>
    </Link>
  );
}
