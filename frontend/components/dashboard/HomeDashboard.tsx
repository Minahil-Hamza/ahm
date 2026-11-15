"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import type { EvaluationResult, IndicatorResult } from "@/lib/rules/types";
import {
  getAstronaut,
  getCompletedActionIds,
  getLatestEvaluation,
  getLatestLog,
  getLogForDate,
  getRecentLogs,
  setActionCompleted,
} from "@/lib/db/repo";
import { getGameSummary } from "@/lib/db/gameRepo";
import { getReminderSetupState, listReminders } from "@/lib/db/reminderRepo";
import type { DailyLog } from "@/lib/db/schema";
import {
  formatTimeOfDay,
  getMissedCheckinDueAt,
} from "@/lib/notifications/scheduler";
import { evaluateMissedCheckin } from "@/lib/rules/trends";
import { useNow } from "@/lib/time/useNow";
import { computeCompletenessScore } from "@/lib/db/completeness";
import { ENVIRONMENT_LABELS } from "@/lib/db/labels";
import { getMissionDate, getMissionDay } from "@/lib/time/missionDate";
import { ActionList } from "@/components/guidance/ActionList";
import { EscalationCard } from "@/components/guidance/EscalationCard";
import { IndicatorCard } from "@/components/status/IndicatorCard";
import { StatusRing } from "@/components/status/StatusRing";
import { OfflineBadge } from "@/components/common/OfflineBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ProgressRing } from "@/components/game/ProgressRing";
import { getStatusConfig } from "@/components/status/StatusBadge";

interface CardDef {
  id: string;
  label: string;
  unit: string;
  indicatorId: string;
  getValue: (log: DailyLog) => number | undefined;
}

// 8 cards (SPEC §8.3 screen 1: "6 to 8 indicator cards"). Blood pressure
// shows systolic for the status/value/sparkline — the worse-of-two
// semantics live in the rule engine's own overall-status reduction, not
// needed again here just to pick a card colour.
const CARDS: CardDef[] = [
  {
    id: "heart_rate",
    label: "Heart rate",
    unit: " bpm",
    indicatorId: "heart_rate",
    getValue: (l) => l.heart_rate,
  },
  {
    id: "bp_systolic",
    label: "Blood pressure",
    unit: " mmHg",
    indicatorId: "bp_systolic",
    getValue: (l) => l.bp_systolic,
  },
  {
    id: "spo2",
    label: "SpO2",
    unit: "%",
    indicatorId: "spo2",
    getValue: (l) => l.spo2,
  },
  {
    id: "temperature_c",
    label: "Temperature",
    unit: "°C",
    indicatorId: "temperature_c",
    getValue: (l) => l.temperature_c,
  },
  {
    id: "glucose_mgdl",
    label: "Glucose",
    unit: " mg/dL",
    indicatorId: "glucose_mgdl",
    getValue: (l) => l.glucose_mgdl,
  },
  {
    id: "sleep_hours",
    label: "Sleep",
    unit: "h",
    indicatorId: "sleep_hours",
    getValue: (l) => l.sleep_hours,
  },
  {
    id: "mood",
    label: "Mood",
    unit: "/5",
    indicatorId: "mood",
    getValue: (l) => l.mood,
  },
  {
    id: "exercise_minutes",
    label: "Exercise",
    unit: " min",
    indicatorId: "exercise_minutes",
    getValue: (l) =>
      l.exercise_resistance_min === undefined &&
      l.exercise_cardio_min === undefined
        ? undefined
        : (l.exercise_resistance_min ?? 0) + (l.exercise_cardio_min ?? 0),
  },
];

function findIndicator(
  indicators: IndicatorResult[] | undefined,
  id: string,
): IndicatorResult | undefined {
  return indicators?.find((i) => i.id === id);
}

export interface AstronautViewProps {
  /** Whose data to show. Every query below is scoped to this id. */
  astronautId: string;
  /** Commander/surgeon drill-down (C15): the same screen with every
   * control that could change data removed. */
  readOnly?: boolean;
}

