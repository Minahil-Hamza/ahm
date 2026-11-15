import { describe, expect, it } from "vitest";
import { BODY_PARTS, findOrgan, getBodyPart } from "@/config/bodyParts";
import { getIndicatorConfig } from "@/config/thresholds";
import { isSymptomId } from "@/config/symptoms";

describe("BODY_PARTS", () => {
  it("has unique ids", () => {
    const ids = BODY_PARTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only references real config/thresholds.ts indicator ids", () => {
    for (const region of BODY_PARTS) {
      for (const indicatorId of region.indicators) {
        expect(
          getIndicatorConfig(indicatorId),
          `${region.id} references unknown indicator "${indicatorId}"`,
        ).toBeDefined();
      }
    }
  });

  it("only references real config/symptoms.ts symptom ids", () => {
    for (const region of BODY_PARTS) {
      for (const symptom of region.symptoms) {
        expect(
          isSymptomId(symptom),
          `${region.id} references unknown symptom "${symptom}"`,
        ).toBe(true);
      }
    }
  });

  it("gives every region at least one hazard, function text, and effect text", () => {
    for (const region of BODY_PARTS) {
      expect(region.hazards.length).toBeGreaterThan(0);
      expect(region.functionText.length).toBeGreaterThan(0);
      expect(region.spaceEffectText.length).toBeGreaterThan(0);
    }
  });

  it("gives every organ a unique mesh name and every region a source link", () => {
    const meshNames = BODY_PARTS.flatMap((r) =>
      r.organs.map((o) => o.meshName),
    );
    expect(new Set(meshNames).size).toBe(meshNames.length);
    for (const name of meshNames) expect(name).toMatch(/^organ_[a-z_]+$/);
    for (const region of BODY_PARTS) {
      for (const organ of region.organs) {
        expect(organ.label.length).toBeGreaterThan(0);
        expect(findOrgan(organ.meshName)?.region.id).toBe(region.id);
      }
      expect(region.sources.length).toBeGreaterThan(0);
      for (const source of region.sources) {
        expect(source.label.length).toBeGreaterThan(0);
        expect(source.url).toMatch(/^https:\/\/www\.nasa\.gov\//);
      }
    }
  });

  it("maps the organs the 3D model must expose to a region", () => {
    for (const name of [
      "organ_brain",
      "organ_heart",
      "organ_lung_left",
      "organ_lung_right",
      "organ_liver",
      "organ_stomach",
      "organ_kidney_left",
      "organ_kidney_right",
      "organ_small_intestine",
      "organ_large_intestine",
    ]) {
      expect(findOrgan(name), name).toBeDefined();
    }
    expect(findOrgan("organ_liver")?.region.id).toBe("region_gut");
  });

  it("links the kidneys to the hydration / water intake indicator", () => {
    const kidneys = getBodyPart("region_kidneys");
    expect(kidneys?.indicators).toEqual(["water_ml"]);
    expect(kidneys?.spaceEffectText).toMatch(/kidney stones/);
    expect(kidneys?.spaceEffectText).toMatch(/[Dd]ehydration/);
  });

  it("has no separate liver region (the liver mesh opens the Gut panel)", () => {
    expect(getBodyPart("region_liver")).toBeUndefined();
  });
});

describe("getBodyPart", () => {
  it("finds a region by id", () => {
    expect(getBodyPart("region_heart")?.label).toBe("Heart");
  });

  it("returns undefined for an unknown id", () => {
    expect(getBodyPart("region_nonexistent")).toBeUndefined();
  });
});
