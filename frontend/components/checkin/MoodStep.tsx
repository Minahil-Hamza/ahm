"use client";

import { getMeasurementConfig } from "@/config/measurements";
import { MeasurementCard } from "./MeasurementCard";
import type { MeasurementFieldValue } from "./wizardTypes";

const MOOD_OPTIONS = [
  { value: 1, emoji: "😢", label: "Very low" },
  { value: 2, emoji: "😕", label: "Low" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😄", label: "Great" },
] as const;

const TEAM_RELATIONS_CONFIG = getMeasurementConfig("team_relations")!;
const EVA_CONFIG = getMeasurementConfig("eva_today")!;

interface MoodStepProps {
  mood: number | undefined;
  stress: number | undefined;
  selfHarmThoughts: boolean;
  onMoodChange: (mood: number) => void;
  onStressChange: (stress: number) => void;
  onSelfHarmChange: (value: boolean) => void;
  measurementValues: Record<string, MeasurementFieldValue>;
  onFieldChange: (fieldId: string, value: MeasurementFieldValue) => void;
}

/** SPEC §8.3 screen 2 step 4: mood/stress, the safety question
 * (`CMB-SAFETY-01`), team relations, and the EVA toggle. */
export function MoodStep({
  mood,
  stress,
  selfHarmThoughts,
  onMoodChange,
  onStressChange,
  onSelfHarmChange,
  measurementValues,
  onFieldChange,
}: MoodStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Mood and stress</h2>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          How are you feeling today?
        </p>
        <div className="flex justify-between gap-2">
          {MOOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onMoodChange(opt.value)}
              aria-pressed={mood === opt.value}
              aria-label={opt.label}
              className={`flex min-h-11 flex-1 flex-col items-center gap-1 rounded-md border p-2 ${
                mood === opt.value
                  ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <span className="text-2xl" aria-hidden="true">
                {opt.emoji}
              </span>
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                {opt.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="stress"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Stress / fatigue
        </label>
        <input
          id="stress"
          type="range"
          min={1}
          max={5}
          step={1}
          value={stress ?? 1}
          onChange={(e) => onStressChange(Number(e.target.value))}
          className="min-h-11"
          aria-label="Stress / fatigue"
        />
        <div className="flex justify-between text-sm text-zinc-600 dark:text-zinc-400">
          <span>Low</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {stress ?? "Skipped"}
          </span>
          <span>High</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-zinc-300 p-4 dark:border-zinc-700">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          In the last day, have you had any thoughts of harming yourself?
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onSelfHarmChange(false)}
            aria-pressed={!selfHarmThoughts}
            className={`min-h-11 flex-1 rounded-md border px-3 py-2 text-sm ${
              !selfHarmThoughts
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            No
          </button>
          <button
            type="button"
            onClick={() => onSelfHarmChange(true)}
            aria-pressed={selfHarmThoughts}
            className={`min-h-11 flex-1 rounded-md border px-3 py-2 text-sm ${
              selfHarmThoughts
                ? "border-red-700 bg-red-700 text-white"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            Yes
          </button>
        </div>
        {selfHarmThoughts && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            You&apos;re not alone. Reach out to a crewmate right now, and this
            check-in will route to the flight surgeon immediately after you
            save.
          </p>
        )}
      </div>

      <MeasurementCard
        config={TEAM_RELATIONS_CONFIG}
        values={measurementValues}
        errors={{}}
        firstReadings={{}}
        acknowledged={{}}
        onFieldChange={onFieldChange}
        onRemeasure={() => {}}
        onAcknowledge={() => {}}
      />
      <MeasurementCard
        config={EVA_CONFIG}
        values={measurementValues}
        errors={{}}
        firstReadings={{}}
        acknowledged={{}}
        onFieldChange={onFieldChange}
        onRemeasure={() => {}}
        onAcknowledge={() => {}}
      />
    </div>
  );
}