/** SPEC §8.3 screen 1, for one astronaut. Used by the Home page (the
 * active astronaut) and by the read-only crew drill-down. */
export function HomeDashboard({
  astronautId,
  readOnly = false,
}: AstronautViewProps) {
  const router = useRouter();
  const activeAstronautId = astronautId;
  const now = useNow();
  const today = getMissionDate(now);

  const astronaut = useLiveQuery(
    () => (activeAstronautId ? getAstronaut(activeAstronautId) : undefined),
    [activeAstronautId],
  );
  const latestLog = useLiveQuery(
    () => (activeAstronautId ? getLatestLog(activeAstronautId) : undefined),
    [activeAstronautId],
  );
  const latestEvaluationRow = useLiveQuery(
    () =>
      activeAstronautId ? getLatestEvaluation(activeAstronautId) : undefined,
    [activeAstronautId],
  );
  const todayLog = useLiveQuery(
    () =>
      activeAstronautId ? getLogForDate(activeAstronautId, today) : undefined,
    [activeAstronautId, today],
  );
  const recentLogs = useLiveQuery(
    () => (activeAstronautId ? getRecentLogs(activeAstronautId, 7) : undefined),
    [activeAstronautId],
  );
  const completedActionIds = useLiveQuery(
    () =>
      activeAstronautId
        ? getCompletedActionIds(activeAstronautId, today)
        : undefined,
    [activeAstronautId, today],
  );

  const reminders = useLiveQuery(
    () => (activeAstronautId ? listReminders(activeAstronautId) : undefined),
    [activeAstronautId],
  );
  // `null` = loaded, no setup choice made yet.
  const reminderSetupState = useLiveQuery(
    async () =>
      activeAstronautId
        ? ((await getReminderSetupState(activeAstronautId)) ?? null)
        : undefined,
    [activeAstronautId],
  );

  const game = useLiveQuery(
    () =>
      activeAstronautId ? getGameSummary(activeAstronautId, today) : undefined,
    [activeAstronautId, today],
  );

  if (!activeAstronautId || !astronaut) return null;

  // SPEC §9 missed-reminder logic. Both are computed from saved data and
  // the device clock only: the nudge needs a real check-in reminder that
  // came due over 2 h ago, TRD-MISS-01 needs a real previous log.
  const missedCheckinDueAt = getMissedCheckinDueAt(
    reminders ?? [],
    todayLog !== undefined,
    now,
  );
  const missedAlert = evaluateMissedCheckin(latestLog?.date, today);
  const missedConfig = missedAlert ? getStatusConfig(missedAlert.status) : null;
  const showReminderSetupPrompt =
    reminders !== undefined &&
    reminders.length === 0 &&
    reminderSetupState === null;

  const evaluation = latestEvaluationRow?.result as
    EvaluationResult | undefined;
  const hasAnyCheckin = latestLog !== undefined;
  const isEvaluationFromToday = latestEvaluationRow?.date === today;
  const todaysActions = isEvaluationFromToday
    ? (evaluation?.actions ?? [])
    : [];
  const completeness = computeCompletenessScore(todayLog);
  const missionDay = getMissionDay(astronaut.missionStart, today);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
        <span>
          Mission day {missionDay} ·{" "}
          {readOnly ? (
            ENVIRONMENT_LABELS[astronaut.environment]
          ) : (
            <Link href="/environment" className="underline">
              {ENVIRONMENT_LABELS[astronaut.environment]}
            </Link>
          )}
        </span>
        {!readOnly && <OfflineBadge />}
      </div>

      {missedAlert && missedConfig && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border p-3 text-sm"
          style={{ borderColor: `var(${missedConfig.colorVar})` }}
        >
          <missedConfig.icon
            size={18}
            aria-hidden="true"
            className="mt-0.5 shrink-0"
            style={{ color: `var(${missedConfig.colorVar})` }}
          />
          <div>
            <p className="font-medium">
              {missedConfig.label}: {missedAlert.message}
            </p>
            <p className="text-zinc-600 dark:text-zinc-400">
              Last check-in: {latestLog?.date}.
              {!readOnly && " Start a check-in when you can."}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Rule {missedAlert.id} · {missedAlert.windowDays} days missed
            </p>
          </div>
        </div>
      )}

      {!readOnly && missedCheckinDueAt && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-zinc-300 p-3 text-sm dark:border-zinc-700"
        >
          <Bell size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          <p>
            Today&apos;s check-in is still open. It was due at{" "}
            {formatTimeOfDay(missedCheckinDueAt)}. No rush: do it when you have
            a few minutes.
          </p>
        </div>
      )}

      {!readOnly && showReminderSetupPrompt && (
        <Link
          href="/reminders"
          className="flex min-h-11 items-center gap-3 rounded-lg border border-zinc-300 p-3 text-sm dark:border-zinc-700"
        >
          <Bell size={18} aria-hidden="true" className="shrink-0" />
          <span>
            <span className="block font-medium">Set up your reminders</span>
            <span className="block text-zinc-600 dark:text-zinc-400">
              Choose when to be reminded about your daily check-in.
            </span>
          </span>
        </Link>
      )}

      {!hasAnyCheckin && (
        <EmptyState
          title={`No check-in yet for ${astronaut.name} · ${astronaut.crewCode}`}
          action={
            readOnly
              ? undefined
              : {
                  label: "Start check-in",
                  onClick: () => router.push("/checkin"),
                }
          }
        />
      )}

      <div className="flex flex-col items-center gap-2">
        <StatusRing status={evaluation?.overall ?? null} />
      </div>

      <EscalationCard escalation={evaluation?.escalation ?? null} />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-medium">Indicators</h2>
          {hasAnyCheckin && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Today&apos;s completeness: {completeness}%
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {CARDS.map((card) => {
            const indicator = findIndicator(
              evaluation?.indicators,
              card.indicatorId,
            );
            const value = latestLog ? card.getValue(latestLog) : undefined;
            const sparklineValues = (recentLogs ?? [])
              .map((l) => card.getValue(l))
              .filter((v): v is number => v !== undefined);
            return (
              <IndicatorCard
                key={card.id}
                label={card.label}
                unit={card.unit}
                value={value}
                status={indicator?.status}
                sparklineValues={sparklineValues}
                ruleId={indicator?.ruleId}
                message={indicator?.message}
              />
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="font-medium">Today&apos;s actions</h2>
        {!isEvaluationFromToday ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {readOnly
              ? "No check-in today, so there are no actions for today."
              : "Complete today's check-in to see today's actions."}
          </p>
        ) : todaysActions.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Nothing outstanding today.
          </p>
        ) : (
          <div className="mt-2">
            <ActionList
              actions={todaysActions.slice(0, 4)}
              checkable={!readOnly}
              checkedIds={completedActionIds}
              onToggle={(actionId) => {
                if (readOnly || !activeAstronautId || !latestEvaluationRow)
                  return;
                const next = !(completedActionIds?.has(actionId) ?? false);
                void setActionCompleted(
                  activeAstronautId,
                  today,
                  actionId,
                  latestEvaluationRow.id,
                  next,
                );
              }}
            />
          </div>
        )}
      </div>

      {/* SPEC §11: weekly challenge "progress ring on Home". Shown only
          once there is a real check-in to count from. */}
      {!readOnly && game && game.checkinCount > 0 && (
        <Link
          href="/rewards"
          className="flex min-h-11 items-center gap-4 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
        >
          <ProgressRing
            progress={game.weeklyChallenge.progress}
            target={game.weeklyChallenge.target}
            size={56}
            label="Weekly challenge"
          />
          <span>
            <span className="block font-medium">
              This week: {game.weeklyChallenge.title}
            </span>
            <span className="block text-zinc-600 dark:text-zinc-400">
              Level {game.level} · {game.points} points · {game.streak.current}
              -day streak
            </span>
          </span>
        </Link>
      )}

      {!readOnly && (
        <button
          type="button"
          onClick={() => router.push("/checkin")}
          className="min-h-11 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          {todayLog ? "Update today" : "Start daily check-in"}
        </button>
      )}
    </div>
  );
}
