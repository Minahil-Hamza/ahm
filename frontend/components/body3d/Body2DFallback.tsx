"use client";

import type { Status } from "@/config/thresholds";
import { getStatusConfig } from "@/components/status/StatusBadge";
import {
  resolveStatusColor,
  NEUTRAL_REGION_COLOR,
} from "@/lib/body/statusColor";
import { BODY_PARTS } from "@/config/bodyParts";

interface Body2DFallbackProps {
  statuses: Record<string, Status | null>;
  selectedRegionId: string | null;
  hoveredRegionId: string | null;
  onSelect: (id: string) => void;
  onHoverChange: (id: string | null) => void;
}

/** SPEC §8.3 screen 3: "If WebGL is unavailable or the canvas crashes:
 * render Body2DFallback (simple SVG with the same regions and colours)."
 * Real `<button>` elements (not raw SVG hit-targets) so touch targets stay
 * >= 44px and keyboard/tooltip behaviour match the 3D hotspots. */
export function Body2DFallback({
  statuses,
  selectedRegionId,
  hoveredRegionId,
  onSelect,
  onHoverChange,
}: Body2DFallbackProps) {
  return (
    <div className="relative mx-auto aspect-3/4 w-[min(18rem,75%)]">
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <circle cx="50" cy="8" r="7" fill="var(--border)" />
        <rect x="42" y="15" width="16" height="4" fill="var(--border)" />
        <rect
          x="32"
          y="18"
          width="36"
          height="30"
          rx="10"
          fill="var(--border)"
        />
        <rect
          x="16"
          y="20"
          width="12"
          height="32"
          rx="6"
          fill="var(--border)"
        />
        <rect
          x="72"
          y="20"
          width="12"
          height="32"
          rx="6"
          fill="var(--border)"
        />
        <rect
          x="34"
          y="46"
          width="14"
          height="40"
          rx="6"
          fill="var(--border)"
        />
        <rect
          x="52"
          y="46"
          width="14"
          height="40"
          rx="6"
          fill="var(--border)"
        />
      </svg>
      {BODY_PARTS.map((region) => {
        const status = statuses[region.id] ?? null;
        const statusConfig = status ? getStatusConfig(status) : null;
        const isSelected = selectedRegionId === region.id;
        const isHovered = hoveredRegionId === region.id;
        const color = resolveStatusColor(status);
        return (
          <button
            key={region.id}
            type="button"
            onClick={() => onSelect(region.id)}
            onMouseEnter={() => onHoverChange(region.id)}
            onMouseLeave={() => onHoverChange(null)}
            onFocus={() => onHoverChange(region.id)}
            onBlur={() => onHoverChange(null)}
            aria-pressed={isSelected}
            aria-label={`${region.label} — ${statusConfig ? statusConfig.label : "No data yet"}`}
            title={region.label}
            style={{
              left: `${region.position2d[0]}%`,
              top: `${region.position2d[1]}%`,
              backgroundColor: status ? color : NEUTRAL_REGION_COLOR,
              boxShadow: isSelected ? `0 0 0 3px ${color}` : undefined,
            }}
            className={`absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/70 text-[10px] font-medium text-white shadow dark:border-zinc-950/70 ${
              isHovered ? "scale-110" : ""
            }`}
          >
            {statusConfig ? (
              <statusConfig.icon size={16} aria-hidden="true" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
