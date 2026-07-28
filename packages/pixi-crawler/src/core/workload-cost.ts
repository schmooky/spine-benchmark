import type { FrameRecord } from "../types";

import {
  type DeviceTier,
  type DeviceTierConfig,
  computeTier,
  resolveCeiling,
} from "./device-tier";
import { StatsAggregator } from "./stats";

/**
 * Workload-Cost - an OPEN device- and game-independent measure of scene heaviness for
 * slot games on PixiJS.
 *
 * NOT an fps prediction (cost = abstract fixed units, not ms on your hardware).
 * NOT a 0-100 score against a guessed norm (there is no per-game budget/norm in the core).
 *
 *   cost = sum weight[d] * value[d]        // open, monotonic, no saturation
 *
 *  - value[d] is a workload counter (device-invariant), a p95/mean aggregate over the window.
 *  - weight[d] is a FIXED unit-cost (ms-beta of a reference device as the unit basis, not
 *    an on-device ms prediction). One set, not per-game.
 *  - The same scene -> the same number on any hardware / in any game. Magnitudes are comparable
 *    across games (cross-game) and devices. 10x workload -> 10x cost (no clamp).
 *
 * Derived (like StatsAggregator): does not mutate Crawler/FrameRecord, zero
 * cost, reads only FrameRecord -> reproducible from raw_frames offline.
 *
 * The real slowdown (drop/p95 ms) is device-dependent -> `device`, SEPARATELY, not in cost.
 *
 * The UX 'fits / does not' status comes from device-tier (`tier`, via config.deviceKey/ceiling),
 * NOT the core. The manual per-game `threshold` was removed - the tier subsumed it (see device-tier.ts).
 *
 * NOTE: NOT orthogonal to gpuCost on `filterPasses`: a filter burns BOTH CPU (push/pop/applyFilter
 * JS) AND GPU (pass) -> `filterPasses` appears in BOTH measures with different weights. Do not add
 * cost+gpuCost as a "full price" - filterPasses would be counted twice.
 *
 * NOTE: `texUploadBytes`/`bufferBytes` are aggregated p95 - this is EVENT bandwidth (upload/
 * reel-swap), ~0 in steady animation; p95 catches swap spikes. Cost transiently
 * rises on swap frames (which genuinely are heavier) - that is the event's bandwidth price, not
 * sustained scene-heaviness. Keep in mind when comparing scenes in different phases.
 */

export type WorkloadDriverName =
  | "drawCalls"
  | "batchBreaks"
  | "rebuilds"
  | "instructions"
  | "renderGroupsRebuilt"
  | "stateChanges"
  | "shaderCompiles"
  | "bufferBytes"
  | "texUploadBytes"
  | "activeTextures"
  | "filterPasses"
  | "spineBones"
  | "spineInstances"
  // Clean set (no ortho-conflict with gpuCost): per-call upload overhead +
  // incremental update work. Weights are UNCALIBRATED priors until the sweep.
  | "bufferUploads"
  | "texUploads"
  | "renderablesUpdated";

export interface WorkloadDriver {
  name: WorkloadDriverName;
  /** Driver aggregate over the window: p95 (large) / mean (small integer). */
  value: number;
  aggregation: "p95" | "mean";
  /** Fixed unit-cost. */
  weight: number;
  /** weight*value - the driver's contribution to cost. */
  contribution: number;
}

export interface WorkloadCost {
  /** sum of contribution - the open measure in fixed units (device+game independent). */
  cost: number;
  /** Drivers desc by contribution (worst-first). */
  drivers: WorkloadDriver[];
  /** The driver with the max contribution. */
  bottleneck: WorkloadDriverName;
  /** Device-tier (UX layer): cost vs per-device ceiling. Present iff a ceiling
   *  resolves (config.ceiling or config.deviceKey). Does NOT affect cost. */
  tier?: DeviceTier;
  /** A device-dependent REAL indicator - outside the measure. */
  device: { dropRate: number; frameP95Ms: number; framesAveraged: number };
}

