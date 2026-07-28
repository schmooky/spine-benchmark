/**
 * Geometric coverage/overdraw estimation from the posed skeleton's draw order.
 *
 * Replaces the GL-readback overdraw proxy, which was structurally broken for
 * Spine: it looked at pixi CHILDREN (a Spine renders attachments internally
 * and has none, so the proxy returned 1 always) and its alpha readback
 * measured the coverage UNION (a 16-layer stack read identical pixels to one
 * layer). Net effect: the overdraw feature was a constant 1 in every capture,
 * the calibration fill primitives varied GPU fill 8x while producing no
 * feature that moved with it, and the fit misattributed fragment cost to
 * vertex counts.
 *
 * This estimator instead rasterizes each renderable attachment's world-space
 * AABB onto a coarse grid:
 *   - coveredKpx     = cells hit at least once (union area)
 *   - overdrawFactor = total painted area / union area  (>= 1)
 * AABBs overestimate rotated/concave shapes, but the estimate is cheap,
 * deterministic, device-independent, identical at train and predict time, and
 * - unlike the proxy - actually MOVES when layers stack.
 *
 * Areas are computed in skeleton-local px at scale 1; pass `scale` (on-screen
 * scale x renderer resolution) so coveredKpx lands in real screen kilopixels.
 */
import type { PoseCoverage, WalkableSkeleton, WalkableSlot } from "./poseFeatures.js";

interface CoverageAtt {
  worldVerticesLength?: number;
  triangles?: unknown;
  endSlot?: unknown;
  region?: unknown;
  /** VertexAttachment (mesh): (slot, start, count, out, offset, stride) */
  computeWorldVertices?: (...args: unknown[]) => void;
}

const DEFAULT_GRID = 48;

export interface CoverageEstimateOptions {
  /** on-screen scale of the skeleton (spine scale x renderer resolution).
   * Areas scale by scale^2. Default 1 (skeleton-local px). */
  scale?: number;
  /** grid resolution per axis for the union/overdraw rasterization. */
  gridSize?: number;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function attachmentBox(slot: WalkableSlot, att: CoverageAtt, scratch: number[]): Box | null {
  const fn = att.computeWorldVertices;
  if (typeof fn !== "function") return null;
  let count: number;
  try {
    if (typeof att.worldVerticesLength === "number" && Array.isArray(att.triangles)) {
      // MeshAttachment (VertexAttachment signature)
      count = att.worldVerticesLength;
      if (count < 4) return null;
      if (scratch.length < count) scratch.length = count;
      fn.call(att, slot, 0, count, scratch, 0, 2);
    } else if ("region" in att && !("worldVerticesLength" in att)) {
      // RegionAttachment signature: (slot, out, offset, stride)
      count = 8;
      if (scratch.length < count) scratch.length = count;
      fn.call(att, slot, scratch, 0, 2);
    } else {
      return null; // clipping/bounding box/path/point - renders nothing
    }
  } catch {
    return null; // unassigned sequence region etc. - skip, best effort
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i += 2) {
    const x = scratch[i];
    const y = scratch[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!(maxX > minX) || !(maxY > minY)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Estimate screen coverage + overdraw of the skeleton's CURRENT pose.
 * World transforms must be up to date (call after updateWorldTransform).
 */
export function estimatePoseCoverage(
  skeleton: WalkableSkeleton,
  opts: CoverageEstimateOptions = {},
): PoseCoverage {
  const grid = Math.max(8, opts.gridSize ?? DEFAULT_GRID);
  const scale = opts.scale ?? 1;
  const scratch: number[] = [];
  const boxes: Box[] = [];

  for (const slot of skeleton.drawOrder) {
    const att = slot.getAttachment() as CoverageAtt | null;
    if (!att) continue;
    if (slot.color.a <= 0 || !slot.bone.active) continue;
    if ("endSlot" in att) continue; // clipping mask
    const box = attachmentBox(slot, att, scratch);
    if (box) boxes.push(box);
  }
  if (boxes.length === 0) return { coveredKpx: 0, overdrawFactor: 1 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  if (!(w > 0) || !(h > 0)) return { coveredKpx: 0, overdrawFactor: 1 };

  // rasterize AABBs onto the grid, counting layers per cell
  const cellW = w / grid;
  const cellH = h / grid;
  const hits = new Uint16Array(grid * grid);
  for (const b of boxes) {
    const x0 = Math.max(0, Math.floor((b.minX - minX) / cellW));
    const x1 = Math.min(grid - 1, Math.ceil((b.maxX - minX) / cellW) - 1);
    const y0 = Math.max(0, Math.floor((b.minY - minY) / cellH));
    const y1 = Math.min(grid - 1, Math.ceil((b.maxY - minY) / cellH) - 1);
    for (let y = y0; y <= y1; y++) {
      const row = y * grid;
      for (let x = x0; x <= x1; x++) hits[row + x]++;
    }
  }

  let coveredCells = 0;
  let paintedCells = 0;
  for (let i = 0; i < hits.length; i++) {
    if (hits[i] > 0) {
      coveredCells++;
      paintedCells += hits[i];
    }
  }
  if (coveredCells === 0) return { coveredKpx: 0, overdrawFactor: 1 };

  const cellArea = cellW * cellH * scale * scale;
  const coveredPx = coveredCells * cellArea;
  const overdrawFactor = paintedCells / coveredCells;
  return {
    coveredKpx: coveredPx / 1000,
    overdrawFactor: Math.max(1, Math.round(overdrawFactor * 100) / 100),
  };
}
