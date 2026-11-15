"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import {
  getAstronaut,
  getLatestEvaluation,
  getRecentLogs,
  getRecentSymptoms,
} from "@/lib/db/repo";
import type { Status } from "@/config/thresholds";
import type { EvaluationResult } from "@/lib/rules/types";
import { useBodySelectionStore } from "@/lib/store/bodySelection";
import { getRegionStatus } from "@/lib/body/regionStatus";
import { isWebGLAvailable } from "@/lib/body/webgl";
import { BODY_PARTS, findOrgan, getBodyPart } from "@/config/bodyParts";
import { StatusBadge } from "@/components/status/StatusBadge";
import { RegionList } from "@/components/body3d/RegionList";
import { Body2DFallback } from "@/components/body3d/Body2DFallback";
import { CanvasErrorBoundary } from "@/components/body3d/CanvasErrorBoundary";
import { BodyPartPanel } from "@/components/body3d/BodyPartPanel";

const Body3D = dynamic(
  () => import("@/components/body3d/Body3D").then((m) => m.Body3D),
  { ssr: false },
);

const RECENT_DAYS = 7;
/** From this width the panel and the region list float over the stage. */
const WIDE_LAYOUT_PX = 960;
const PANEL_WIDTH_PX = 380;

export interface AstronautViewProps {
  /** Whose data to show. Every query below is scoped to this id. */
  astronautId: string;
  /** Commander/surgeon drill-down (C15): the same screen with every
   * control that could change data removed. */
  readOnly?: boolean;
}

/** Width of an element, so the layout follows the space this view is
 * given (full page, or the narrower crew drill-down), not the window. */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * SPEC §8.3 screen 3, for one astronaut: the 3D body as the centre of a
 * dark "medical bay" stage, with the selected region's panel beside it.
 *
 * Data: everything comes from this astronaut's saved records in the
 * local database (the offline source of truth, kept in step with the
 * server by the sync layer) through the existing repository functions.
 * Colours are the rule engine's stored result; nothing is computed or
 * made up here. `undefined` from a live query means "still loading".
 *
 * Rotating, zooming and picking a region only change the view, never
 * data, so they stay available in read-only mode.
 */
