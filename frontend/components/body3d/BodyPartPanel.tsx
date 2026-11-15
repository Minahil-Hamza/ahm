"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { Status } from "@/config/thresholds";
import { getLearnTopicForIndicator, type LearnTopic } from "@/config/learn";
import { SourcesList } from "@/components/common/SourcesList";
import {
  getSymptomLabel,
  isSymptomId,
  type SymptomId,
} from "@/config/symptoms";
import { HAZARD_LABELS } from "@/lib/db/labels";
import type { DailyLog, SymptomEntry } from "@/lib/db/schema";
import type { Action, Escalation, IndicatorResult } from "@/lib/rules/types";
import type { BodyOrgan, BodyPart } from "@/config/bodyParts";
import { StatusBadge } from "@/components/status/StatusBadge";
import { ActionList } from "@/components/guidance/ActionList";
import { EscalationCard } from "@/components/guidance/EscalationCard";
import { OrganHealthIndicators } from "./OrganHealthIndicators";

interface BodyPartPanelProps {
  region: BodyPart;
  /** The organ that was picked inside the region, if one was. */
  organ?: BodyOrgan | null;
  status: Status | null;
  /** Date (YYYY-MM-DD) of the check-in the readings come from, so an
   * older reading is never mistaken for today's. */
  evaluationDate?: string;
  indicators?: IndicatorResult[];
  recentLogs?: DailyLog[];
  recentSymptoms?: SymptomEntry[];
  actions?: Action[];
  escalation?: Escalation | null;
  onClose: () => void;
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className="holo-label">{children}</h3>;
}

/**
 * The monitoring panel of the selected region (SPEC §8.3 screen 3), in
 * the spec's order: function, spaceflight effect + hazards, the region's
 * indicators with this astronaut's real latest values, recent symptoms,
 * "what to do now" (+ escalation if red/critical), Learn links, Sources.
 * Everything shown is saved data or fixed text from `config/bodyParts.ts`;
 * a missing reading is "No data yet". Read-only by nature: nothing in
 * here changes data.
 */
export function BodyPartPanel({
  region,
  organ = null,
  status,
  evaluationDate,
  indicators = [],
  recentLogs = [],
  recentSymptoms = [],
  actions = [],
  escalation = null,
  onClose,
}: BodyPartPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Move focus to the panel that just opened, so keyboard and
  // screen-reader users land on the new content (and hear its name).
  // Scrolling is left to `BodyView`, which knows the layout.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [region.id, organ?.meshName]);

  const relatedSymptoms = recentSymptoms.filter(
    (s): s is SymptomEntry & { symptom: SymptomId } =>
      isSymptomId(s.symptom) && region.symptoms.includes(s.symptom),
  );
  // The rule engine tags actions by category, not by body region. To
  // keep another region's advice from appearing here, actions are shown
  // only when this region has something of its own behind them: a
  // status from a real reading, or a recently reported symptom.
  const hasOwnFindings = status !== null || relatedSymptoms.length > 0;
  const relatedActions = hasOwnFindings
    ? actions.filter((a) => region.actionCategories.includes(a.category))
    : [];
  const showEscalation = status === "red" || status === "critical";
  // One link per Learn page, even if it covers two indicators (e.g.
  // blood pressure).
  const learnTopics = [
    ...new Map(
      region.indicators
        .map((id) => getLearnTopicForIndicator(id))
        .filter((t): t is LearnTopic => t !== undefined)
        .map((t) => [t.slug, t]),
    ).values(),
  ];
  const title = organ?.label ?? region.label;
  const showRegion = title !== region.label;

  return (
    <section
      aria-labelledby="body-part-panel-title"
      className="holo-panel flex flex-col gap-4 p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="holo-label">
            {showRegion ? `Organ · ${region.label}` : "Region"}
          </p>
          <h2
            id="body-part-panel-title"
            ref={headingRef}
            tabIndex={-1}
            className="mt-1 text-xl font-semibold tracking-wide text-cyan-50 outline-none"
          >
            {title}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
            {status ? (
              <StatusBadge status={status} size="sm" />
            ) : (
              <span className="rounded-full border border-slate-500 px-2 py-1 text-slate-200">
                No data yet
              </span>
            )}
            {evaluationDate && (
              <span className="font-mono">Check-in {evaluationDate}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title} panel`}
          className="holo-button h-11 w-11 shrink-0 justify-center"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="flex flex-col gap-1.5">
        <SectionTitle>Function</SectionTitle>
        <p className="text-sm text-slate-200">{region.functionText}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <SectionTitle>In spaceflight</SectionTitle>
        <p className="text-sm text-slate-200">{region.spaceEffectText}</p>
        <ul className="flex flex-wrap gap-1.5" aria-label="Hazards">
          {region.hazards.map((hazard) => (
            <li
              key={hazard}
              className="rounded-full border border-cyan-400/40 bg-cyan-400/5 px-2 py-0.5 text-xs text-cyan-100"
            >
              {HAZARD_LABELS[hazard]}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-1.5">
        <SectionTitle>Health indicators</SectionTitle>
        <OrganHealthIndicators
          indicatorIds={region.indicators}
          results={indicators}
          recentLogs={recentLogs}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <SectionTitle>Recent symptoms</SectionTitle>
        {relatedSymptoms.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm text-slate-100">
            {relatedSymptoms.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2"
              >
                <span>{getSymptomLabel(s.symptom)}</span>
                <span className="font-mono text-xs text-slate-300">
                  {s.date}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-300">
            No symptoms reported recently.
          </p>
        )}
      </div>

      {relatedActions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <SectionTitle>What to do now</SectionTitle>
          <ActionList actions={relatedActions} />
        </div>
      )}

      {showEscalation && <EscalationCard escalation={escalation} />}

      {learnTopics.length > 0 && (
        <div className="flex flex-col gap-1">
          <SectionTitle>Learn more</SectionTitle>
          <ul className="flex flex-wrap gap-x-4 text-sm">
            {learnTopics.map((topic) => (
              <li key={topic.slug}>
                <Link
                  href={`/learn/${topic.slug}`}
                  className="flex min-h-11 items-center text-cyan-200 underline"
                >
                  {topic.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-cyan-100">
        <SourcesList sources={region.sources} />
      </div>
    </section>
  );
}
