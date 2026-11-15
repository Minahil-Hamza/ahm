"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  measurementSchema,
  type MeasurementFormValues,
} from "@/lib/db/measurementSchema";
import { getAstronaut, getPriorCheckin, saveCheckin } from "@/lib/db/repo";
import type { FollowupResponse } from "@/lib/db/schema";
import { buildMissionContext } from "@/lib/db/missionContext";
import { getMissionDate } from "@/lib/time/missionDate";
import { useActiveAstronautStore } from "@/lib/store/activeAstronaut";
import type { SymptomId } from "@/config/symptoms";
import type { EvaluationResult, MissionContext } from "@/lib/rules/types";
import { YesterdayRecapStep } from "./YesterdayRecapStep";
import { SymptomsStep } from "./SymptomsStep";
import { MeasurementsStep } from "./MeasurementsStep";
import { MoodStep } from "./MoodStep";
import { ReviewStep } from "./ReviewStep";
import { ResultScreen } from "./ResultScreen";
import {
  WIZARD_STEPS,
  createInitialWizardState,
  type MeasurementFieldValue,
  type WizardStep,
} from "./wizardTypes";

const STEP_TITLES: Record<WizardStep, string> = {
  recap: "Yesterday",
  symptoms: "Symptoms",
  measurements: "Measurements",
  mood: "Mood and stress",
  review: "Review",
  result: "Result",
};

const BEFORE_REVIEW = WIZARD_STEPS.slice(0, WIZARD_STEPS.indexOf("review") + 1);