export function BodyView({
  astronautId,
  readOnly = false,
}: AstronautViewProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const astronaut = useLiveQuery(
    () => getAstronaut(astronautId),
    [astronautId],
  );
  // `?? null` separates "no check-in yet" (null) from "loading" (undefined).
  const latestEvaluationRow = useLiveQuery(
    async () => (await getLatestEvaluation(astronautId)) ?? null,
    [astronautId],
  );
  const recentSymptoms = useLiveQuery(
    () => getRecentSymptoms(astronautId, RECENT_DAYS),
    [astronautId],
  );
  const recentLogs = useLiveQuery(
    () => getRecentLogs(astronautId, RECENT_DAYS),
    [astronautId],
  );
  const selectedRegionId = useBodySelectionStore((s) => s.selectedRegionId);
  const selectedOrganId = useBodySelectionStore((s) => s.selectedOrganId);
  const hoveredRegionId = useBodySelectionStore((s) => s.hoveredRegionId);
  const select = useBodySelectionStore((s) => s.select);
  const hover = useBodySelectionStore((s) => s.hover);

  // Lazy initializer, not an effect (same pattern as OfflineBadge): a plain
  // read of the current value on first render, nothing to race against.
  const [webglAvailable] = useState(() => isWebGLAvailable());
  const [resetToken, setResetToken] = useState(0);
  const [rootRef, width] = useElementWidth<HTMLDivElement>();
  const wide = width >= WIDE_LAYOUT_PX;

  // A selection belongs to the astronaut it was made for.
  useEffect(() => {
    select(null);
    hover(null);
    return () => {
      select(null);
      hover(null);
    };
  }, [astronautId, select, hover]);

  // Stacked layout: a pick made from the list further down the page
  // brings the body back into view, with the top of the new panel
  // showing right under it.
  useEffect(() => {
    if (selectedRegionId && !wide) {
      rootRef.current?.scrollIntoView({ block: "start" });
    }
  }, [selectedRegionId, wide, rootRef]);

  const loading = latestEvaluationRow === undefined;
  const evaluation = latestEvaluationRow?.result as
    EvaluationResult | undefined;

  const statuses = useMemo(() => {
    const map: Record<string, Status | null> = {};
    for (const region of BODY_PARTS) {
      map[region.id] = getRegionStatus(
        evaluation?.indicators,
        region.indicators,
      );
    }
    return map;
  }, [evaluation]);

  const selectedRegion = selectedRegionId
    ? (getBodyPart(selectedRegionId) ?? null)
    : null;
  const selectedOrgan = selectedOrganId
    ? (findOrgan(selectedOrganId)?.organ ?? null)
    : null;

  /** Closes the panel and hands focus back to the region's button in
   * the list, so keyboard users are not dropped at the top of the page. */
  const closePanel = () => {
    const regionId = selectedRegionId;
    select(null);
    if (!regionId) return;
    rootRef.current
      ?.querySelector<HTMLButtonElement>(`[data-region-id="${regionId}"]`)
      ?.focus({ preventScroll: true });
  };

  const resetView = () => {
    select(null);
    setResetToken((t) => t + 1);
  };

  const fallback2D = (
    <div className="flex h-full items-center justify-center p-6 pt-24">
      <Body2DFallback
        statuses={statuses}
        selectedRegionId={selectedRegionId}
        hoveredRegionId={hoveredRegionId}
        onSelect={select}
        onHoverChange={hover}
      />
    </div>
  );

  const panel = (
    <AnimatePresence mode="wait" initial={false}>
      {selectedRegion && (
        <motion.div
          // One panel at a time: a new region replaces the old panel
          // (old one eases out, new one eases in); the 3D scene is not
          // remounted.
          key={selectedRegion.id}
          initial={
            reducedMotion
              ? false
              : { opacity: 0, x: wide ? 28 : 0, y: wide ? 0 : 16 }
          }
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={
            reducedMotion
              ? { opacity: 0, transition: { duration: 0 } }
              : { opacity: 0, x: wide ? 28 : 0, y: wide ? 0 : 16 }
          }
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <BodyPartPanel
            region={selectedRegion}
            organ={selectedOrgan}
            status={statuses[selectedRegion.id] ?? null}
            evaluationDate={latestEvaluationRow?.date}
            indicators={evaluation?.indicators}
            recentLogs={recentLogs ?? []}
            recentSymptoms={recentSymptoms ?? []}
            actions={evaluation?.actions}
            escalation={evaluation?.escalation}
            onClose={closePanel}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );

  const regionList = (
    <RegionList
      statuses={statuses}
      selectedRegionId={selectedRegionId}
      onSelect={select}
      onHoverChange={hover}
    />
  );

  return (
    <div
      ref={rootRef}
      className="holo-root"
      onKeyDown={(e) => {
        if (e.key === "Escape" && selectedRegionId) closePanel();
      }}
    >
      <div
        className={`holo-stage ${
          wide
            ? "h-[calc(100dvh-7.8125rem)] min-h-[680px]"
            : "h-[58dvh] min-h-[400px]"
        }`}
      >
        <div className="holo-backdrop" aria-hidden="true" />

        <div className="absolute inset-0">
          {webglAvailable ? (
            <CanvasErrorBoundary fallback={fallback2D}>
              <Body3D
                statuses={statuses}
                resetToken={resetToken}
                viewShiftPx={wide && selectedRegion ? PANEL_WIDTH_PX / 2 : 0}
              />
            </CanvasErrorBoundary>
          ) : (
            fallback2D
          )}
        </div>

        {/* HUD: only the edges take pointer events, the body stays free. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 sm:p-4">
          <div className="min-w-0">
            <p className="holo-label">AHM · Body scan</p>
            <h1 className="mt-1 truncate text-base font-semibold tracking-wide text-cyan-50 sm:text-lg">
              {astronaut ? `${astronaut.name} · ${astronaut.crewCode}` : "Body"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-200">
              {loading ? (
                <span role="status">Loading saved data…</span>
              ) : evaluation ? (
                <>
                  <StatusBadge status={evaluation.overall} size="sm" />
                  <span className="font-mono">
                    Check-in {latestEvaluationRow?.date}
                  </span>
                </>
              ) : (
                <span className="max-w-xs">
                  {readOnly
                    ? "No data yet. This astronaut has not completed a check-in."
                    : "No data yet. Complete a check-in to see this region's status."}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={resetView}
            className="holo-button pointer-events-auto shrink-0 gap-2 px-3 text-sm"
          >
            <RotateCcw size={16} aria-hidden="true" />
            Reset view
          </button>
        </div>

        {wide && (
          <nav
            aria-label="Body regions"
            className="absolute bottom-4 left-4 top-32 w-56 overflow-y-auto pr-1"
          >
            {regionList}
          </nav>
        )}

        {wide && (
          <div
            className="absolute bottom-4 right-4 top-20 overflow-y-auto pr-1"
            style={{ width: PANEL_WIDTH_PX }}
          >
            {panel}
          </div>
        )}

        {!selectedRegion && (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-slate-200">
            {webglAvailable
              ? "Drag to rotate · scroll or pinch to zoom · select an organ"
              : "Select a region"}
          </p>
        )}
      </div>

      {!wide && (
        <div className="flex flex-col gap-4 px-4 py-4">
          {panel}
          <nav aria-label="Body regions">{regionList}</nav>
        </div>
      )}
    </div>
  );
}
