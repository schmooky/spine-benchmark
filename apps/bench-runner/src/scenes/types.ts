/**
 * Scene descriptor: a faithful-enough reconstruction of how a real game puts
 * its spines on screen, so the benchmark measures real usage instead of tiled
 * clones. Authored per game/state (base / bonus / big-win). The reconstructor
 * ({@link buildScene}) renders one of these into a single stage container and
 * uniform-"contain"-fits the WHOLE composition to the viewport (goal: 100%
 * visible on any device, never cropped).
 */

/** One spine placed at explicit reference-space coordinates. */
export interface Placement {
  /** Stable id (for logging / report). */
  id: string;
  /** repo-relative skeleton path under /games (served from public). */
  skel: string;
  /** repo-relative atlas path under /games. */
  atlas: string;
  /** reference-space position (design px), origin = scene center. */
  x: number;
  y: number;
  /** extra uniform scale on top of the scene fit. */
  scale?: number;
  /** animation to play (looped); falls back to the first animation. */
  anim?: string;
  loop?: boolean;
}

/** A reel grid filled with the game's real symbol spines. */
export interface GridSpec {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  /** per-symbol scale. */
  scale?: number;
  /** grid center in reference space. */
  x: number;
  y: number;
  /** symbol spines cycled across the grid cells. */
  symbols: { skel: string; atlas: string }[];
  /** idle animation name symbols loop (randomized trackTime per cell). */
  idleAnim?: string;
  /** win animation name; cells in {@link winCells} play this looped if the
   * symbol has it (else fall back to idle). Exercises the heavier win path. */
  winAnim?: string;
  /** cells that form a winning line and play {@link winAnim}. [col,row] pairs. */
  winCells?: [number, number][];
}

export type ImpactTier = "low" | "moderate" | "high" | "very-high" | "mixed";

export interface SceneDescriptor {
  id: string;
  game: string;
  /** e.g. "base" | "bonus" | "big-win" | synthetic tier name. */
  state: string;
  /** human description of what's playing, for the server report. */
  description: string;
  /** design reference resolution the coordinates are authored in. */
  refWidth: number;
  refHeight: number;
  /** far-back layers (background spine, ambience) drawn first. */
  background: Placement[];
  /** optional reel grid. */
  grid?: GridSpec;
  /** overlays drawn on top (announcers, FX, logo, characters). */
  overlays: Placement[];
  /** authored/estimated impact tier for scheduling a spread. */
  tier?: ImpactTier;
}
