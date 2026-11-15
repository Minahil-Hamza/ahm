"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  Color,
  DoubleSide,
  MathUtils,
  type BufferGeometry,
  type Matrix4,
  type MeshStandardMaterial,
  type ShaderMaterial,
} from "three";
import type { Status } from "@/config/thresholds";
import type { BodyOrgan } from "@/config/bodyParts";
import { useBodySelectionStore } from "@/lib/store/bodySelection";
import { resolveStatusColor } from "@/lib/body/statusColor";
import { holoMaterialParameters, HOLO_CYAN } from "./holoMaterial";

interface OrganMeshProps {
  geometry: BufferGeometry;
  /** The mesh's transform inside the loaded model. */
  matrix: Matrix4;
  regionId: string;
  organ: BodyOrgan;
  /** Status of the organ's region from the latest real evaluation, or
   * `null` for "no data" (neutral grey, never shown as healthy). */
  status: Status | null;
  reducedMotion: boolean;
}

const DEEP = new Color("#0a1626");
const NO_DATA_SURFACE = "#566072";
/** Pointer travel (px) above which a press counts as an orbit drag. */
const DRAG_TOLERANCE = 6;

/**
 * One anatomical organ: its own mesh, its own material, picked by
 * raycasting the real geometry. Colour = region status; hover adds a
 * cyan halo; the selected organ glows and the other regions fade back
 * so it becomes the focus while the anatomy stays visible.
 *
 * Reads its own flags from the selection store, so picking an organ
 * re-renders only the organs whose state changed, never the scene.
 */
export function OrganMesh({
  geometry,
  matrix,
  regionId,
  organ,
  status,
  reducedMotion,
}: OrganMeshProps) {
  const { invalidate } = useThree();
  const materialRef = useRef<MeshStandardMaterial>(null);

  const inSelectedRegion = useBodySelectionStore(
    (s) => s.selectedRegionId === regionId,
  );
  const isFocus = useBodySelectionStore(
    (s) =>
      s.selectedRegionId === regionId &&
      (s.selectedOrganId === null || s.selectedOrganId === organ.meshName),
  );
  const isHovered = useBodySelectionStore(
    (s) => s.hoveredOrganId === organ.meshName,
  );
  const dimmed = useBodySelectionStore(
    (s) => s.selectedRegionId !== null && s.selectedRegionId !== regionId,
  );

  const { surface, emissive } = useMemo(() => {
    const statusColor = resolveStatusColor(status);
    return {
      surface:
        status === null
          ? new Color(NO_DATA_SURFACE)
          : new Color(statusColor).lerp(DEEP, 0.5),
      emissive: new Color(statusColor),
    };
  }, [status]);

  const haloRef = useRef<ShaderMaterial>(null);
  const haloParameters = useMemo(
    () =>
      holoMaterialParameters({
        color: HOLO_CYAN,
        opacity: 0,
        power: 2.4,
        base: 0.02,
        inflate: 0.0035,
      }),
    [],
  );

  const shouldPulse = status === "critical" && !reducedMotion;
  const glowTarget =
    (status === null ? 0.05 : 0.4) *
      (dimmed ? 0.45 : 1) *
      (inSelectedRegion && !isFocus ? 1.2 : 1) +
    (isFocus ? 0.55 : 0) +
    (isHovered ? 0.25 : 0);
  const opacityTarget = dimmed && !isHovered ? 0.2 : 1;
  // Rim only, so the status colour underneath stays the main signal.
  const haloTarget = isFocus ? 0.6 : isHovered ? 0.75 : 0;

  // Under `frameloop="demand"` a state change must ask for a frame.
  useEffect(() => {
    invalidate();
  }, [glowTarget, opacityTarget, haloTarget, surface, invalidate]);

  useFrame((state, delta) => {
    const material = materialRef.current;
    const halo = haloRef.current;
    if (!material || !halo) return;
    const haloOpacity = halo.uniforms.uOpacity;
    if (reducedMotion) {
      material.emissiveIntensity = glowTarget;
      material.opacity = opacityTarget;
      haloOpacity.value = haloTarget;
    } else {
      const pulse = shouldPulse
        ? Math.sin(state.clock.elapsedTime * 3.2) * 0.3
        : 0;
      material.emissiveIntensity =
        MathUtils.damp(
          material.emissiveIntensity - (material.userData.pulse ?? 0),
          glowTarget,
          7,
          delta,
        ) + pulse;
      material.userData.pulse = pulse;
      material.opacity = MathUtils.damp(
        material.opacity,
        opacityTarget,
        7,
        delta,
      );
      haloOpacity.value = MathUtils.damp(
        haloOpacity.value,
        haloTarget,
        9,
        delta,
      );
      const settling =
        Math.abs(material.opacity - opacityTarget) > 0.004 ||
        Math.abs(haloOpacity.value - haloTarget) > 0.004 ||
        Math.abs(material.emissiveIntensity - pulse - glowTarget) > 0.004;
      if (settling || shouldPulse) invalidate();
    }
    // Faded organs must not hide the selected one behind them.
    const solid = material.opacity > 0.98;
    material.transparent = !solid;
    material.depthWrite = solid;
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > DRAG_TOLERANCE) return;
    e.stopPropagation();
    const { selectedOrganId, select } = useBodySelectionStore.getState();
    if (selectedOrganId === organ.meshName) select(null);
    else select(regionId, organ.meshName);
  };

  return (
    <group matrix={matrix} matrixAutoUpdate={false}>
      <mesh
        name={organ.meshName}
        geometry={geometry}
        renderOrder={isFocus ? 2 : 1}
        onClick={handleClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          useBodySelectionStore.getState().hover(regionId, organ.meshName);
        }}
        onPointerOut={() => {
          const { hoveredOrganId, hover } = useBodySelectionStore.getState();
          if (hoveredOrganId === organ.meshName) hover(null);
        }}
      >
        <meshStandardMaterial
          ref={materialRef}
          color={surface}
          emissive={emissive}
          emissiveIntensity={glowTarget}
          roughness={0.45}
          metalness={0.15}
          // Some source organs are built from several shells whose
          // inner walls face inwards; one-sided drawing leaves holes.
          side={DoubleSide}
        />
      </mesh>
      <mesh geometry={geometry} renderOrder={3} raycast={() => null}>
        <shaderMaterial ref={haloRef} args={[haloParameters]} />
      </mesh>
    </group>
  );
}
