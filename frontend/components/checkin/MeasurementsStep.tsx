"use client";

import { MEASUREMENTS } from "@/config/measurements";
import { MeasurementCard } from "./MeasurementCard";
import type { MeasurementFieldValue } from "./wizardTypes";

// team_relations and eva_today are presented in the mood/stress step
// instead (this chunk's own instructions group them there, matching SPEC
// §8.3 screen 2 step 4's literal placement — see docs/DECISIONS.md).
const STEP_MEASUREMENTS = MEASUREMENTS.filter(
  (m) => m.id !== "team_relations" && m.id !== "eva_today",
);

function groupMeasurements() {
  const groups: { title: string | null; items: typeof STEP_MEASUREMENTS }[] =
    [];
  for (const m of STEP_MEASUREMENTS) {
    const last = groups[groups.length - 1];
    if (m.group && last?.title === m.group) {
      last.items.push(m);
    } else {
      groups.push({ title: m.group ?? null, items: [m] });
    }
  }
  return groups;
}

const GROUPS = groupMeasurements();

interface MeasurementsStepProps {
  values: Record<string, MeasurementFieldValue>;
  errors: Record<string, string | undefined>;
  firstReadings: Record<string, number | undefined>;
  acknowledged: Record<string, boolean>;
  onFieldChange: (fieldId: string, value: MeasurementFieldValue) => void;
  onRemeasure: (fieldId: string, firstValue: number) => void;
  onAcknowledge: (fieldId: string) => void;
}

/** SPEC §8.3 screen 2 step 3 (built in C3; reused here as one wizard step
 * rather than rebuilt — see C3's docs/DECISIONS.md note). */
export function MeasurementsStep({
  values,
  errors,
  firstReadings,
  acknowledged,
  onFieldChange,
  onRemeasure,
  onAcknowledge,
}: MeasurementsStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Measurements</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Enter what you measured today. Anything can be skipped.
      </p>

      {GROUPS.map((group, i) => (
        <div key={i} className="flex flex-col gap-3">
          {group.title && (
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
              {group.title}
            </h3>
          )}
          {group.items.map((measurement) => (
            <MeasurementCard
              key={measurement.id}
              config={measurement}
              values={values}
              errors={errors}
              firstReadings={firstReadings}
              acknowledged={acknowledged}
              onFieldChange={onFieldChange}
              onRemeasure={onRemeasure}
              onAcknowledge={onAcknowledge}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
