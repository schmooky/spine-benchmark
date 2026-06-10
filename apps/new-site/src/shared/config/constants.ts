/** Minimum time the loader spinner stays visible so background work has room
 *  to breathe and the transition never feels jarringly instant. */
export const MIN_LOAD_MS = 1100;

/** Duration of the materialize (dissolve-in) shader sweep. */
export const MATERIALIZE_MS = 1000;

/** Pixel grid spacing in world pixels (skeleton is spawned at scale 1, so one
 *  minor cell === one skeleton pixel * MINOR). */
export const GRID_MINOR = 20;
export const GRID_MAJOR = 100;
