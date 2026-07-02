// Frame-partition palette, shared by the HUD bars and the inspector timeline.
// Lives in shared/ (not features/hud/) so both features can read it without a
// cross-feature import - see feature-isolation in .dependency-cruiser.cjs.
//
// Muted, low-saturation tones: distinguishable enough to read a stacked bar at
// a glance, calm enough to sit over a live scene without shouting. No neon.
// The pixi sub-phases share one blue-grey family so the drill-down reads as a
// single cluster; pre/spine/gpu/overrun each get their own restrained hue.
export const COLOR_PRE = "#8b93a6"; // cpu pre-work - muted slate
export const COLOR_PIXI = "#6f8fa6"; // pixi render - muted steel blue
export const COLOR_SPINE = "#b58c78"; // spine - muted clay
export const COLOR_GPU = "#bba676"; // gpu - muted sand
export const COLOR_OVERRUN = "#c07f77"; // over budget - muted rose (not red)
export const COLOR_PIXI_BOILER = "#5f7488"; // pixi sub-phases: one blue-grey
export const COLOR_PIXI_XFORM = "#8aa4b8"; //   family, ramped by lightness so
export const COLOR_PIXI_BUILD = "#6f8fa6"; //   the breakdown stays cohesive
export const COLOR_PIXI_EXEC = "#7d9cb2";
export const COLOR_PIXI_OTHER = "#556775";
export const COLOR_PIXI_GC = "#a4936c"; // gc - muted warm grey
