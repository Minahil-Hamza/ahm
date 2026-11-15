"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { useReducedMotion } from "framer-motion";
import type { Status } from "@/config/thresholds";
import { useBodySelectionStore } from "@/lib/store/bodySelection";
import { BODY_PARTS, findOrgan, getBodyPart } from "@/config/bodyParts";
import { getStatusConfig } from "@/components/status/StatusBadge";
import {
  BodyModel,
  type Anchor,
  type Anchors,
  type ModelKind,
} from "./BodyModel";
import { RegionHotspot } from "./RegionHotspot";
import {
  CameraRig,
  HOME_CAMERA_POSITION,
  type OrbitControlsRef,
} from "./CameraRig";
import { HoloFloor, OrbitalRings, ScanSweep } from "./SceneFx";

interface Body3DProps {
  statuses: Record<string, Status | null>;
  resetToken: number;
  /** See `CameraRig`: keeps the focus clear of an open side panel. */
  viewShiftPx?: number;
}

/** Keeps `frameloop="demand"` alive while something moves continuously
 * (idle rotation, rings, scan sweep). Nothing calls `invalidate()` for
 * those on its own. Inactive under `prefers-reduced-motion`, where the
 * scene only renders when state changes. */
function FrameDriver({ active }: { active: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useFrame(() => {
    if (active) invalidate();
  });
  return null;
}

/** Name tag above whatever is under the pointer: organ name, the region
 * it reports to (when different), and the region's real status in
 * icon + text, never colour alone. */
function HoverTooltip({
  anchors,
  statuses,
}: {
  anchors: Anchors;
  statuses: Record<string, Status | null>;
}) {
  const regionId = useBodySelectionStore((s) => s.hoveredRegionId);
  const organId = useBodySelectionStore((s) => s.hoveredOrganId);
  const region = regionId ? getBodyPart(regionId) : undefined;
  const anchor = anchors[organId ?? regionId ?? ""];
  if (!region || !anchor) return null;
  const organLabel = organId ? findOrgan(organId)?.organ.label : undefined;
  const status = statuses[region.id] ?? null;
  const statusConfig = status ? getStatusConfig(status) : null;
  const StatusIcon = statusConfig?.icon;
  const [x, y, z] = anchor.center;
  return (
    // The wrapper ignores pointer events so the tag, which sits near the
    // cursor, never swallows the click meant for the organ.
    <Html
      center
      position={[x, y + anchor.radius + 0.05, z]}
      wrapperClass="pointer-events-none"
      className="pointer-events-none"
      zIndexRange={[30, 0]}
    >
      <div role="tooltip" className="holo-tooltip">
        <span className="font-semibold text-cyan-100">
          {organLabel ?? region.label}
        </span>
        {organLabel && organLabel !== region.label && (
          <span className="text-cyan-200/80">{region.label}</span>
        )}
        <span className="flex items-center gap-1 text-slate-200">
          {statusConfig && StatusIcon ? (
            <>
              <StatusIcon
                size={12}
                aria-hidden="true"
                style={{ color: `var(${statusConfig.colorVar})` }}
              />
              {statusConfig.label}
            </>
          ) : (
            "No data yet"
          )}
        </span>
      </div>
    </Html>
  );
}

/** SPEC §8.3 screen 3's interactive core. Client-only (loaded via
 * `dynamic(..., { ssr: false })`): three.js/WebGL can't run during
 * server rendering. The canvas is transparent; the space backdrop is
 * plain CSS behind it (`.holo-stage`). */
export function Body3D({ statuses, resetToken, viewShiftPx = 0 }: Body3DProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const controlsRef = useRef<OrbitControlsRef | null>(null);
  const scanYRef = useRef(-100);
  const selectedRegionId = useBodySelectionStore((s) => s.selectedRegionId);
  const selectedOrganId = useBodySelectionStore((s) => s.selectedOrganId);
  const hovering = useBodySelectionStore((s) => s.hoveredRegionId !== null);

  const [model, setModel] = useState<{
    kind: ModelKind;
    anchors: Anchors;
  } | null>(null);
  const handleReady = useCallback(
    (kind: ModelKind, anchors: Anchors) => setModel({ kind, anchors }),
    [],
  );

  // Regions with no organ mesh in the loaded model get a marker; its
  // configured position doubles as the camera/ring/tooltip anchor.
  const { anchors, markerRegions } = useMemo(() => {
    if (!model) return { anchors: {} as Anchors, markerRegions: [] };
    const all: Anchors = { ...model.anchors };
    const markers = BODY_PARTS.filter((region) => !model.anchors[region.id]);
    for (const region of markers) {
      all[region.id] = {
        center: region.hotspot.position,
        radius: region.hotspot.radius,
      };
    }
    return { anchors: all, markerRegions: markers };
  }, [model]);

  const focus: Anchor | null =
    (selectedOrganId ? anchors[selectedOrganId] : undefined) ??
    (selectedRegionId ? anchors[selectedRegionId] : undefined) ??
    null;
  const view = selectedRegionId
    ? (getBodyPart(selectedRegionId)?.view ?? "front")
    : "front";

  return (
    <>
      <Canvas
        dpr={[1, 1.75]}
        frameloop="demand"
        style={{ cursor: hovering ? "pointer" : "grab" }}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        }}
        camera={{
          position: HOME_CAMERA_POSITION,
          fov: 40,
          near: 0.05,
          far: 30,
        }}
        onPointerMissed={(e) => {
          // A plain click on empty space clears the selection; the end
          // of an orbit drag does not.
          if (e.type === "click") useBodySelectionStore.getState().select(null);
        }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[2, 3, 3]} intensity={1.25} />
        <directionalLight
          position={[-2.5, 1.5, -2]}
          intensity={0.7}
          color="#67e8f9"
        />
        <directionalLight
          position={[0, -1, 2]}
          intensity={0.25}
          color="#a78bfa"
        />
        <BodyModel
          statuses={statuses}
          reducedMotion={reducedMotion}
          scanYRef={scanYRef}
          onReady={handleReady}
        />
        {markerRegions.map((region) => (
          <RegionHotspot
            key={region.id}
            region={region}
            status={statuses[region.id] ?? null}
            reducedMotion={reducedMotion}
          />
        ))}
        <OrbitalRings focus={focus} reducedMotion={reducedMotion} />
        <ScanSweep scanYRef={scanYRef} reducedMotion={reducedMotion} />
        <HoloFloor reducedMotion={reducedMotion} />
        <HoverTooltip anchors={anchors} statuses={statuses} />
        <CameraRig
          controlsRef={controlsRef}
          focus={focus}
          view={view}
          resetToken={resetToken}
          viewShiftPx={viewShiftPx}
          reducedMotion={reducedMotion}
        />
        <FrameDriver active={!reducedMotion} />
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enablePan={false}
          enableDamping={!reducedMotion}
          minDistance={0.45}
          maxDistance={4.5}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI - Math.PI / 4}
          autoRotate={!reducedMotion && !selectedRegionId && !hovering}
          autoRotateSpeed={0.5}
        />
      </Canvas>
      {!model && (
        <p
          role="status"
          className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-xs tracking-[0.25em] text-cyan-200 uppercase"
        >
          Loading body model…
        </p>
      )}
    </>
  );
}