export interface WorkloadCostConfig extends DeviceTierConfig {
  enabled?: boolean;
  /** Override for the fixed unit-cost weights. */
  weights?: Partial<Record<WorkloadDriverName, number>>;
}

// Fixed unit-cost weights (ms-beta of a reference device as the UNIT basis - not an ms
// prediction; see weight calibration in scripts/calibrate-budget.mjs). One set for all slots.
// Findings: draws/instr are CPU+GPU cheap; activeTextures ~free per-frame; spine cost is
// mostly per-INSTANCE (pipe overhead). shaderCompiles - a spike prior.
// FIXED PRIORS (NOT regression-fitted): drivers with an unreliable beta -
//  - spike/bursty (shaderCompiles/rebuilds/renderGroupsRebuilt): compile/rebuild
//    co-occur with load spikes -> beta confounded;
//  - sparse/low-variance (batchBreaks): barely varies in the sweep (mean 2.4,
//    p50=0, corr with cost ~0.05) -> fitted beta=1.05 is an OVERFIT on noise (NOT fill-coupling:
//    corr(breaks,gpu)=0.08). Physically a break ~= +1 draw + a state change ~= ~2.8x
//    drawCalls -> a prior of 0.04, not 1.05.
// Recalibration (`--unit-weights`) MUST preserve these priors, not overwrite them with fitted
// noise (KEEP IN SYNC with FIXED_PRIORS in scripts/calibrate-budget.mjs).
export const WORKLOAD_FIXED_PRIORS: Partial<
  Record<WorkloadDriverName, number>
> = {
  batchBreaks: 0.04,
  rebuilds: 0.05,
  renderGroupsRebuilt: 0.05,
  shaderCompiles: 2.0,
};

// PER-UNIT cost: cost += weight*value(raw counter). The fitted part is grounded
// `--unit-weights sweep-dump.json` (betaEff target cpu+gpu, real-GPU, ms/unit);
// priors above. stateChanges 0 (no signal). Findings: spine cost is per-INSTANCE
// (0.038), NOT per-bone (spineBones beta<=0->0; bones move Ticker.shared cpu, not the
// cpu+gpu render window - cross-ticker). NOTE COVERAGE GAP: fill/overdraw is NOT covered
// (no counter; corr of all drivers with gpu is low -> fill cost is unmodeled).
// cost is honest for draw/state/spine/bandwidth, BLIND to fill - do not compare scenes with
// different fill at equal counters. Overridable via config.weights.
//
// The 'clean set' (bufferUploads/texUploads/renderablesUpdated) - axes WITHOUT an ortho-conflict
// with gpuCost (per-call upload overhead, separate from bufferBytes/texUploadBytes; +
// incremental update work, the device-invariant twin of updateRenderablesMs).
// Weights CALIBRATED via the sweep.ts knobs viewChurn/bufUpload/texUpload - MEAN of 2 runs
// (2026-06-03, ~1752+1761f, --unit-weights, betaEff cpu+gpu = ms/unit; reproducible +-5%).
// NOTE: other weights were NOT overwritten by these runs' betaEff: the new knobs are collinear with draws ->
// drawCalls jumps 0.0003<->0.0086, spineInstances->0 (regression split + spine cross-ticker),
// which would regress the curated weights. A FULL recalibration is a separate multi-run.
export const WORKLOAD_WEIGHTS: Record<WorkloadDriverName, number> = {
  drawCalls: 0.0144,
  instructions: 0.00188,
  stateChanges: 0,
  bufferBytes: 3.37e-7,
  texUploadBytes: 7.72e-7,
  activeTextures: 0.00178,
  filterPasses: 0.0639,
  spineBones: 0,
  spineInstances: 0.0383,
  bufferUploads: 0.034, // CALIBRATED ms/call (gl.bufferData/SubData) - 2-run mean
  texUploads: 0.0295, // CALIBRATED ms/call (texImage2D, 128² canvas re-upload) - 2-run mean
  renderablesUpdated: 0.000595, // CALIBRATED ms/incremental updateRenderable (< instructions) - 2-run mean
  ...WORKLOAD_FIXED_PRIORS,
} as Record<WorkloadDriverName, number>;

