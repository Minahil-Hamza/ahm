import {
  AdditiveBlending,
  Color,
  DoubleSide,
  type ShaderMaterialParameters,
} from "three";

/** Cyan/turquoise accent used for hover, selection and the scene chrome.
 * Status colours are never replaced by it: they come from the rule
 * engine's result via `resolveStatusColor`. */
export const HOLO_CYAN = "#5eead4";
export const HOLO_BLUE = "#38bdf8";

interface HoloMaterialOptions {
  color: string;
  /** Overall strength, 0 to 1. Animated through `uniforms.uOpacity`. */
  opacity: number;
  /** Rim falloff: higher = thinner edge glow. */
  power?: number;
  /** Constant fill added to the rim term (0 = edges only). */
  base?: number;
  /** Pushes vertices out along their normal (model units), to draw a
   * halo just outside another mesh that shares the geometry. */
  inflate?: number;
}

/**
 * Additive "hologram" surface: bright where it turns away from the
 * camera (fresnel rim), nearly clear face-on, plus an optional bright
 * band at world height `uScanY` (the scan sweep). No textures, so
 * nothing to fetch. Returns constructor parameters for
 * `<shaderMaterial args={[...]} />`, so React Three Fiber owns the
 * material and disposes it on unmount.
 */
export function holoMaterialParameters({
  color,
  opacity,
  power = 2.2,
  base = 0.04,
  inflate = 0,
}: HoloMaterialOptions): ShaderMaterialParameters {
  return {
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: {
      uColor: { value: new Color(color) },
      uOpacity: { value: opacity },
      uPower: { value: power },
      uBase: { value: base },
      uInflate: { value: inflate },
      uScanY: { value: -100 },
    },
    vertexShader: /* glsl */ `
      uniform float uInflate;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vWorldY;
      void main() {
        vec4 world = modelMatrix * vec4(position + normal * uInflate, 1.0);
        vWorldY = world.y;
        vec4 mv = viewMatrix * world;
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uPower;
      uniform float uBase;
      uniform float uScanY;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vWorldY;
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float rim = pow(1.0 - facing, uPower);
        float scan = smoothstep(0.05, 0.0, abs(vWorldY - uScanY));
        float alpha = (uBase + rim) * uOpacity + scan * 0.45 * uOpacity;
        gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 1.0));
      }
    `,
  };
}
