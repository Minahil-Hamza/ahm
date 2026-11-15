import { ROLE_LABELS } from "@/lib/db/labels";
import type { Astronaut } from "@/lib/db/schema";

/** SPEC §8.3 screen 0: "name, crew ID, role, last check-in date and latest
 * overall status (...; 'No check-in yet' if none)". The card shows the
 * real last check-in date. It deliberately does NOT show the health
 * status: this card is visible to anyone before a PIN is entered, and an
 * astronaut's status is their own data (see docs/DECISIONS.md). The
 * status is on the Crew overview for commander/surgeon. */
export function CrewCard({
  astronaut,
  lastCheckinDate,
  onSelect,
}: {
  astronaut: Astronaut;
  lastCheckinDate?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(astronaut.id)}
      className="flex min-h-11 w-full flex-col gap-1 rounded-lg border border-zinc-300 p-4 text-left hover:border-zinc-500 dark:border-zinc-700 dark:hover:border-zinc-500"
    >
      <span className="font-semibold">
        {astronaut.name} · {astronaut.crewCode}
      </span>
      <span className="text-sm text-zinc-600 dark:text-zinc-400">
        {ROLE_LABELS[astronaut.role]}
      </span>
      <span className="text-sm text-zinc-600 dark:text-zinc-400">
        {lastCheckinDate
          ? `Last check-in: ${lastCheckinDate}`
          : "No check-in yet"}
      </span>
    </button>
  );
}
