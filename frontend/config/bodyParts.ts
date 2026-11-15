import type { Hazard } from "./thresholds";
import type { ActionCategory } from "@/lib/rules/types";
import type { SymptomId } from "./symptoms";
import {
  HAZARD_SOURCES,
  RISK_SOURCES,
  type SourceLink,
} from "@/content/sources";

/**
 * Per-region content for the 3D body (SPEC §8.3 screen 3's region-mapping
 * table and `BodyPartPanel` bullets). `indicators`/`symptoms` are a literal
 * reading of that table — only real `config/thresholds.ts` indicator ids
 * and real `config/symptoms.ts` symptom ids, nothing invented. Regions the
 * table gives no real indicator (`region_brain`, `region_eyes`,
 * `region_skin`) stay "No data yet" for their colour/value until a
 * symptom is actually reported — this app doesn't turn a reported symptom
 * into a status colour on its own (see docs/DECISIONS.md).
 *
 * `region_kidneys` is not in the SPEC table; it was added on request and
 * is fed by the real `water_ml` (hydration / water intake) indicator.
 *
 * Regions vs organs: a REGION is the unit the app has content and data
 * for (the SPEC table). An ORGAN is one named mesh in
 * `public/models/body.glb`. Every organ is separately hoverable and
 * clickable in 3D and belongs to exactly one region, whose panel it
 * opens — e.g. the liver, stomach, pancreas and intestines all open the
 * Gut panel. There is deliberately no separate `region_liver`: the SPEC
 * has no liver indicator or liver text, and none is invented here.
 * Regions with no organ mesh (`region_mind`, `region_muscles`,
 * `region_skin`) are shown as a marker at `hotspot.position`.
 *
 * All `functionText` / `spaceEffectText` is written in our own words; the
 * `sources` links (SPEC Appendix E) are where the background comes from.
 */
export interface BodyOrgan {
  /** Exact name of the mesh inside `public/models/body.glb`. Also the
   * organ's id in the selection store. */
  meshName: string;
  label: string;
}

export interface BodyPart {
  id: string;
  label: string;
  /** The organ meshes in `public/models/body.glb` that belong to this
   * region (SPEC §8.3: "separately named meshes per region"). Organs
   * missing from the loaded model are skipped; a region left with none
   * falls back to a marker at `hotspot.position`. */
  organs: BodyOrgan[];
  /** Marker position for a region with no organ mesh in the loaded
   * model. Model space: about 1.85 units tall, feet at y = 0, facing +z
   * (a GLB is auto-fitted to the same box). */
  hotspot: { position: [number, number, number]; radius: number };
  /** Side the camera approaches from when this region is selected.
   * Defaults to "front". */
  view?: "front" | "back";
  /** Position as a percentage of `Body2DFallback`'s viewBox. */
  position2d: [number, number];
  /** Real `config/thresholds.ts` indicator ids this region's status/value
   * comes from. */
  indicators: string[];
  /** Real `config/symptoms.ts` symptom ids relevant to this region, for
   * "related symptoms reported recently" — independent of `indicators`;
   * reporting one of these does not by itself change the region's colour. */
  symptoms: SymptomId[];
  hazards: Hazard[];
  /** Which of the rule engine's `Action.category` values count as "what to
   * do now" for this region (the engine doesn't tag actions by body
   * region itself — see docs/DECISIONS.md). */
  actionCategories: ActionCategory[];
  functionText: string;
  spaceEffectText: string;
  /** SPEC §E.5: "every ... body-region panel has a Sources list with the
   * exact links used". */
  sources: SourceLink[];
}

