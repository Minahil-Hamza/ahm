"use client";

import { Suspense, useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import {
  Box3,
  Sphere,
  Vector3,
  type BufferGeometry,
  type Matrix4,
  type Mesh,
  type Object3D,
  type ShaderMaterial,
} from "three";
import type { Status } from "@/config/thresholds";
import { findOrgan, type BodyOrgan } from "@/config/bodyParts";
import { CanvasErrorBoundary } from "./CanvasErrorBoundary";
import { ProceduralBodyModel } from "./ProceduralBodyModel";
import { OrganMesh } from "./OrganMesh";
import { holoMaterialParameters, HOLO_BLUE } from "./holoMaterial";

const GLB_PATH = "/models/body.glb";

/** Draco decoder served from this app (`public/draco/`, copied from the
 * `three` package), never from a CDN. drei's default is a gstatic.com URL,
 * which would break offline use. `body.glb` is Draco-compressed. */
const DRACO_DECODER_PATH = "/draco/";

/** The box every body is fitted to, so marker positions in
 * `config/bodyParts.ts` and the camera in `CameraRig` mean the same thing
 * for any model: about 1.85 units tall, feet at y = 0, centred on x/z. */
const MODEL_HEIGHT = 1.85;

/** Where something is in fitted model space, and how big it is. */
export interface Anchor {
  center: [number, number, number];
  radius: number;
}

/** Keyed by region id (`region_*`: all its organs together) and by organ
 * mesh name (`organ_*`). The two id spaces don't overlap. */
export type Anchors = Record<string, Anchor>;

export type ModelKind = "anatomical" | "procedural";

interface OrganEntry {
  regionId: string;
  organ: BodyOrgan;
  geometry: BufferGeometry;
  matrix: Matrix4;
}

interface ShellEntry {
  key: string;
  geometry: BufferGeometry;
  matrix: Matrix4;
}

interface FittedModel {
  scale: number;
  offset: [number, number, number];
  organs: OrganEntry[];
  shells: ShellEntry[];
  anchors: Anchors;
}

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

/** Sorts the loaded meshes into organs (name listed in
 * `config/bodyParts.ts`) and shell (everything else, e.g. `body_skin`),
 * fits the model to the standard box and measures every organ. */
function fitModel(scene: Object3D): FittedModel {
  scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const scale = size.y > 0 ? MODEL_HEIGHT / size.y : 1;
  const offset: [number, number, number] = [
    -center.x * scale,
    -box.min.y * scale,
    -center.z * scale,
  ];

  const organs: OrganEntry[] = [];
  const shells: ShellEntry[] = [];
  const regionBoxes = new Map<string, Box3>();
  const anchors: Anchors = {};
  const toAnchor = (b: Box3): Anchor => {
    const sphere = b.getBoundingSphere(new Sphere());
    return {
      center: [
        sphere.center.x * scale + offset[0],
        sphere.center.y * scale + offset[1],
        sphere.center.z * scale + offset[2],
      ],
      radius: sphere.radius * scale,
    };
  };

  scene.traverse((object) => {
    if (!isMesh(object)) return;
    const match = findOrgan(object.name);
    if (!match) {
      shells.push({
        key: object.uuid,
        geometry: object.geometry,
        matrix: object.matrixWorld,
      });
      return;
    }
    organs.push({
      regionId: match.region.id,
      organ: match.organ,
      geometry: object.geometry,
      matrix: object.matrixWorld,
    });
    const organBox = new Box3().setFromObject(object);
    anchors[match.organ.meshName] = toAnchor(organBox);
    const regionBox = regionBoxes.get(match.region.id);
    if (regionBox) regionBox.union(organBox);
    else regionBoxes.set(match.region.id, organBox.clone());
  });
  for (const [regionId, regionBox] of regionBoxes) {
    anchors[regionId] = toAnchor(regionBox);
  }
  return { scale, offset, organs, shells, anchors };
}

interface BodyModelProps {
  statuses: Record<string, Status | null>;
  reducedMotion: boolean;
  /** Current height of the scan sweep (world y), written by `ScanSweep`. */
  scanYRef: RefObject<number>;
  /** Called once the body is on screen, with the anchors found in it
   * (none for the procedural body). */
  onReady: (kind: ModelKind, anchors: Anchors) => void;
}

/** The see-through body surface. Never takes clicks, so the organs
 * inside stay pickable. Geometry belongs to drei's GLTF cache (reused on
 * the next visit); the material is made here and disposed by R3F. */
function ShellMesh({
  shell,
  scanYRef,
}: {
  shell: ShellEntry;
  scanYRef: RefObject<number>;
}) {
  const materialRef = useRef<ShaderMaterial>(null);
  const parameters = useMemo(
    () =>
      holoMaterialParameters({
        color: HOLO_BLUE,
        opacity: 0.38,
        power: 2.6,
        base: 0.035,
      }),
    [],
  );
  useFrame(() => {
    const material = materialRef.current;
    if (material) material.uniforms.uScanY.value = scanYRef.current;
  });
  return (
    <mesh
      geometry={shell.geometry}
      matrix={shell.matrix}
      matrixAutoUpdate={false}
      renderOrder={4}
      raycast={() => null}
    >
      <shaderMaterial ref={materialRef} args={[parameters]} />
    </mesh>
  );
}

function AnatomicalBody({
  statuses,
  reducedMotion,
  scanYRef,
  onReady,
}: BodyModelProps) {
  const { scene } = useGLTF(GLB_PATH, DRACO_DECODER_PATH);
  const fitted = useMemo(() => fitModel(scene), [scene]);

  useEffect(() => {
    onReady("anatomical", fitted.anchors);
  }, [fitted, onReady]);

  return (
    <group position={fitted.offset} scale={fitted.scale}>
      {fitted.shells.map((shell) => (
        <ShellMesh key={shell.key} shell={shell} scanYRef={scanYRef} />
      ))}
      {fitted.organs.map((entry) => (
        <OrganMesh
          key={entry.organ.meshName}
          geometry={entry.geometry}
          matrix={entry.matrix}
          regionId={entry.regionId}
          organ={entry.organ}
          status={statuses[entry.regionId] ?? null}
          reducedMotion={reducedMotion}
        />
      ))}
    </group>
  );
}

function ProceduralBody({ onReady }: Pick<BodyModelProps, "onReady">) {
  useEffect(() => {
    onReady("procedural", {});
  }, [onReady]);
  return <ProceduralBodyModel />;
}

/**
 * The body itself. Loads `public/models/body.glb` (built from
 * BodyParts3D by `scripts/body-model/build.mjs`, see README for the
 * licence) and turns every mesh named after an organ in
 * `config/bodyParts.ts` into a separately pickable `OrganMesh`; every
 * other mesh is drawn as the see-through shell.
 *
 * Swapping the model touches only this file and `config/bodyParts.ts`:
 * - any size/origin works: the model is fitted to one standard box;
 * - Draco or Meshopt compression: both decoders are local;
 * - organs are matched by mesh name; a region whose organs are missing
 *   from the model gets a marker at its configured position instead
 *   (`RegionHotspot`), so an unsegmented model still works.
 *
 * If the file is missing or broken, `useGLTF` throws, the error boundary
 * catches it and the primitive body is shown with markers for every
 * region: same-origin and offline-safe either way.
 */
export function BodyModel(props: BodyModelProps) {
  return (
    <CanvasErrorBoundary fallback={<ProceduralBody onReady={props.onReady} />}>
      <Suspense fallback={null}>
        <AnatomicalBody {...props} />
      </Suspense>
    </CanvasErrorBoundary>
  );
}
