"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Minus } from "lucide-react";
import { getIndicatorConfig } from "@/config/thresholds";
import type { DailyLog } from "@/lib/db/schema";
import type { IndicatorResult } from "@/lib/rules/types";
import { getStatusConfig } from "@/components/status/StatusBadge";
import { Sparkline } from "@/components/charts/Sparkline";

interface OrganHealthIndicatorsProps {
  /** The region's indicator ids from `config/bodyParts.ts`. */
  indicatorIds: readonly string[];
  /** Indicator results of the latest real evaluation, if there is one. */
  results?: IndicatorResult[];
  /** The astronaut's recent saved logs, oldest first, for the trend line. */
  recentLogs?: DailyLog[];
}

/** One saved log's value for an indicator id. Exercise is the only
 * computed one (resistance + cardio minutes, as in the rule engine);
 * everything else is the log field of the same name. A skipped
 * measurement is `undefined`, never a filled-in default. */
function getLoggedValue(
  log: DailyLog,
  indicatorId: string,
): number | undefined {
  if (indicatorId === "exercise_minutes") {
    if (
      log.exercise_resistance_min === undefined &&
      log.exercise_cardio_min === undefined
    )
      return undefined;
    return (log.exercise_resistance_min ?? 0) + (log.exercise_cardio_min ?? 0);
  }
  const value = (log as unknown as Record<string, unknown>)[indicatorId];
  return typeof value === "number" ? value : undefined;
}

/**
 * The readings behind a region's status: for each indicator the latest
 * real value with its unit, the status as icon + word, the rule id that
 * produced it (CLAUDE.md rule 5) and a small trend of the saved values.
 * An indicator without a reading says "No data yet"; nothing is assumed
 * healthy and nothing is invented.
 */
export function OrganHealthIndicators({
  indicatorIds,
  results = [],
  recentLogs = [],
}: OrganHealthIndicatorsProps) {
  const reducedMotion = useReducedMotion() ?? false;

  if (indicatorIds.length === 0) {
    return (
      <p className="text-sm text-slate-300">
        This region has no direct measurement in the app. See symptoms below
        instead.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {indicatorIds.map((id) => {
        const config = getIndicatorConfig(id);
        const result = results.find((r) => r.id === id);
        const statusConfig = result ? getStatusConfig(result.status) : null;
        const StatusIcon = statusConfig?.icon;
        const trend = recentLogs
          .map((log) => getLoggedValue(log, id))
          .filter((v): v is number => v !== undefined);
        return (
          <li key={id} className="holo-readout">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-100">
                  {config?.label ?? id}
                </p>
                {result && statusConfig && StatusIcon ? (
                  <p
                    className="mt-0.5 flex items-center gap-1 text-xs"
                    style={{ color: `var(${statusConfig.colorVar})` }}
                  >
                    <StatusIcon size={13} aria-hidden="true" />
                    <span>{statusConfig.label}</span>
                    <span className="font-mono text-slate-300">
                      · {result.ruleId}
                    </span>
                  </p>
                ) : (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-300">
                    <Minus size={13} aria-hidden="true" />
                    No data yet
                  </p>
                )}
              </div>
              {result && statusConfig && (
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {/* Re-keyed on the value so a new reading eases in. */}
                  <motion.p
                    key={String(result.value)}
                    initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                    className="font-mono text-lg leading-none text-cyan-50"
                  >
                    {result.value}
                    {config?.unit && (
                      <span className="ml-1 text-xs text-slate-300">
                        {config.unit}
                      </span>
                    )}
                  </motion.p>
                  {trend.length >= 2 && (
                    <span title={`Last ${trend.length} saved readings`}>
                      <Sparkline
                        values={trend}
                        colorVar={statusConfig.colorVar}
                        width={72}
                        height={20}
                      />
                      <span className="sr-only">
                        Trend of the last {trend.length} saved readings.
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>
            {result?.message && (
              <p className="mt-1.5 text-xs text-slate-300">{result.message}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
