"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  MathUtils,
  Vector3,
  type Group,
  type MeshBasicMaterial,
} from "three";
import type { Anchor } from "./BodyModel";
import { HOLO_BLUE, HOLO_CYAN } from "./holoMaterial";

/** Each ring: size relative to the organ, fixed tilt, spin speed (rad/s). */
const RINGS = [
  { size: 1.25, tilt: [Math.PI / 2, 0, 0], speed: 0.55 },
  { size: 1.45, tilt: [Math.PI / 2.6, 0.5, 0], speed: -0.4 },
  { size: 1.65, tilt: [Math.PI / 1.7, -0.6, 0], speed: 0.28 },
] as const;

interface OrbitalRingsProps {
  /** The selected organ/region, or `null` when nothing is selected. */
  focus: Anchor | null;
  reducedMotion: boolean;
}

/**
 * Three thin broken rings orbiting the selected organ. One instance for
 * the whole scene: on a switch it glides from the old organ to the new
 * one instead of being torn down, and it fades out when the selection
 * is cleared. Static (no spin, no glide) under reduced motion.
 */
export function OrbitalRings({ focus, reducedMotion }: OrbitalRingsProps) {
  const invalidate = useThree((s) => s.invalidate);
  const groupRef = useRef<Group>(null);
  const ringRefs = useRef<(Group | null)[]>([]);
  const materialRefs = useRef<(MeshBasicMaterial | null)[]>([]);
  const goal = useRef(new Vector3());
  const placed = useRef(false);

  useEffect(() => {
    invalidate();
  }, [focus, invalidate]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const opacityTarget = focus ? 0.9 : 0;
    if (focus) {
      goal.current.set(...focus.center);
      // First appearance: start at the organ, don't fly in from origin.
      if (!placed.current || reducedMotion) {
        group.position.copy(goal.current);
        group.scale.setScalar(focus.radius);
        placed.current = true;
      } else {
        const t = 1 - Math.exp(-6 * delta);
        group.position.lerp(goal.current, t);
        group.scale.setScalar(
          MathUtils.damp(group.scale.x, focus.radius, 6, delta),
        );
      }
    }
    let visible = false;
    materialRefs.current.forEach((material, i) => {
      if (!material) return;
      material.opacity = reducedMotion
        ? opacityTarget * (1 - i * 0.2)
        : MathUtils.damp(
            material.opacity,
            opacityTarget * (1 - i * 0.2),
            6,
            delta,
          );
      if (material.opacity > 0.01) visible = true;
      const ring = ringRefs.current[i];
      if (ring && !reducedMotion) ring.rotation.z += RINGS[i].speed * delta;
    });
    group.visible = visible;
    if (!visible) placed.current = false;
    if (visible && !reducedMotion) invalidate();
  });

  return (
    <group ref={groupRef} visible={false}>
      {RINGS.map((ring, i) => (
        <group key={ring.size} rotation={ring.tilt}>
          <group
            ref={(node) => {
              ringRefs.current[i] = node;
            }}
          >
            <mesh renderOrder={7} raycast={() => null}>
              {/* Arc shorter than a full turn: a gap that shows the spin. */}
              <torusGeometry
                args={[ring.size, 0.007, 6, 96, Math.PI * (1.55 - i * 0.2)]}
              />
              <meshBasicMaterial
                ref={(node) => {
                  materialRefs.current[i] = node;
                }}
                color={i === 1 ? HOLO_BLUE : HOLO_CYAN}
                transparent
                opacity={0}
                depthTest={false}
                depthWrite={false}
                blending={AdditiveBlending}
              />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

const SWEEP_SECONDS = 4.5;
const SWEEP_PAUSE_SECONDS = 5.5;
const SWEEP_TOP = 1.9;

/**
 * A slow scan line that climbs the body every few seconds: a thin ring
 * here plus a bright band on the body shell (which reads `scanYRef`).
 * Purely decorative, so it is switched off under reduced motion.
 */
export function ScanSweep({
  scanYRef,
  reducedMotion,
}: {
  scanYRef: RefObject<number>;
  reducedMotion: boolean;
}) {
  const ringRef = useRef<Group>(null);
  useFrame((state) => {
    const ring = ringRef.current;
    if (!ring) return;
    const phase =
      state.clock.elapsedTime % (SWEEP_SECONDS + SWEEP_PAUSE_SECONDS);
    const sweeping = !reducedMotion && phase < SWEEP_SECONDS;
    ring.visible = sweeping;
    if (sweeping) {
      const y = MathUtils.smootherstep(phase / SWEEP_SECONDS, 0, 1) * SWEEP_TOP;
      ring.position.y = y;
      scanYRef.current = y;
    } else {
      scanYRef.current = -100;
    }
  });
  return (
    <group ref={ringRef} visible={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[0.44, 0.447, 96]} />
        <meshBasicMaterial
          color={HOLO_CYAN}
          transparent
          opacity={0.55}
          depthWrite={false}
          blending={AdditiveBlending}
          side={2}
        />
      </mesh>
    </group>
  );
}

/** The platform under the feet: a polar grid and two slow rings. */
export function HoloFloor({ reducedMotion }: { reducedMotion: boolean }) {
  const outerRef = useRef<Group>(null);
  const innerRef = useRef<Group>(null);
  useFrame((_, delta) => {
    if (reducedMotion) return;
    if (outerRef.current) outerRef.current.rotation.z += 0.12 * delta;
    if (innerRef.current) innerRef.current.rotation.z -= 0.2 * delta;
  });
  return (
    <group position={[0, -0.005, 0]}>
      <polarGridHelper
        args={[0.95, 16, 5, 96, "#22d3ee", "#1e5a7a"]}
        material-transparent
        material-opacity={0.22}
        material-depthWrite={false}
      />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <group ref={outerRef}>
          <mesh raycast={() => null}>
            <ringGeometry args={[1.02, 1.035, 128, 1, 0, Math.PI * 1.7]} />
            <meshBasicMaterial
              color={HOLO_CYAN}
              transparent
              opacity={0.5}
              depthWrite={false}
              blending={AdditiveBlending}
              side={2}
            />
          </mesh>
        </group>
        <group ref={innerRef}>
          <mesh raycast={() => null}>
            <ringGeometry args={[0.52, 0.53, 96, 1, 0, Math.PI * 1.3]} />
            <meshBasicMaterial
              color={HOLO_BLUE}
              transparent
              opacity={0.45}
              depthWrite={false}
              blending={AdditiveBlending}
              side={2}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}