export const BODY_PARTS: BodyPart[] = [
  {
    id: "region_brain",
    label: "Head / Brain",
    organs: [{ meshName: "organ_brain", label: "Brain" }],
    hotspot: { position: [0, 1.74, 0.06], radius: 0.09 },
    position2d: [50, 8],
    indicators: [],
    symptoms: ["headache", "dizziness", "difficulty_concentrating"],
    hazards: ["closed_environment", "gravity"],
    actionCategories: ["rest", "measure", "medical"],
    functionText:
      "Houses the brain, which coordinates balance, thinking, and the senses.",
    spaceEffectText:
      "Fluid shifts in microgravity and cabin CO2 build-up can cause headaches, dizziness, and trouble concentrating, especially early in a mission.",
    sources: [
      RISK_SOURCES[2],
      RISK_SOURCES[6],
      HAZARD_SOURCES.closed_environment,
    ],
  },
  {
    id: "region_eyes",
    label: "Eyes",
    organs: [{ meshName: "organ_eyes", label: "Eyes" }],
    hotspot: { position: [0, 1.71, 0.14], radius: 0.04 },
    position2d: [50, 11],
    indicators: [],
    symptoms: ["vision_changes", "eye_pain"],
    hazards: ["gravity", "radiation"],
    actionCategories: ["measure", "medical"],
    functionText: "The eyes sense light and send visual signals to the brain.",
    spaceEffectText:
      "Fluid shift in microgravity can change eye pressure and shape over a long mission; radiation is an added long-term risk.",
    sources: [RISK_SOURCES[10], HAZARD_SOURCES.gravity],
  },
  {
    id: "region_mind",
    label: "Mind",
    organs: [],
    hotspot: { position: [0.2, 1.8, 0], radius: 0.045 },
    position2d: [58, 6],
    indicators: ["mood", "sleep_hours"],
    symptoms: ["low_mood", "anxiety"],
    hazards: ["isolation"],
    actionCategories: ["mental", "rest"],
    functionText: "Mood, sleep, and stress reflect overall behavioural health.",
    spaceEffectText:
      "Isolation, confinement, and distance from Earth and family can affect mood, sleep, and how the crew works together.",
    sources: [
      RISK_SOURCES[12],
      RISK_SOURCES[13],
      RISK_SOURCES[14],
      HAZARD_SOURCES.isolation,
    ],
  },
  {
    id: "region_heart",
    label: "Heart",
    organs: [{ meshName: "organ_heart", label: "Heart" }],
    hotspot: { position: [-0.1, 1.35, 0.23], radius: 0.09 },
    position2d: [44, 28],
    indicators: ["heart_rate", "bp_systolic", "bp_diastolic"],
    symptoms: ["chest_pain", "palpitations"],
    hazards: ["gravity", "radiation"],
    actionCategories: ["measure", "medical", "rest"],
    functionText:
      "The heart pumps blood to carry oxygen and nutrients around the body.",
    spaceEffectText:
      "Microgravity shifts fluid toward the chest and head, and the heart does less work against gravity, which can change heart rate and blood pressure over time.",
    sources: [RISK_SOURCES[3], HAZARD_SOURCES.gravity],
  },
  {
    id: "region_lungs",
    label: "Lungs",
    organs: [
      { meshName: "organ_lung_left", label: "Left lung" },
      { meshName: "organ_lung_right", label: "Right lung" },
      { meshName: "organ_trachea", label: "Windpipe" },
    ],
    hotspot: { position: [0.1, 1.3, 0.2], radius: 0.11 },
    position2d: [58, 27],
    indicators: ["spo2"],
    symptoms: ["shortness_of_breath", "cough_sore_throat"],
    hazards: ["closed_environment"],
    actionCategories: ["measure", "medical", "environment"],
    functionText:
      "The lungs take in oxygen and remove carbon dioxide from the blood.",
    spaceEffectText:
      "Cabin air quality, including CO2 build-up, can affect breathing and blood oxygen levels in a closed habitat.",
    sources: [
      RISK_SOURCES[6],
      RISK_SOURCES[4],
      HAZARD_SOURCES.closed_environment,
    ],
  },
  {
    id: "region_immune",
    label: "Immune system",
    organs: [
      { meshName: "organ_spleen", label: "Spleen" },
      { meshName: "organ_thymus", label: "Thymus" },
    ],
    hotspot: { position: [0.16, 1.45, 0.18], radius: 0.06 },
    position2d: [62, 20],
    indicators: ["temperature_c"],
    symptoms: ["fever_chills"],
    hazards: ["radiation", "isolation", "closed_environment"],
    actionCategories: ["medical", "measure", "rest"],
    functionText:
      "The immune system defends the body against infection and illness.",
    spaceEffectText:
      "Radiation, stress, and a closed habitat environment can change how the immune system responds, affecting temperature regulation and infection risk.",
    sources: [RISK_SOURCES[1], RISK_SOURCES[16], HAZARD_SOURCES.radiation],
  },
  {
    id: "region_gut",
    label: "Gut",
    organs: [
      { meshName: "organ_stomach", label: "Stomach" },
      { meshName: "organ_liver", label: "Liver" },
      { meshName: "organ_pancreas", label: "Pancreas" },
      { meshName: "organ_small_intestine", label: "Small intestine" },
      { meshName: "organ_large_intestine", label: "Large intestine" },
    ],
    hotspot: { position: [0, 1.0, 0.22], radius: 0.1 },
    position2d: [50, 40],
    indicators: ["glucose_mgdl"],
    symptoms: ["nausea_vomiting", "abdominal_pain", "loss_of_appetite"],
    hazards: ["closed_environment", "gravity"],
    actionCategories: ["nutrition", "hydration", "measure"],
    functionText:
      "The digestive system breaks down food and absorbs nutrients and fluids.",
    spaceEffectText:
      "Limited food variety, motion sickness early in a mission, and nutrition supply constraints can affect appetite, digestion, and blood glucose.",
    sources: [RISK_SOURCES[7], RISK_SOURCES[5]],
  },
  {
    id: "region_spine",
    label: "Bones / Spine",
    organs: [{ meshName: "organ_spine", label: "Spine" }],
    view: "back",
    hotspot: { position: [0, 1.15, -0.2], radius: 0.08 },
    position2d: [50, 34],
    indicators: ["exercise_minutes"],
    symptoms: ["back_pain"],
    hazards: ["gravity"],
    actionCategories: ["exercise", "measure", "medical"],
    functionText:
      "The spine and skeleton provide structural support and protect the nervous system.",
    spaceEffectText:
      "Reduced gravity loading on bone can lead to bone density loss over a long mission; exercise and back-pain reports are the trackable proxies here.",
    sources: [RISK_SOURCES[11], RISK_SOURCES[15], HAZARD_SOURCES.gravity],
  },
  {
    id: "region_muscles",
    label: "Muscles",
    organs: [],
    hotspot: { position: [0.11, 0.72, 0.07], radius: 0.05 },
    position2d: [78, 32],
    indicators: ["exercise_minutes"],
    symptoms: ["muscle_aches"],
    hazards: ["gravity"],
    actionCategories: ["exercise", "measure"],
    functionText:
      "Muscles support movement and help maintain strength and metabolism.",
    spaceEffectText:
      "Without gravity's resistance, muscles can weaken over time; daily resistance and cardio exercise is the main protective measure.",
    sources: [RISK_SOURCES[9], RISK_SOURCES[8], HAZARD_SOURCES.gravity],
  },
  {
    id: "region_skin",
    label: "Skin",
    organs: [],
    hotspot: { position: [-0.3, 1.12, 0.03], radius: 0.045 },
    position2d: [24, 22],
    indicators: [],
    symptoms: ["rash_skin_irritation"],
    hazards: ["closed_environment", "radiation"],
    actionCategories: ["medical", "environment"],
    functionText:
      "Skin is the body's barrier against injury, infection, and fluid loss.",
    spaceEffectText:
      "The closed habitat's shared microbial environment and radiation exposure can change skin irritation and infection risk.",
    sources: [RISK_SOURCES[1], RISK_SOURCES[5]],
  },
  {
    id: "region_kidneys",
    label: "Kidneys",
    organs: [
      { meshName: "organ_kidney_left", label: "Left kidney" },
      { meshName: "organ_kidney_right", label: "Right kidney" },
    ],
    view: "back",
    hotspot: { position: [-0.13, 1.03, -0.17], radius: 0.07 },
    position2d: [36, 40],
    indicators: ["water_ml"],
    symptoms: [],
    hazards: ["gravity", "closed_environment"],
    actionCategories: ["hydration", "measure", "medical"],
    functionText:
      "The kidneys filter the blood, keep water and salts in balance, and remove waste as urine.",
    spaceEffectText:
      "In microgravity the bones give up more calcium, and it leaves the body in the urine. Drinking too little makes the urine more concentrated. Together these raise the chance of kidney stones, and dehydration is easy to miss in space, so steady daily water intake matters for the whole mission.",
    sources: [RISK_SOURCES[7], RISK_SOURCES[11], HAZARD_SOURCES.gravity],
  },
];

export function getBodyPart(id: string): BodyPart | undefined {
  return BODY_PARTS.find((r) => r.id === id);
}

/** The region an organ mesh belongs to, and the organ's own entry. */
export function findOrgan(
  meshName: string,
): { region: BodyPart; organ: BodyOrgan } | undefined {
  for (const region of BODY_PARTS) {
    const organ = region.organs.find((o) => o.meshName === meshName);
    if (organ) return { region, organ };
  }
  return undefined;
}
