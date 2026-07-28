import type { FrameRecord } from "../types";

import {
  type DeviceTier,
  type DeviceTierConfig,
  computeTier,
  resolveCeiling,
} from "./device-tier";
import { StatsAggregator } from "./stats";

/**
 * GpuCost - an open measure of a scene's GPU heaviness, SYMMETRIC to cpuCost (workload-cost.ts)
 * in FORM (`sum weight*value`, no saturation), but HONEST about its incompleteness.
 *
 * The main axis is **fill** (overdraw/fill-rate, the dominant GPU load of slots:
 * glow/blur/blending), which is absent from the FrameRecord counters. It is covered via
 * scene-graph bounds: sum over visible drawable leaves of `getFastGlobalBounds().area x
 * dpr^2` = a footprint proxy (a MONOTONIC overestimate - footprint is not overdraw, the AABB and
 * alpha edges inflate it; precision is not needed, the weight normalizes the scale).
 *
 * NOTE - DIFFERENCES from cpuCost (declared):
 *  - fill is read from the LIVE stage (not from FrameRecord) -> gpuCost is NOT reproducible
 *    offline from raw_frames; fill is a snapshot at call time, filterPasses is a window.
 *  - coverage='partial': fill=bounds-proxy (not exact overdraw); particle-blind
 *    (ParticleContainer particles are not in .children -> the DFS misses them); bandwidth
 *    (texUpload/buffer) is NOT here - it is in cpuCost (no double counting).
 *  - weights are a placeholder prior until calibrated against gpuMs (Metal, phase 3). On TBDR
 *    (Mali) fill costs fundamentally differently (tile memory) -> directional, not absolute.
 *  - filterPasses is present BOTH HERE AND in cpuCost (a filter burns CPU push/pop +
 *    a GPU pass) -> the two measures are NOT orthogonal on this axis. Do not add cost+gpuCost
 *    as a "full price" - filterPasses would be counted twice.
 *
 * NOT strictly read-only: getFastGlobalBounds reads the `view.bounds` getter, which on a
 * dirty view calls `updateBounds()` + writes the cache + clears `_boundsDirty`
 * (ViewContainer.mjs). On clean bounds (stable post-render) it is read-only;
 * on a dirty view (changed after render, before our read) -> an idempotent recompute
 * (the value equals what the renderer would compute; but the cache flag is written). The walk runs
 * once per window (HUD/telemetry), not per-frame, and is wrapped in try/catch (a live tree can
 * be in a transient state: an un-rendered node without a renderGroup -> throw).
 */

export type GpuDriverName =
  | "fill"
  | "filterPasses"
  | "vertices"
  | "stencilMasks"
  | "renderTargets";

export interface GpuDriver {
  name: GpuDriverName;
  value: number;
  weight: number;
  contribution: number;
}

export interface GpuCostCoverage {
  status: "partial";
  fillKind: "bounds-proxy";
  missing: string[];
  bandwidth: "in-cpuCost";
  explains: number;
  unionNodes: number;
  screenClamped: boolean;
  boundsErrors: number;
}

export interface GpuCost {
  cost: number;
  drivers: GpuDriver[];
  bottleneck: GpuDriverName;
  fillArea: number;
  coverage: GpuCostCoverage;
  tier?: DeviceTier;
}

export interface GpuCostConfig extends DeviceTierConfig {
  enabled?: boolean;
  weights?: Partial<Record<GpuDriverName, number>>;
}

export const GPU_WEIGHTS: Record<GpuDriverName, number> = {
  fill: 4.02e-8,
  filterPasses: 0.1222,
  vertices: 1.4e-5,
  stencilMasks: 1.13e-3,
  renderTargets: 4.37e-2,
};

const GPU_COVERAGE_CONTRACT = {
  explains: 0.95,
} as const;

export interface FastBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export interface FillNode {
  localDisplayStatus?: number;
  renderPipeId?: string;
  children?: FillNode[];
  particleChildren?: unknown[];
  getFastGlobalBounds?: (
    factorRenderLayers?: boolean,
    bounds?: FastBounds
  ) => FastBounds;
}

/** Sum of ON-SCREEN footprint of visible drawable leaves x dpr^2. Read-only walk.
 *  Clamped to [0,screenW]x[0,screenH] (CSS px) -> off-screen footprint is not counted
 *  (localDisplayStatus===7 != "in frame"). screenW/H<=0 -> no clamp (screen unknown). */
