"use client";

import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Award, CheckCircle2, Circle, Flame, Snowflake } from "lucide-react";
import { FREEZE_TOKEN_EVERY_DAYS, POINTS } from "@/config/badges";
import { getGameSummary } from "@/lib/db/gameRepo";
import { getAstronaut } from "@/lib/db/repo";
import { useActiveAstronautStore } from "@/lib/store/activeAstronaut";
import { getMissionDate } from "@/lib/time/missionDate";
import { useNow } from "@/lib/time/useNow";
import { EmptyState } from "@/components/common/EmptyState";
import { ProgressRing } from "@/components/game/ProgressRing";

const cardClass =
  "flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800";

/**
 * SPEC §8.3 screen 7 / §11: points, level, streak flame, badges, weekly
 * challenge — for the active astronaut only, worked out from their own
 * saved check-ins and action records. There is no comparison with other
 * crew members anywhere ("consistency, not competition"), and nothing
 * here mentions a health status or a missed day in a negative way.
 */
export default function RewardsPage() {
  const router = useRouter();
  const activeAstronautId = useActiveAstronautStore((s) => s.activeAstronautId);
  const today = getMissionDate(useNow());
  const astronaut = useLiveQuery(
    () => (activeAstronautId ? getAstronaut(activeAstronautId) : undefined),
    [activeAstronautId],
  );
  const summary = useLiveQuery(
    () =>
      activeAstronautId ? getGameSummary(activeAstronautId, today) : undefined,
    [activeAstronautId, today],
  );

  if (!activeAstronautId || !astronaut || !summary) return null;

  if (summary.checkinCount === 0) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-8">
        <h1 className="text-xl font-semibold">Rewards</h1>
        <EmptyState
          title={`No points yet for ${astronaut.name} · ${astronaut.crewCode}. Points come from your own check-ins.`}
          action={{
            label: "Start check-in",
            onClick: () => router.push("/checkin"),
          }}
        />
        {/* SPEC §16 empty state: "0 points, 0 streak, locked badges" —
            the real (zero) values from the summary, not placeholders. */}
        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          {summary.points} points · {summary.streak.current}-day streak ·{" "}
          {summary.badges.filter((b) => b.earned).length} of{" "}
          {summary.badges.length} badges unlocked
        </p>
      </div>
    );
  }

  const { streak, breakdown, weeklyChallenge } = summary;
  const levelSpan = summary.nextLevelAt - summary.levelFloor;
  const levelProgress = summary.points - summary.levelFloor;
  const earnedCount = summary.badges.filter((b) => b.earned).length;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-8">
      <h1 className="text-xl font-semibold">Rewards</h1>

      <section aria-labelledby="rewards-level" className={cardClass}>
        <h2 id="rewards-level" className="font-medium">
          Level {summary.level}
        </h2>
        <p className="text-2xl font-semibold">{summary.points} points</p>
        <progress
          className="h-2 w-full"
          value={levelProgress}
          max={levelSpan}
          aria-label={`Progress to level ${summary.level + 1}`}
        />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {summary.nextLevelAt - summary.points} points to level{" "}
          {summary.level + 1}
        </p>
      </section>

      <section aria-labelledby="rewards-streak" className={cardClass}>
        <h2 id="rewards-streak" className="font-medium">
          Check-in streak
        </h2>
        <p className="flex items-center gap-2 text-2xl font-semibold">
          <Flame size={24} aria-hidden="true" />
          {streak.current} {streak.current === 1 ? "day" : "days"}
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {streak.status === "active" &&
            "Days in a row with a completed check-in."}
          {streak.status === "frozen" &&
            "Your freeze covers yesterday. Check in today to keep the streak going."}
          {streak.status === "none" &&
            "A new streak starts with your next check-in."}{" "}
          Longest so far: {streak.longest}{" "}
          {streak.longest === 1 ? "day" : "days"}.
        </p>
        <p className="flex items-center gap-2 text-sm">
          <Snowflake size={16} aria-hidden="true" />
          {streak.freezeAvailable
            ? "Freeze ready: one missed day will not break your streak."
            : `Freeze used. A new one is ready ${FREEZE_TOKEN_EVERY_DAYS} days after the last.`}
        </p>
      </section>

      <section aria-labelledby="rewards-challenge" className={cardClass}>
        <h2 id="rewards-challenge" className="font-medium">
          This week
        </h2>
        <div className="flex items-center gap-4">
          <ProgressRing
            progress={weeklyChallenge.progress}
            target={weeklyChallenge.target}
            label="Weekly challenge"
          />
          <div className="text-sm">
            <p className="font-medium">{weeklyChallenge.title}</p>
            <p className="text-zinc-600 dark:text-zinc-400">
              {weeklyChallenge.completed
                ? "Done for this week."
                : "Counts nights logged since Monday."}
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="rewards-badges" className={cardClass}>
        <h2 id="rewards-badges" className="font-medium">
          Badges ({earnedCount} of {summary.badges.length})
        </h2>
        <ul className="flex flex-col gap-3">
          {summary.badges.map((badge) => (
            <li key={badge.id} className="flex items-start gap-3 text-sm">
              {badge.earned ? (
                <Award
                  size={20}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0"
                />
              ) : (
                <Circle
                  size={20}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-zinc-400"
                />
              )}
              <div className="flex-1">
                <p className="font-medium">
                  {badge.name}
                  <span className="ml-2 text-xs font-normal text-zinc-600 dark:text-zinc-400">
                    {badge.earned
                      ? "Earned"
                      : `${badge.progress} of ${badge.target}`}
                  </span>
                </p>
                <p className="text-zinc-600 dark:text-zinc-400">
                  {badge.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="rewards-points" className={cardClass}>
        <h2 id="rewards-points" className="font-medium">
          Where your points came from
        </h2>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          <dt>Check-ins ({POINTS.checkin} each)</dt>
          <dd className="text-right">{breakdown.checkins}</dd>
          <dt>
            Measurements logged ({POINTS.perMeasurement} each, up to{" "}
            {POINTS.maxMeasurementPointsPerDay} a day)
          </dt>
          <dd className="text-right">{breakdown.measurements}</dd>
          <dt>Actions completed ({POINTS.actionCompleted} each)</dt>
          <dd className="text-right">{breakdown.actionsCompleted}</dd>
          <dt>Follow-up answers ({POINTS.followupAnswered} each)</dt>
          <dd className="text-right">{breakdown.followupsAnswered}</dd>
          <dt>
            Streak bonus ({POINTS.streakBonus} every{" "}
            {POINTS.streakBonusEveryDays} days)
          </dt>
          <dd className="text-right">{breakdown.streakBonuses}</dd>
        </dl>
        <ul className="mt-2 flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
          <li className="flex items-start gap-2">
            <CheckCircle2
              size={16}
              aria-hidden="true"
              className="mt-0.5 shrink-0"
            />
            Symptoms never change your points. Reporting one, or choosing
            &quot;None today&quot;, earns the same. Always report how you really
            feel.
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2
              size={16}
              aria-hidden="true"
              className="mt-0.5 shrink-0"
            />
            Points are for logging, not for the numbers. A red result earns the
            same as a green one.
          </li>
        </ul>
      </section>
    </div>
  );
}
