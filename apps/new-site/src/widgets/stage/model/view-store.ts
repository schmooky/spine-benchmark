import { create } from "zustand";

/** Camera zoom, mirrored out of the imperative StageController so the view
 *  controls can show a live percentage. The controller is the source of truth;
 *  this is a read model. */
interface ViewState {
  zoom: number;
  setZoom: (zoom: number) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  zoom: 1,
  setZoom: (zoom) => set({ zoom }),
}));
