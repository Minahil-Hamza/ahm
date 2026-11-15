"use client";

function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

interface NumberStepperInputProps {
  id: string;
  label: string;
  unit: string;
  step: number;
  precision?: number;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  error?: string;
}

/** Numeric keypad input with +/- steppers (SPEC §8.3 screen 2 step 3).
 * Touch targets are >=44px (CLAUDE.md §2 rule 8). */
export function NumberStepperInput({
  id,
  label,
  unit,
  step,
  precision = 0,
  value,
  onChange,
  error,
}: NumberStepperInputProps) {
  function adjust(delta: number) {
    const base = value ?? 0;
    onChange(round(base + delta, precision));
  }

  function handleTextChange(raw: string) {
    if (raw.trim() === "") {
      onChange(undefined);
      return;
    }
    const parsed = Number(raw);
    onChange(Number.isNaN(parsed) ? value : parsed);
  }

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {label}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => adjust(-step)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-zinc-300 text-lg dark:border-zinc-700"
        >
          −
        </button>
        <div className="flex min-h-11 flex-1 items-center gap-2 rounded-md border border-zinc-300 px-3 dark:border-zinc-700">
          <input
            id={id}
            inputMode="decimal"
            value={value ?? ""}
            placeholder="Skip"
            onChange={(e) => handleTextChange(e.target.value)}
            className="w-full bg-transparent py-2 text-base outline-none"
          />
          <span className="shrink-0 text-sm text-zinc-600 dark:text-zinc-400">{unit}</span>
        </div>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => adjust(step)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-zinc-300 text-lg dark:border-zinc-700"
        >
          +
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
