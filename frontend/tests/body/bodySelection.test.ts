import { beforeEach, describe, expect, it } from "vitest";
import { useBodySelectionStore } from "@/lib/store/bodySelection";

describe("useBodySelectionStore", () => {
  beforeEach(() => {
    useBodySelectionStore.getState().select(null);
    useBodySelectionStore.getState().hover(null);
  });

  it("starts with nothing selected or hovered", () => {
    const s = useBodySelectionStore.getState();
    expect(s.selectedRegionId).toBeNull();
    expect(s.selectedOrganId).toBeNull();
    expect(s.hoveredRegionId).toBeNull();
    expect(s.hoveredOrganId).toBeNull();
  });

  it("keeps exactly one selection: a new organ replaces the old one", () => {
    const { select } = useBodySelectionStore.getState();
    select("region_heart", "organ_heart");
    select("region_kidneys", "organ_kidney_left");
    const s = useBodySelectionStore.getState();
    expect(s.selectedRegionId).toBe("region_kidneys");
    expect(s.selectedOrganId).toBe("organ_kidney_left");
  });

  it("selects a whole region when no organ is given", () => {
    const { select } = useBodySelectionStore.getState();
    select("region_gut", "organ_liver");
    select("region_gut");
    const s = useBodySelectionStore.getState();
    expect(s.selectedRegionId).toBe("region_gut");
    expect(s.selectedOrganId).toBeNull();
  });

  it("clears the organ together with the region", () => {
    const { select, hover } = useBodySelectionStore.getState();
    select("region_heart", "organ_heart");
    hover("region_lungs", "organ_lung_left");
    select(null);
    hover(null);
    const s = useBodySelectionStore.getState();
    expect(s.selectedRegionId).toBeNull();
    expect(s.selectedOrganId).toBeNull();
    expect(s.hoveredRegionId).toBeNull();
    expect(s.hoveredOrganId).toBeNull();
  });
});
