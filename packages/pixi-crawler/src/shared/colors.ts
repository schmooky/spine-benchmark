// Frame-partition palette, shared by the HUD bars and the inspector timeline.
// Lives in shared/ (not features/hud/) so both features can read it without a
// cross-feature import - see feature-isolation in .dependency-cruiser.cjs.
export const COLOR_PRE = "#8B7BE3";
export const COLOR_PIXI = "#5DA0F0";
export const COLOR_SPINE = "#E89567";
export const COLOR_GPU = "#FFB060";
export const COLOR_OVERRUN = "#FF5050";
export const COLOR_PIXI_BOILER = "#34618E";
export const COLOR_PIXI_XFORM = "#7DBBE3";
export const COLOR_PIXI_BUILD = "#4F8FCF";
export const COLOR_PIXI_EXEC = "#6DB0E8";
export const COLOR_PIXI_OTHER = "#3A6FA0";
export const COLOR_PIXI_GC = "#D9994A";
