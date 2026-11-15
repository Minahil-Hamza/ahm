import { create } from "zustand";

/** Selection/hover state for the 3D body screen (SPEC §8.3 screen 3:
 * "selection state lives in the Zustand store"). In-memory only — there's
 * nothing to persist across reloads here.
 *
 * One region at most is selected, so one panel at most is open. The
 * organ id (a mesh name from `config/bodyParts.ts`) says which organ of
 * that region was picked, for the highlight and the camera; it is `null`
 * when the region was chosen as a whole (region list, marker, 2D view). */
interface BodySelectionState {
  selectedRegionId: string | null;
  selectedOrganId: string | null;
  hoveredRegionId: string | null;
  hoveredOrganId: string | null;
  select: (regionId: string | null, organId?: string | null) => void;
  hover: (regionId: string | null, organId?: string | null) => void;
}

export const useBodySelectionStore = create<BodySelectionState>((set) => ({
  selectedRegionId: null,
  selectedOrganId: null,
  hoveredRegionId: null,
  hoveredOrganId: null,
  select: (regionId, organId = null) =>
    set({
      selectedRegionId: regionId,
      selectedOrganId: regionId ? organId : null,
    }),
  hover: (regionId, organId = null) =>
    set({
      hoveredRegionId: regionId,
      hoveredOrganId: regionId ? organId : null,
    }),
}));
