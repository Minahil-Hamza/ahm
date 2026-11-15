"use client";

import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, RefreshCw, Upload } from "lucide-react";
import { getAstronaut, listAstronauts } from "@/lib/db/repo";
import { canReachBackend } from "@/lib/sync/api";
import { syncNow, useSyncStatusStore } from "@/lib/sync/controller";
import {
  buildExport,
  ImportError,
  importExport,
  parseExport,
  toCsv,
  type ImportResult,
} from "@/lib/sync/exportImport";
import {
  clearSyncConfig,
  clearSyncIssues,
  getLastSyncedAt,
  getPendingCount,
  getSyncConfig,
  listConflicts,
  listSyncIssues,
  saveSyncConfig,
} from "@/lib/sync/store";
import { useActiveAstronautStore } from "@/lib/store/activeAstronaut";
import { getMissionDate } from "@/lib/time/missionDate";

const cardClass =
  "flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800";
const inputClass =
  "min-h-11 w-full rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900";
const labelClass = "text-sm font-medium text-zinc-700 dark:text-zinc-300";
const primaryButton =
  "flex min-h-11 items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900";
const secondaryButton =
  "flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700";

const ENTITY_LABELS: Record<string, string> = {
  astronaut: "Astronaut profile",
  daily_log: "Check-in",
  symptom_entry: "Symptom",
  evaluation: "Result",
  advice_followup: "Action follow-up",
  reminder: "Reminder",
  surgeon_note: "Surgeon note",
  audit_entry: "Access log entry",
};

const CONFLICT_REASONS: Record<string, string> = {
  version: "changed on two devices; the newer version is in use",
  same_date: "another check-in for the same date was already on the server",
  parent_missing: "belonged to a check-in that was replaced",
};

