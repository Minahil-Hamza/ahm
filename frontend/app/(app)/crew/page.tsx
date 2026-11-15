"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, Eye, Lock } from "lucide-react";
import {
  canViewCrew,
  canWriteNotes,
  CREW_SORT_LABELS,
  filterAndSortCrew,
  type CrewOverviewRow,
  type CrewSort,
} from "@/lib/crew/overview";
import {
  addSurgeonNote,
  getCrewOverview,
  listAuditLog,
  listSurgeonNotes,
  MAX_NOTE_LENGTH,
  recordCrewView,
} from "@/lib/db/crewRepo";
import { ROLE_LABELS } from "@/lib/db/labels";
import { getAstronaut } from "@/lib/db/repo";
import { useActiveAstronautStore } from "@/lib/store/activeAstronaut";
import { getMissionDate } from "@/lib/time/missionDate";
import { useNow } from "@/lib/time/useNow";
import { BodyView } from "@/components/body3d/BodyView";
import { Sparkline } from "@/components/charts/Sparkline";
import { TrendsView } from "@/components/charts/TrendsView";
import { HomeDashboard } from "@/components/dashboard/HomeDashboard";
import { getStatusConfig, StatusBadge } from "@/components/status/StatusBadge";

const cardClass =
  "flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800";
const inputClass =
  "min-h-11 rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${getMissionDate(date)} ${hh}:${mm}`;
}

const SPARKLINES = [
  { key: "heart_rate", label: "Heart rate", unit: " bpm" },
  { key: "sleep_hours", label: "Sleep", unit: " h" },
  { key: "mood", label: "Mood", unit: "/5" },
] as const;