export function extractFillProxy(
  root: FillNode | undefined,
  dpr: number,
  screenW: number,
  screenH: number
): {
  fillArea: number;
  particleSeen: boolean;
  unionNodes: number;
  clamped: boolean;
  boundsErrors: number;
} {
  let fillArea = 0;
  let particleSeen = false;
  let unionNodes = 0;
  let boundsErrors = 0;
  const d2 = dpr * dpr;
  const clamp = screenW > 0 && screenH > 0;

  let scratch: FastBounds | undefined;
  const visit = (n: FillNode | undefined): void => {
    if (!n) return;
    if (n.localDisplayStatus !== undefined && n.localDisplayStatus !== 7)
      return;
    if (n.particleChildren) particleSeen = true; // particles not in .children -> blind
    if (n.renderPipeId && typeof n.getFastGlobalBounds === "function") {
      if (n.children?.length) unionNodes++;

      let b: FastBounds;
      try {
        b = n.getFastGlobalBounds(false, scratch);
      } catch {
        boundsErrors++;
        return;
      }
      scratch = b; // reuse the pixi Bounds on the next leaf
      let x0 = b.minX,
        y0 = b.minY,
        x1 = b.maxX,
        y1 = b.maxY;
      if (clamp) {
        x0 = Math.max(0, x0);
        y0 = Math.max(0, y0);
        x1 = Math.min(screenW, x1);
        y1 = Math.min(screenH, y1);
      }
      const w = x1 - x0,
        h = y1 - y0;
      if (w > 0 && h > 0 && Number.isFinite(w * h)) fillArea += w * h * d2;
      return;
    }
    const ch = n.children;
    if (ch) for (let i = 0; i < ch.length; i++) visit(ch[i]);
  };
  visit(root);
  return { fillArea, particleSeen, unionNodes, clamped: clamp, boundsErrors };
}

export interface ComputeGpuCostOpts {
  config?: GpuCostConfig;
  windowFrames?: number;
}

export function computeGpuCost(
  frames: readonly FrameRecord[],
  root: FillNode | undefined,
  dpr: number,
  screenW: number,
  screenH: number,
  opts: ComputeGpuCostOpts = {}
): GpuCost | undefined {
  const usable = frames.length > 1 ? frames.slice(0, -1) : frames;
  if (usable.length < 2) return undefined;
  const window =
    opts.windowFrames !== undefined
      ? usable.slice(Math.max(0, usable.length - opts.windowFrames))
      : usable;
  const stats = new StatsAggregator({ getFrames: () => window });
  const weights = { ...GPU_WEIGHTS, ...opts.config?.weights };

  const { fillArea, particleSeen, unionNodes, clamped, boundsErrors } =
    extractFillProxy(root, dpr > 0 ? dpr : 1, screenW, screenH);

  const fpQ = stats.quantiles((f) => f.filter?.passes);
  const filterPasses = fpQ?.avg ?? 0;

  const vertQ = stats.quantiles((f) => f.counters.verticesDrawn);
  const vertices = vertQ?.p95 ?? 0;

  const smQ = stats.quantiles((f) => f.counters.stencilMaskPasses);
  const stencilMasks = smQ?.avg ?? 0;

  const rtQ = stats.quantiles((f) => f.counters.renderTargetSwitches);
  const renderTargets = rtQ?.avg ?? 0;

  const drivers: GpuDriver[] = [];
  if (weights.fill > 0 && fillArea > 0)
    drivers.push({
      name: "fill",
      value: fillArea,
      weight: weights.fill,
      contribution: weights.fill * fillArea,
    });
  if (weights.filterPasses > 0 && filterPasses > 0)
    drivers.push({
      name: "filterPasses",
      value: filterPasses,
      weight: weights.filterPasses,
      contribution: weights.filterPasses * filterPasses,
    });
  if (weights.vertices > 0 && vertices > 0)
    drivers.push({
      name: "vertices",
      value: vertices,
      weight: weights.vertices,
      contribution: weights.vertices * vertices,
    });
  if (weights.stencilMasks > 0 && stencilMasks > 0)
    drivers.push({
      name: "stencilMasks",
      value: stencilMasks,
      weight: weights.stencilMasks,
      contribution: weights.stencilMasks * stencilMasks,
    });
  if (weights.renderTargets > 0 && renderTargets > 0)
    drivers.push({
      name: "renderTargets",
      value: renderTargets,
      weight: weights.renderTargets,
      contribution: weights.renderTargets * renderTargets,
    });

  const cost = drivers.reduce((s, d) => s + d.contribution, 0);
  drivers.sort((a, b) => b.contribution - a.contribution);
  const bottleneck = drivers[0]?.name ?? "fill";

  const out: GpuCost = {
    cost: +cost.toFixed(3),
    drivers,
    bottleneck,
    fillArea: Math.round(fillArea),
    coverage: {
      status: "partial",
      fillKind: "bounds-proxy",
      missing: particleSeen ? ["particle-fill"] : [],
      bandwidth: "in-cpuCost",
      unionNodes,
      screenClamped: clamped,
      boundsErrors,
      ...GPU_COVERAGE_CONTRACT,
    },
  };

  const ceiling = resolveCeiling(opts.config, "gpuCeiling");
  if (ceiling !== undefined) out.tier = computeTier(cost, ceiling, opts.config);

  return out;
}