function formatWhen(iso: string | undefined): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Never";
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${getMissionDate(date)} ${hh}:${mm}`;
}

function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * SPEC §8.3 screen 9: "Sync / Data: status, last sync time, pending
 * count, Sync now, export JSON/CSV (works offline), import."
 *
 * Sync is optional. With no server set up, or no link, the app works
 * exactly the same; changes simply wait on this device.
 */
export default function SyncPage() {
  const activeAstronautId = useActiveAstronautStore((s) => s.activeAstronautId);
  const astronaut = useLiveQuery(
    () => (activeAstronautId ? getAstronaut(activeAstronautId) : undefined),
    [activeAstronautId],
  );
  const config = useLiveQuery(async () => (await getSyncConfig()) ?? null, []);
  const pending = useLiveQuery(() => getPendingCount(), []);
  const lastSyncedAt = useLiveQuery(
    async () => (await getLastSyncedAt()) ?? null,
    [],
  );
  const issues = useLiveQuery(() => listSyncIssues(), []);
  const seesEveryone =
    astronaut !== undefined && astronaut.role !== "astronaut";
  const conflicts = useLiveQuery(
    () =>
      astronaut
        ? listConflicts(seesEveryone ? undefined : astronaut.id)
        : undefined,
    [astronaut?.id, seesEveryone],
  );
  const phase = useSyncStatusStore((s) => s.phase);
  const lastOutcome = useSyncStatusStore((s) => s.lastOutcome);
  const lastMessage = useSyncStatusStore((s) => s.lastMessage);
  const nextAttemptAt = useSyncStatusStore((s) => s.nextAttemptAt);

  const [serverUrl, setServerUrl] = useState("");
  const [syncKey, setSyncKey] = useState("");
  const [editing, setEditing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!activeAstronautId || !astronaut || config === undefined) return null;

  const showForm = config === null || editing;
  const syncing = phase === "syncing";

  async function scopeIds(): Promise<string[]> {
    if (!astronaut) return [];
    if (!seesEveryone) return [astronaut.id];
    return (await listAstronauts()).map((a) => a.id);
  }

  async function saveConfig() {
    setFormError(null);
    setTestResult(null);
    try {
      await saveSyncConfig(serverUrl, syncKey);
      setEditing(false);
      setSyncKey("");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not save the settings.",
      );
    }
  }

  async function testConnection() {
    setTestResult("Checking...");
    const current = await getSyncConfig();
    if (!current) return;
    const ok = await canReachBackend(current.serverUrl);
    setTestResult(
      ok
        ? "The server answered."
        : "No answer from the server. Check the address and that this device is on the same network.",
    );
  }

  async function exportFile(kind: "json" | "csv") {
    setDataMessage(null);
    setImportResult(null);
    try {
      const data = await buildExport(await scopeIds());
      const stamp = getMissionDate();
      const who = seesEveryone ? "crew" : astronaut?.crewCode;
      if (kind === "json") {
        download(
          `ahm-${who}-${stamp}.json`,
          JSON.stringify(data, null, 2),
          "application/json",
        );
      } else {
        download(`ahm-${who}-${stamp}.csv`, toCsv(data), "text/csv");
      }
      setDataMessage(
        data.logs.length === 0
          ? "Exported. There are no check-ins yet, so the file has no check-in rows."
          : `Exported ${data.logs.length} check-ins.`,
      );
    } catch {
      setDataMessage("Could not create the file. Please try again.");
    }
  }

  async function importFile(file: File | undefined) {
    setDataMessage(null);
    setImportResult(null);
    if (!file) return;
    try {
      const data = parseExport(await file.text());
      setImportResult(await importExport(data, await scopeIds()));
    } catch (error) {
      setDataMessage(
        error instanceof ImportError
          ? error.message
          : "Could not read that file.",
      );
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-xl font-semibold">Sync and data</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Everything is saved on this device first. Sync copies it to a server
          when one can be reached, and brings in what other devices saved.
        </p>
      </div>

      <section aria-labelledby="sync-status" className={cardClass}>
        <h2 id="sync-status" className="font-medium">
          Status
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-zinc-600 dark:text-zinc-400">Server</dt>
          <dd className="break-all">
            {config ? config.serverUrl : "Not set up"}
          </dd>
          <dt className="text-zinc-600 dark:text-zinc-400">Last synced</dt>
          <dd>{formatWhen(lastSyncedAt ?? undefined)}</dd>
          <dt className="text-zinc-600 dark:text-zinc-400">Waiting to sync</dt>
          <dd>
            {/* SPEC §16 empty state: "Nothing to sync". */}
            {pending
              ? `${pending} ${pending === 1 ? "change" : "changes"}`
              : "Nothing to sync"}
          </dd>
        </dl>
        {config && (
          <>
            <p role="status" className="text-sm">
              {syncing
                ? "Syncing..."
                : (lastMessage ?? "Sync has not run yet in this session.")}
              {!syncing &&
                lastOutcome !== "ok" &&
                nextAttemptAt &&
                ` Next try at ${formatWhen(nextAttemptAt).slice(11)}.`}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void syncNow()}
                disabled={syncing}
                className={primaryButton}
              >
                <RefreshCw size={16} aria-hidden="true" />
                Sync now
              </button>
              <button
                type="button"
                onClick={() => void testConnection()}
                className={secondaryButton}
              >
                Test connection
              </button>
            </div>
            {testResult && (
              <p role="status" className="text-sm">
                {testResult}
              </p>
            )}
          </>
        )}
        {!config && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Sync is optional. Without it, your data stays on this device and the
            app works the same.
          </p>
        )}
      </section>

      <section aria-labelledby="sync-server" className={cardClass}>
        <h2 id="sync-server" className="font-medium">
          Server
        </h2>
        {showForm ? (
          <>
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="sync-url">
                Server address
              </label>
              <input
                id="sync-url"
                inputMode="url"
                autoComplete="off"
                placeholder="http://192.168.1.10:8000"
                className={inputClass}
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="sync-key">
                Sync key
              </label>
              <input
                id="sync-key"
                type="password"
                autoComplete="off"
                className={inputClass}
                value={syncKey}
                onChange={(e) => setSyncKey(e.target.value)}
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                The key set on the server. Anyone with it can read and change
                every astronaut&apos;s records, so only enter it on a trusted
                device.
              </p>
            </div>
            {formError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {formError}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void saveConfig()}
                className={primaryButton}
              >
                Save
              </button>
              {config && (
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className={secondaryButton}
                >
                  Cancel
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setServerUrl(config?.serverUrl ?? "");
                setSyncKey("");
                setEditing(true);
              }}
              className={secondaryButton}
            >
              Change server
            </button>
            <button
              type="button"
              onClick={() => void clearSyncConfig()}
              className={secondaryButton}
            >
              Turn sync off
            </button>
          </div>
        )}
      </section>

      {conflicts && conflicts.length > 0 && (
        <section aria-labelledby="sync-conflicts" className={cardClass}>
          <h2 id="sync-conflicts" className="font-medium">
            Kept copies ({conflicts.length})
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            These records differed between devices. Nothing was lost: the
            version not in use is kept here and is included in exports.
          </p>
          <ul className="flex flex-col gap-2 text-sm">
            {conflicts.slice(0, 20).map((conflict) => {
              const data = conflict.data as { date?: string } | null;
              return (
                <li
                  key={conflict.id}
                  className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800"
                >
                  <span className="font-medium">
                    {ENTITY_LABELS[conflict.entity] ?? conflict.entity}
                    {data?.date ? ` · ${data.date}` : ""}
                  </span>
                  <span className="block text-zinc-600 dark:text-zinc-400">
                    {CONFLICT_REASONS[conflict.kind]} · kept{" "}
                    {formatWhen(conflict.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {issues && issues.length > 0 && (
        <section aria-labelledby="sync-issues" className={cardClass}>
          <h2 id="sync-issues" className="font-medium">
            Not accepted by the server ({issues.length})
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            These records are still on this device. The server refused them for
            the reason shown.
          </p>
          <ul className="flex flex-col gap-2 text-sm">
            {issues.slice(0, 20).map((issue) => (
              <li
                key={`${issue.id}-${issue.at}`}
                className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800"
              >
                <span className="font-medium">
                  {ENTITY_LABELS[issue.entity] ?? issue.entity}
                </span>
                <span className="block text-zinc-600 dark:text-zinc-400">
                  {issue.reason} · {formatWhen(issue.at)}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void clearSyncIssues()}
            className={`${secondaryButton} self-start`}
          >
            Clear this list
          </button>
        </section>
      )}

      <section aria-labelledby="sync-data" className={cardClass}>
        <h2 id="sync-data" className="font-medium">
          Export and import
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Works with no connection.{" "}
          {seesEveryone
            ? "Includes every astronaut on this device."
            : `Includes only the data of ${astronaut.name} · ${astronaut.crewCode}.`}{" "}
          PINs are never exported.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void exportFile("json")}
            className={secondaryButton}
          >
            <Download size={16} aria-hidden="true" />
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => void exportFile("csv")}
            className={secondaryButton}
          >
            <Download size={16} aria-hidden="true" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className={secondaryButton}
          >
            <Upload size={16} aria-hidden="true" />
            Import JSON
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Choose an export file to import"
            onChange={(e) => void importFile(e.target.files?.[0])}
          />
        </div>
        {dataMessage && (
          <p role="status" className="text-sm">
            {dataMessage}
          </p>
        )}
        {importResult && (
          <div role="status" className="text-sm">
            <p>
              Imported {importResult.imported} records. {importResult.unchanged}{" "}
              were already here.
              {importResult.skipped.length > 0 &&
                ` ${importResult.skipped.length} were not imported:`}
            </p>
            {importResult.skipped.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-zinc-600 dark:text-zinc-400">
                {importResult.skipped.slice(0, 10).map((item, index) => (
                  <li key={`${item.what}-${index}`}>
                    {item.what}: {item.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