// Small integer counters -> mean aggregate (p95 quantizes in steps).
const MEAN_DRIVERS: ReadonlySet<WorkloadDriverName> =
  new Set<WorkloadDriverName>([
    "shaderCompiles",
    "rebuilds",
    "renderGroupsRebuilt",
    "filterPasses",
    "spineInstances",
  ]);

type Accessor = (f: FrameRecord) => number | undefined;

// Conditional (filter/spine) -> undefined when the subsystem is absent -> the driver drops out.
const ACCESSORS: Record<WorkloadDriverName, Accessor> = {
  drawCalls: (f) => f.counters.drawCalls,
  batchBreaks: (f) => f.counters.batchBreaks,
  rebuilds: (f) => f.counters.rebuilds,
  instructions: (f) => f.counters.instructions,
  renderGroupsRebuilt: (f) => f.counters.renderGroupsRebuilt,
  stateChanges: (f) => f.counters.stateChanges,
  shaderCompiles: (f) => f.counters.shaderCompiles,
  bufferBytes: (f) => f.counters.bufferBytesUploaded,
  texUploadBytes: (f) => f.textures.bytesUploadedThisFrame,
  activeTextures: (f) => f.textures.activeGpuCount,
  filterPasses: (f) => f.filter?.passes,
  spineBones: (f) => f.spine?.structure.totalBones,
  spineInstances: (f) => f.spine?.instanceCount,
  bufferUploads: (f) => f.counters.bufferUploads, // gl.bufferData/SubData call count
  texUploads: (f) => f.textures.realGpuUploadsThisFrame, // texImage2D call count
  renderablesUpdated: (f) => f.counters.renderablesUpdated,
};

const DRIVER_NAMES = Object.keys(ACCESSORS) as WorkloadDriverName[];

export interface ComputeWorkloadCostOpts {
  config?: WorkloadCostConfig;
  windowFrames?: number;
}

export function computeWorkloadCost(
  frames: readonly FrameRecord[],
  opts: ComputeWorkloadCostOpts = {}
): WorkloadCost | undefined {
  const usable = frames.length > 1 ? frames.slice(0, -1) : frames;
  if (usable.length < 2) return undefined;

  const window =
    opts.windowFrames !== undefined
      ? usable.slice(Math.max(0, usable.length - opts.windowFrames))
      : usable;
  const stats = new StatsAggregator({ getFrames: () => window });
  const weights = { ...WORKLOAD_WEIGHTS, ...opts.config?.weights };

  const drivers: WorkloadDriver[] = [];
  for (const name of DRIVER_NAMES) {
    const w = weights[name];
    if (!(w > 0)) continue; // zero weight (dropped/disabled) -> not in the measure
    const q = stats.quantiles(ACCESSORS[name]);
    if (!q) continue; // subsystem not active
    const aggregation = MEAN_DRIVERS.has(name) ? "mean" : "p95";
    const value = aggregation === "mean" ? q.avg : q.p95;
    drivers.push({
      name,
      value,
      aggregation,
      weight: w,
      contribution: w * value,
    });
  }
  if (drivers.length === 0) return undefined;

  const cost = drivers.reduce((s, d) => s + d.contribution, 0);
  drivers.sort((a, b) => b.contribution - a.contribution);
  const bottleneck = drivers[0]!.name;

  let dropped = 0;
  for (const f of window) if (f.frameDropped) dropped++;
  const rafQ = stats.quantiles((f) =>
    f.rafDeltaMs > 0 ? f.rafDeltaMs : undefined
  );

  const out: WorkloadCost = {
    cost: +cost.toFixed(3),
    drivers,
    bottleneck,
    device: {
      dropRate: dropped / window.length,
      frameP95Ms: rafQ?.p95 ?? 0,
      framesAveraged: window.length,
    },
  };

  const ceiling = resolveCeiling(opts.config);
  if (ceiling !== undefined) out.tier = computeTier(cost, ceiling, opts.config);

  return out;
}
