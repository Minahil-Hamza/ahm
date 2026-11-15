"use client";

import { Minus } from "lucide-react";
import type { Status } from "@/config/thresholds";
import { getStatusConfig } from "@/components/status/StatusBadge";
import { BODY_PARTS } from "@/config/bodyParts";

interface RegionListProps {
  statuses: Record<string, Status | null>;
  selectedRegionId: string | null;
  onSelect: (id: string) => void;
  /** Called on hover/focus so the 3D body lights up the same region. */
  onHoverChange?: (id: string | null) => void;
}

/** CLAUDE.md §2 rule 8 / SPEC §8.3 screen 3: "a RegionList... so keyboard
 * and screen-reader users and low-end devices get the same information" as
 * the 3D canvas — real buttons, not a decorative mirror of it. Selecting
 * here drives the same store as clicking an organ, so the camera, the
 * highlight and the panel follow. Works whether or not the 3D canvas
 * rendered at all (also used with `Body2DFallback`). */
export function RegionList({
  statuses,
  selectedRegionId,
  onSelect,
  onHoverChange,
}: RegionListProps) {
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Body regions">
      {BODY_PARTS.map((region) => {
        const status = statuses[region.id] ?? null;
        const statusConfig = status ? getStatusConfig(status) : null;
        const isSelected = selectedRegionId === region.id;
        return (
          <li key={region.id}>
            <button
              type="button"
              data-region-id={region.id}
              onClick={() => onSelect(region.id)}
              onMouseEnter={() => onHoverChange?.(region.id)}
              onMouseLeave={() => onHoverChange?.(null)}
              onFocus={() => onHoverChange?.(region.id)}
              onBlur={() => onHoverChange?.(null)}
              aria-pressed={isSelected}
              className={`holo-button w-full justify-between gap-3 px-3 text-left text-sm ${
                isSelected ? "holo-button-active" : ""
              }`}
            >
              <span>{region.label}</span>
              {statusConfig ? (
                <span
                  className="flex shrink-0 items-center gap-1 text-xs"
                  style={{ color: `var(${statusConfig.colorVar})` }}
                >
                  <statusConfig.icon size={14} aria-hidden="true" />
                  {statusConfig.label}
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1 text-xs text-slate-300">
                  <Minus size={14} aria-hidden="true" />
                  No data yet
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