export function CheckinWizard() {
  const activeAstronautId = useActiveAstronautStore((s) => s.activeAstronautId);
  const astronaut = useLiveQuery(
    () => (activeAstronautId ? getAstronaut(activeAstronautId) : undefined),
    [activeAstronautId],
  );

  const [state, setState] = useState(createInitialWizardState);
  const [step, setStep] = useState<WizardStep>("recap");
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Fetched here (not inside YesterdayRecapStep) because handleSave also
  // needs the prior evaluation's id to tag follow-up answers correctly.
  const prior = useLiveQuery(
    () =>
      activeAstronautId
        ? getPriorCheckin(activeAstronautId, state.date)
        : undefined,
    [activeAstronautId, state.date],
  );

  if (!activeAstronautId || !astronaut) return null;

  const stepIndex = BEFORE_REVIEW.indexOf(step);

  function goTo(next: WizardStep) {
    setStep(next);
  }

  function goNext() {
    const next = BEFORE_REVIEW[stepIndex + 1];
    if (next) setStep(next);
  }

  function goBack() {
    const prev = BEFORE_REVIEW[stepIndex - 1];
    if (prev) setStep(prev);
  }

  function handleMeasurementFieldChange(
    fieldId: string,
    value: MeasurementFieldValue,
  ) {
    setState((s) => ({
      ...s,
      measurementValues: { ...s.measurementValues, [fieldId]: value },
      measurementErrors: { ...s.measurementErrors, [fieldId]: undefined },
      acknowledgedBorderline:
        s.firstReadings[fieldId] === undefined
          ? { ...s.acknowledgedBorderline, [fieldId]: false }
          : s.acknowledgedBorderline,
    }));
  }

  function handleRemeasure(fieldId: string, firstValue: number) {
    setState((s) => ({
      ...s,
      firstReadings: { ...s.firstReadings, [fieldId]: firstValue },
      measurementValues: { ...s.measurementValues, [fieldId]: undefined },
    }));
  }

  function handleAcknowledge(fieldId: string) {
    setState((s) => ({
      ...s,
      acknowledgedBorderline: { ...s.acknowledgedBorderline, [fieldId]: true },
    }));
  }

  async function handleSave() {
    // Narrows for TS inside this closure — the component already returned
    // null above if either was missing, so this is unreachable in
    // practice, but TS doesn't carry that narrowing into a function
    // declared later in the same body.
    if (!activeAstronautId || !astronaut) return;

    setSaving(true);
    setSaveError(null);

    // Same reconciliation as C3: a stashed first reading with no second
    // value entered keeps the first reading as the final value.
    const reconciledValues = { ...state.measurementValues };
    const reconciledFirstReadings: Record<string, number> = {};
    for (const [id, first] of Object.entries(state.firstReadings)) {
      if (first === undefined) continue;
      if (reconciledValues[id] === undefined) reconciledValues[id] = first;
      else reconciledFirstReadings[id] = first;
    }

    const candidate: Record<string, number | boolean> = {};
    for (const [id, value] of Object.entries(reconciledValues)) {
      if (value !== undefined) candidate[id] = value;
    }

    const parsed = measurementSchema.safeParse(candidate);
    if (!parsed.success) {
      const nextErrors: Record<string, string | undefined> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string") nextErrors[key] = issue.message;
      }
      setState((s) => ({ ...s, measurementErrors: nextErrors }));
      setSaving(false);
      setSaveError(
        "Some values look impossible — check the measurements step.",
      );
      setStep("measurements");
      return;
    }

    const mission: MissionContext = buildMissionContext(astronaut, state.date);

    const priorEvaluationId = prior?.evaluation?.id;
    const followups = priorEvaluationId
      ? Object.entries(state.followupAnswers).map(([actionId, response]) => ({
          actionId,
          evaluationId: priorEvaluationId,
          response: response as FollowupResponse,
        }))
      : [];

    try {
      const result = await saveCheckin({
        astronautId: activeAstronautId,
        date: state.date,
        isBackdated: state.date !== getMissionDate(),
        measurements: parsed.data as MeasurementFormValues,
        firstReadings:
          Object.keys(reconciledFirstReadings).length > 0
            ? reconciledFirstReadings
            : undefined,
        mood: state.mood,
        stress: state.stress,
        selfHarmThoughts: state.selfHarmThoughts,
        symptoms: Object.entries(state.symptoms).map(([symptom, severity]) => ({
          symptom: symptom as SymptomId,
          severity,
        })),
        followups,
        mission,
      });
      setEvaluation(result.evaluation);
      setStep("result");
    } catch {
      setSaveError("Couldn't save this check-in. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-8">
      {step !== "result" && (
        <div className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400">
          <span>
            Step {stepIndex + 1} of {BEFORE_REVIEW.length}
          </span>
          <span>{STEP_TITLES[step]}</span>
        </div>
      )}

      {step === "recap" && (
        <YesterdayRecapStep
          date={state.date}
          onDateChange={(date) => setState((s) => ({ ...s, date }))}
          prior={prior}
          followupAnswers={state.followupAnswers}
          onAnswerChange={(actionId, response) =>
            setState((s) => ({
              ...s,
              followupAnswers: { ...s.followupAnswers, [actionId]: response },
            }))
          }
        />
      )}

      {step === "symptoms" && (
        <SymptomsStep
          symptoms={state.symptoms}
          onChange={(symptoms) => setState((s) => ({ ...s, symptoms }))}
        />
      )}

      {step === "measurements" && (
        <MeasurementsStep
          values={state.measurementValues}
          errors={state.measurementErrors}
          firstReadings={state.firstReadings}
          acknowledged={state.acknowledgedBorderline}
          onFieldChange={handleMeasurementFieldChange}
          onRemeasure={handleRemeasure}
          onAcknowledge={handleAcknowledge}
        />
      )}

      {step === "mood" && (
        <MoodStep
          mood={state.mood}
          stress={state.stress}
          selfHarmThoughts={state.selfHarmThoughts}
          onMoodChange={(mood) => setState((s) => ({ ...s, mood }))}
          onStressChange={(stress) => setState((s) => ({ ...s, stress }))}
          onSelfHarmChange={(selfHarmThoughts) =>
            setState((s) => ({ ...s, selfHarmThoughts }))
          }
          measurementValues={state.measurementValues}
          onFieldChange={handleMeasurementFieldChange}
        />
      )}

      {step === "review" && (
        <ReviewStep
          date={state.date}
          followupAnswers={state.followupAnswers}
          symptoms={state.symptoms}
          measurementValues={state.measurementValues}
          mood={state.mood}
          stress={state.stress}
          selfHarmThoughts={state.selfHarmThoughts}
          onEdit={goTo}
        />
      )}

      {step === "result" && evaluation && (
        <ResultScreen
          evaluation={evaluation}
          onDone={() => {
            setState(createInitialWizardState());
            setEvaluation(null);
            setStep("recap");
          }}
        />
      )}

      {saveError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {saveError}
        </p>
      )}

      {step !== "result" && (
        <div className="flex gap-2">
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={goBack}
              className="min-h-11 flex-1 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
            >
              Back
            </button>
          )}
          {step === "review" ? (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="min-h-11 flex-1 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {saving ? "Saving…" : "Save check-in"}
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              className="min-h-11 flex-1 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Next
            </button>
          )}
        </div>
      )}
    </div>
  );
}
