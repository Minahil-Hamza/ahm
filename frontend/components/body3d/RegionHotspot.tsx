"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { MathUtils, type MeshBasicMaterial } from "three";
import type { Status } from "@/config/thresholds";
import type { BodyPart } from "@/config/bodyParts";
import { useBodySelectionStore } from "@/lib/store/bodySelection";
import { resolveStatusColor } from "@/lib/body/statusColor";
import { HOLO_CYAN } from "./holoMaterial";

interface RegionHotspotProps {
  region: BodyPart;
  status: Status | null;
  reducedMotion: boolean;
}

const DRAG_TOLERANCE = 6;

/**
 * Marker for a region that has no organ mesh in the loaded model (mind,
 * muscles, skin; or every region when only the primitive body is
 * available). A status-coloured core inside a ring that always faces
 * the camera, drawn on top of the body so it is never hidden, with an
 * invisible sphere of the configured radius as the click target.
 * Only `critical` pulses, like every other status display in the app.
 */
export function RegionHotspot({
  region,
  status,
  reducedMotion,
}: RegionHotspotProps) {
  const { invalidate } = useThree();
  const coreRef = useRef<MeshBasicMaterial>(null);
  const ringRef = useRef<MeshBasicMaterial>(null);
  const isSelected = useBodySelectionStore(
    (s) => s.selectedRegionId === region.id,
  );
  const isHovered = useBodySelectionStore(
    (s) => s.hoveredRegionId === region.id && s.hoveredOrganId === null,
  );
  const dimmed = useBodySelectionStore(
    (s) => s.selectedRegionId !== null && s.selectedRegionId !== region.id,
  );
  const color = useMemo(() => resolveStatusColor(status), [status]);
  const active = isSelected || isHovered;
  const shouldPulse = status === "critical" && !reducedMotion;
  const coreTarget = dimmed && !isHovered ? 0.35 : status === null ? 0.7 : 1;
  const ringTarget = active ? 1 : dimmed ? 0.25 : 0.6;
  const radius = region.hotspot.radius;

  useEffect(() => {
    invalidate();
  }, [coreTarget, ringTarget, color, invalidate]);

  useFrame((state, delta) => {
    const core = coreRef.current;
    const ring = ringRef.current;
    if (!core || !ring) return;
    if (reducedMotion) {
      core.opacity = coreTarget;
      ring.opacity = ringTarget;
      return;
    }
    const pulse = shouldPulse
      ? 0.25 * Math.sin(state.clock.elapsedTime * 3.2)
      : 0;
    core.opacity = MathUtils.clamp(
      MathUtils.damp(core.opacity, coreTarget, 8, delta) + pulse * 0.2,
      0,
      1,
    );
    ring.opacity = MathUtils.damp(ring.opacity, ringTarget, 8, delta);
    if (shouldPulse || Math.abs(ring.opacity - ringTarget) > 0.004)
      invalidate();
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > DRAG_TOLERANCE) return;
    e.stopPropagation();
    const { selectedRegionId, select } = useBodySelectionStore.getState();
    select(selectedRegionId === region.id ? null : region.id);
  };

  return (
    <group position={region.hotspot.position}>
      <mesh
        name={region.id}
        onClick={handleClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          useBodySelectionStore.getState().hover(region.id);
        }}
        onPointerOut={() => {
          const { hoveredRegionId, hover } = useBodySelectionStore.getState();
          if (hoveredRegionId === region.id) hover(null);
        }}
      >
        <sphereGeometry args={[radius, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh renderOrder={6} raycast={() => null}>
        <sphereGeometry args={[radius * 0.3, 16, 16]} />
        <meshBasicMaterial
          ref={coreRef}
          color={color}
          transparent
          opacity={coreTarget}
          depthTest={false}
        />
      </mesh>
      <Billboard>
        <mesh renderOrder={6} raycast={() => null}>
          <ringGeometry args={[radius * 0.9, radius, 48]} />
          <meshBasicMaterial
            ref={ringRef}
            color={active ? HOLO_CYAN : color}
            transparent
            opacity={ringTarget}
            depthTest={false}
          />
        </mesh>
      </Billboard>
    </group>
  );
}
