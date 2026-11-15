"use client";

import { useEffect, useRef, type ComponentRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { MathUtils, Vector3, type PerspectiveCamera } from "three";
import type { Anchor } from "./BodyModel";

/** Whole-body home view (the fitted body is 1.85 units tall). */
export const HOME_CAMERA_POSITION: [number, number, number] = [0, 1.05, 3.3];
const HOME_POSITION = new Vector3(...HOME_CAMERA_POSITION);
const HOME_TARGET = new Vector3(0, 0.93, 0);

export type OrbitControlsRef = ComponentRef<typeof OrbitControls>;

interface CameraRigProps {
  controlsRef: RefObject<OrbitControlsRef | null>;
  /** What to look at, or `null` for the whole body. */
  focus: Anchor | null;
  /** Side to approach the focus from. */
  view: "front" | "back";
  /** Bumped by "Reset view" so the rig re-homes even when the selection
   * itself doesn't change (nothing was selected to begin with). */
  resetToken: number;
  /** Shifts the picture left by this many CSS px, so the focus sits in
   * the part of the stage that an open side panel doesn't cover. */
  viewShiftPx: number;
  reducedMotion: boolean;
}

/**
 * Flies the camera to the selected organ and back (SPEC §8.3 screen 3).
 * Frame-rate independent easing; under `frameloop="demand"` it only asks
 * for frames while in flight, snaps in one frame under
 * `prefers-reduced-motion`, and lets go the moment the user starts to
 * orbit by hand.
 */
export function CameraRig({
  controlsRef,
  focus,
  view,
  resetToken,
  viewShiftPx,
  reducedMotion,
}: CameraRigProps) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const goalPosition = useRef(HOME_POSITION.clone());
  const goalTarget = useRef(HOME_TARGET.clone());
  const flying = useRef(false);
  const shift = useRef(0);

  useEffect(() => {
    if (focus) {
      const [x, y, z] = focus.center;
      // Far enough to frame the organ with room for its rings.
      const distance = MathUtils.clamp(focus.radius * 4.2, 0.7, 1.7);
      const direction = new Vector3(
        x * 1.4,
        0.22,
        view === "back" ? -1 : 1,
      ).normalize();
      goalTarget.current.set(x, y, z);
      goalPosition.current
        .copy(goalTarget.current)
        .addScaledVector(direction, distance);
    } else {
      goalPosition.current.copy(HOME_POSITION);
      goalTarget.current.copy(HOME_TARGET);
    }
    flying.current = true;
    invalidate();
    // resetToken is a deliberate dependency: bumping it re-homes the
    // camera even when the focus is unchanged (already null).
  }, [focus, view, resetToken, invalidate]);

  // Manual orbit/zoom always wins over an in-progress flight.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const stop = () => {
      flying.current = false;
    };
    controls.addEventListener("start", stop);
    return () => controls.removeEventListener("start", stop);
  }, [controlsRef]);

  useEffect(() => {
    invalidate();
  }, [viewShiftPx, size, invalidate]);

  useEffect(
    () => () => {
      camera.clearViewOffset();
    },
    [camera],
  );

  useFrame((_, delta) => {
    // Side-panel offset.
    const nextShift = reducedMotion
      ? viewShiftPx
      : MathUtils.damp(shift.current, viewShiftPx, 5, delta);
    const shifting = Math.abs(nextShift - viewShiftPx) > 0.5;
    shift.current = shifting ? nextShift : viewShiftPx;
    if (Math.abs(shift.current) < 0.5) camera.clearViewOffset();
    else
      camera.setViewOffset(
        size.width,
        size.height,
        shift.current,
        0,
        size.width,
        size.height,
      );
    if (shifting) invalidate();

    if (!flying.current) return;
    const controls = controlsRef.current;
    const t = reducedMotion ? 1 : 1 - Math.exp(-4.2 * delta);
    camera.position.lerp(goalPosition.current, t);
    controls?.target.lerp(goalTarget.current, t);
    const arrived =
      camera.position.distanceTo(goalPosition.current) < 0.004 &&
      (!controls || controls.target.distanceTo(goalTarget.current) < 0.004);
    if (arrived || reducedMotion) {
      camera.position.copy(goalPosition.current);
      controls?.target.copy(goalTarget.current);
      flying.current = false;
    } else {
      invalidate();
    }
    controls?.update();
  });

  return null;
}
