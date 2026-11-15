"use client";

import { useState } from "react";
import type { MeasurementConfig } from "@/config/measurements";
import { HowToMeasureSheet } from "./HowToMeasureSheet";
import { NumberStepperInput } from "./NumberStepperInput";
import {
  getBorderlineFieldIds,
  isBorderline,
  resolveBorderlineTargets,
  statusForIndicator,
  unitForBorderlineField,
} from "./borderline";

type FieldValue = number | boolean | undefined;

interface MeasurementCardProps {
  config: MeasurementConfig;
  values: Record<string, FieldValue>;
  errors: Record<string, string | undefined>;
  firstReadings: Record<string, number | undefined>;
  acknowledged: Record<string, boolean>;
  onFieldChange: (fieldId: string, value: FieldValue) => void;
  onRemeasure: (fieldId: string, firstValue: number) => void;
  onAcknowledge: (fieldId: string) => void;
}

function HowToMeasureButton({
  label,
  steps,
}: {
  label: string;
  steps: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`How to measure ${label}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-sm font-medium dark:border-zinc-700"
      >
        ?
      </button>
      {open && (
        <HowToMeasureSheet
          label={label}
          steps={steps}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function BorderlinePrompt({
  value,
  unit,
  acknowledged,
  firstReading,
  onRemeasure,
  onAcknowledge,
}: {
  value: number | undefined;
  unit: string;
  acknowledged: boolean;
  firstReading: number | undefined;
  onRemeasure: () => void;
  onAcknowledge: () => void;
}) {
  if (firstReading !== undefined) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        First reading: {firstReading}
        {unit} (saved). Enter the second reading above.
      </p>
    );
  }

  if (acknowledged || value === undefined) return null;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950">
      <p className="text-amber-800 dark:text-amber-200">
        This reading ({value}
        {unit}) is outside the normal range. Rest 5 minutes and measure again?
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRemeasure}
          className="min-h-11 flex-1 rounded-md bg-amber-600 px-3 py-2 text-white"
        >
          Re-measure
        </button>
        <button
          type="button"
          onClick={onAcknowledge}
          className="min-h-11 flex-1 rounded-md border border-amber-600 px-3 py-2 text-amber-800 dark:text-amber-200"
        >
          Keep this value
        </button>
      </div>
    </div>
  );
}

export function MeasurementCard({
  config,
  values,
  errors,
  firstReadings,
  acknowledged,
  onFieldChange,
  onRemeasure,
  onAcknowledge,
}: MeasurementCardProps) {
  const targets = resolveBorderlineTargets(config, values);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">
          {config.label}
          {config.optional && (
            <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              Optional
            </span>
          )}
        </h3>
        <HowToMeasureButton label={config.label} steps={config.howToMeasure} />
      </div>

      {config.kind === "number" && (
        <NumberStepperInput
          id={config.id}
          label={config.label}
          unit={config.unit}
          step={config.step}
          precision={config.precision}
          value={
            typeof values[config.id] === "number"
              ? (values[config.id] as number)
              : undefined
          }
          onChange={(v) => onFieldChange(config.id, v)}
          error={errors[config.id]}
        />
      )}

      {config.kind === "two-number" && (
        <div className="flex gap-3">
          {config.fields.map((field) => (
            <div key={field.id} className="flex-1">
              <NumberStepperInput
                id={field.id}
                label={field.label}
                unit={field.unit}
                step={field.step}
                precision={field.precision}
                value={
                  typeof values[field.id] === "number"
                    ? (values[field.id] as number)
                    : undefined
                }
                onChange={(v) => onFieldChange(field.id, v)}
                error={errors[field.id]}
              />
            </div>
          ))}
        </div>
      )}

      {config.kind === "slider" && (
        <div className="flex flex-col gap-1">
          <input
            id={config.id}
            type="range"
            min={config.min}
            max={config.max}
            step={config.step}
            value={
              typeof values[config.id] === "number"
                ? (values[config.id] as number)
                : config.min
            }
            onChange={(e) => onFieldChange(config.id, Number(e.target.value))}
            className="min-h-11"
            aria-label={config.label}
          />
          <div className="flex justify-between text-sm text-zinc-600 dark:text-zinc-400">
            <span>{config.min}</span>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {typeof values[config.id] === "number"
                ? values[config.id]
                : "Skipped"}
            </span>
            <span>{config.max}</span>
          </div>
        </div>
      )}

      {config.kind === "toggle" && (
        <label className="flex min-h-11 items-center gap-3">
          <input
            id={config.id}
            type="checkbox"
            checked={Boolean(values[config.id])}
            onChange={(e) => onFieldChange(config.id, e.target.checked)}
            className="h-6 w-6"
          />
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            {values[config.id] ? "Yes" : "No"}
          </span>
        </label>
      )}

      {getBorderlineFieldIds(config).map((fieldId) => {
        const firstReading = firstReadings[fieldId];
        const target = targets.find((t) => t.fieldId === fieldId);
        const status =
          target && statusForIndicator(target.indicatorId, target.value);

        // Show the prompt/info unless there's neither a stashed first
        // reading NOR a currently-borderline value for this field.
        if (firstReading === undefined && !isBorderline(status)) return null;

        return (
          <BorderlinePrompt
            key={fieldId}
            value={target?.value}
            unit={unitForBorderlineField(config, fieldId)}
            acknowledged={Boolean(acknowledged[fieldId])}
            firstReading={firstReading}
            onRemeasure={() => target && onRemeasure(fieldId, target.value)}
            onAcknowledge={() => onAcknowledge(fieldId)}
          />
        );
      })}
    </div>
  );
}