function CrewRow({
  row,
  onOpen,
}: {
  row: CrewOverviewRow;
  onOpen: () => void;
}) {
  return (
    <li className={cardClass}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">
            {row.name} · {row.crewCode}
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {ROLE_LABELS[row.role]}
          </p>
        </div>
        {row.overallStatus ? (
          <StatusBadge status={row.overallStatus} size="sm" />
        ) : (
          <span className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400">
            No check-in yet
          </span>
        )}
      </div>

      <p className="text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">
          Last check-in:{" "}
        </span>
        {row.lastCheckinDate ?? "None"}
        {row.overallStatus && row.statusDate && (
          <span className="text-zinc-600 dark:text-zinc-400">
            {" "}
            · status from {row.statusDate}
          </span>
        )}
      </p>

      {row.flags.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm" aria-label="Active flags">
          {row.flags.map((flag) => {
            const config = getStatusConfig(flag.status);
            return (
              <li key={flag.id} className="flex items-start gap-2">
                <config.icon
                  size={14}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0"
                  style={{ color: `var(${config.colorVar})` }}
                />
                <span>
                  <span className="font-medium">
                    {config.label} · {flag.id}
                  </span>
                  <span className="block text-zinc-600 dark:text-zinc-400">
                    {flag.message}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <dl className="grid grid-cols-3 gap-2 text-xs">
        {SPARKLINES.map(({ key, label, unit }) => {
          const values = row.sparklines[key];
          const last = values[values.length - 1];
          return (
            <div key={key} className="flex flex-col gap-1">
              <dt className="text-zinc-600 dark:text-zinc-400">{label}</dt>
              <dd className="flex flex-col gap-1">
                <span className="text-sm font-medium">
                  {last !== undefined ? `${last}${unit}` : "No data"}
                </span>
                {values.length >= 2 ? (
                  <Sparkline values={values} colorVar="--foreground" />
                ) : (
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {values.length === 1 ? "1 day so far" : ""}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${row.name} · ${row.crewCode} (read-only)`}
        className="flex min-h-11 items-center justify-center gap-2 self-start rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
      >
        <Eye size={16} aria-hidden="true" />
        Open (read-only)
      </button>
    </li>
  );
}

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "trends", label: "Trends" },
  { id: "body", label: "Body" },
  { id: "notes", label: "Notes" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function NotesPanel({
  viewerId,
  astronautId,
  canWrite,
}: {
  viewerId: string;
  astronautId: string;
  canWrite: boolean;
}) {
  const notes = useLiveQuery(
    () => listSurgeonNotes(viewerId, astronautId),
    [viewerId, astronautId],
  );
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await addSurgeonNote(viewerId, astronautId, text);
      setText("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-6 py-8">
      <h2 className="text-xl font-semibold">Surgeon notes</h2>

      {canWrite ? (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="surgeon-note">
            New note
          </label>
          <textarea
            id="surgeon-note"
            rows={4}
            maxLength={MAX_NOTE_LENGTH}
            className={`${inputClass} w-full`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {text.length} of {MAX_NOTE_LENGTH} characters. A saved note cannot
            be changed or deleted.
          </p>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || text.trim() === ""}
            className="min-h-11 self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Save note
          </button>
        </div>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Only the flight surgeon can add notes. You can read them.
        </p>
      )}

      {notes && notes.length === 0 && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No notes yet for this astronaut.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {(notes ?? []).map((note) => (
          <li key={note.id} className={cardClass}>
            <p className="text-sm whitespace-pre-wrap">{note.text}</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              {note.authorName} · {note.authorCrewCode} ·{" "}
              {formatWhen(note.createdAt)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * SPEC §8.3 screens 0 and 10: crew overview for commander / surgeon
 * (and admin), with a read-only drill-down into one astronaut.
 *
 * Access is decided twice: this screen refuses to render for the
 * astronaut role, and every data function it calls checks the viewer's
 * role again. The drill-down reuses the normal dashboard, trends and body
 * screens with `readOnly`, so nothing in it can change health data.
 */
export default function CrewOverviewPage() {
  const viewerId = useActiveAstronautStore((s) => s.activeAstronautId);
  const viewer = useLiveQuery(
    () => (viewerId ? getAstronaut(viewerId) : undefined),
    [viewerId],
  );
  const allowed = canViewCrew(viewer?.role);
  const today = getMissionDate(useNow());

  const rows = useLiveQuery(
    () => (viewerId && allowed ? getCrewOverview(viewerId, today) : undefined),
    [viewerId, allowed, today],
  );
  const audit = useLiveQuery(
    () => (viewerId && allowed ? listAuditLog(viewerId, 20) : undefined),
    [viewerId, allowed],
  );

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CrewSort>("status");
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("dashboard");

  // One audit entry each time an astronaut's data is opened. The ref
  // stops a repeated effect run (React strict mode, a role re-read) from
  // logging the same opening twice; closing the drill-down clears it.
  const loggedOpen = useRef<string | null>(null);
  useEffect(() => {
    if (!openId) {
      loggedOpen.current = null;
      return;
    }
    if (!viewerId || !allowed) return;
    const key = `${viewerId}:${openId}`;
    if (loggedOpen.current === key) return;
    loggedOpen.current = key;
    void recordCrewView(viewerId, openId);
  }, [viewerId, allowed, openId]);

  if (!viewerId || !viewer) return null;

  if (!allowed) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 px-6 py-12 text-center">
        <Lock size={24} aria-hidden="true" />
        <h1 className="text-xl font-semibold">Crew overview</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          This screen is for the commander and the flight surgeon. You can see
          your own data on Home, Trends and Body.
        </p>
      </div>
    );
  }

  const open = rows?.find((row) => row.id === openId);

  if (openId && open) {
    return (
      <div className="flex flex-col">
        <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-zinc-200 bg-background px-4 py-3 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setOpenId(null);
                setTab("dashboard");
              }}
              className="flex min-h-11 items-center gap-1 text-sm"
            >
              <ChevronLeft size={16} aria-hidden="true" />
              Crew
            </button>
            <p className="flex items-center gap-2 text-sm font-medium">
              <Eye size={16} aria-hidden="true" />
              Read-only: {open.name} · {open.crewCode}
            </p>
          </div>
          <div
            className="flex gap-2"
            role="tablist"
            aria-label="Astronaut data"
          >
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={`min-h-11 flex-1 rounded-md border px-2 text-sm ${
                  tab === item.id
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-300 dark:border-zinc-700"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {tab === "dashboard" && <HomeDashboard astronautId={openId} readOnly />}
        {tab === "trends" && <TrendsView astronautId={openId} readOnly />}
        {tab === "body" && <BodyView astronautId={openId} readOnly />}
        {tab === "notes" && (
          <NotesPanel
            viewerId={viewerId}
            astronautId={openId}
            canWrite={canWriteNotes(viewer.role)}
          />
        )}
      </div>
    );
  }

  const visible = filterAndSortCrew(rows ?? [], query, sort);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-xl font-semibold">Crew overview</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Every astronaut on this device. Health data here is read-only.
          Astronauts registered on other devices appear after a sync.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-40 flex-1 flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="crew-search">
            Search by name or crew ID
          </label>
          <input
            id="crew-search"
            type="search"
            autoComplete="off"
            className={inputClass}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="crew-sort">
            Sort by
          </label>
          <select
            id="crew-sort"
            className={inputClass}
            value={sort}
            onChange={(e) => setSort(e.target.value as CrewSort)}
          >
            {(Object.keys(CREW_SORT_LABELS) as CrewSort[]).map((value) => (
              <option key={value} value={value}>
                {CREW_SORT_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {rows !== undefined && visible.length === 0 && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {rows.length === 0
            ? "No astronauts are registered on this device."
            : "No astronaut matches that search."}
        </p>
      )}

      <ul className="flex flex-col gap-4">
        {visible.map((row) => (
          <CrewRow key={row.id} row={row} onOpen={() => setOpenId(row.id)} />
        ))}
      </ul>

      <section aria-labelledby="crew-audit" className={cardClass}>
        <h2 id="crew-audit" className="font-medium">
          Access log
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Who opened whose data on this device. Entries cannot be removed.
        </p>
        {audit && audit.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Nobody has opened another astronaut&apos;s data yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {(audit ?? []).map((entry) => (
              <li key={entry.id}>
                <span className="font-medium">
                  {entry.viewerName} · {entry.viewerCrewCode}
                </span>{" "}
                ({ROLE_LABELS[entry.viewerRole]}) opened{" "}
                <span className="font-medium">
                  {entry.astronautName} · {entry.astronautCrewCode}
                </span>
                <span className="block text-xs text-zinc-600 dark:text-zinc-400">
                  {formatWhen(entry.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
