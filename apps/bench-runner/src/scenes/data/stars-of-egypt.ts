import type { SceneDescriptor } from "../types";

const A = "reelnroll/stars-of-egypt/assets/spine";
const symAtlas = `${A}/symbols/1/symbols.atlas`;
const sym = (n: string) => ({ skel: `${A}/symbols/${n}.json`, atlas: symAtlas });
const mainAtlas = `${A}/main/maingame_3.atlas`;
const winAtlas = `${A}/win-announcer/1/wins.atlas`;

/** stars-of-egypt: bg (idle) + dogs + clouds, 5x4 grid of symbols, overlays. */
const background = [
  { id: "bg", skel: `${A}/main/maingame.json`, atlas: mainAtlas, x: 0, y: 0, anim: "idle" },
  { id: "clouds", skel: `${A}/main/maingame_clouds.json`, atlas: mainAtlas, x: 0, y: -120, anim: "idle" },
  { id: "dog_left", skel: `${A}/main/maingame_dog_left.json`, atlas: mainAtlas, x: -640, y: 40, anim: "idle" },
  { id: "dog_right", skel: `${A}/main/maingame_dog_right.json`, atlas: mainAtlas, x: 640, y: 40, anim: "idle" },
];

const grid = {
  cols: 5,
  rows: 4,
  cellW: 180,
  cellH: 184,
  x: 0,
  y: 40,
  symbols: ["h1", "h2", "h3", "h4", "wild", "A", "K", "Q", "J"].map(sym),
  idleAnim: "idle",
};

export const starsOfEgyptBase: SceneDescriptor = {
  id: "stars-of-egypt--base",
  game: "reelnroll/stars-of-egypt",
  state: "base",
  description:
    "Main game: animated background (idle) with left/right dogs and drifting clouds, " +
    "a 5x4 reel grid of idle symbol spines (high h1-h4, wild, low A/K/Q/J), " +
    "authored at 1920x1080, uniform-fit to viewport.",
  refWidth: 1920,
  refHeight: 1080,
  background,
  grid,
  overlays: [],
  tier: "moderate",
};

/** middle row across all 5 reels plays its win animation. */
const winLine: [number, number][] = [
  [0, 1],
  [1, 1],
  [2, 1],
  [3, 1],
  [4, 1],
];

export const starsOfEgyptBigWin: SceneDescriptor = {
  id: "stars-of-egypt--big-win",
  game: "reelnroll/stars-of-egypt",
  state: "big-win",
  description:
    "Big-win moment: base composition (bg + dogs + clouds) with a 5x4 grid where the " +
    "middle-row line of symbols plays their `win` animation (the heavier win path) while " +
    "the rest idle, and the big-win announcer spine overlaid center-screen.",
  refWidth: 1920,
  refHeight: 1080,
  background,
  grid: { ...grid, winAnim: "win", winCells: winLine },
  overlays: [
    { id: "big_win", skel: `${A}/win-announcer/big_win.json`, atlas: winAtlas, x: 0, y: -20, anim: "idle" },
  ],
  tier: "high",
};

export const starsOfEgyptScenes = [starsOfEgyptBase, starsOfEgyptBigWin];
