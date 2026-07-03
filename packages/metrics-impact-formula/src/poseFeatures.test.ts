import { describe, it, expect } from "vitest";
import {
  extractPoseFeatures,
  poseImpact,
  type WalkableSkeleton,
  type WalkableSlot,
} from "./poseFeatures.js";
import { estimatePoseCoverage } from "./coverageEstimate.js";

/**
 * These tests PIN the canonical walk semantics (ADR 0002: every path must
 * produce identical features for the same pose). The fixtures duck-type the
 * spine-core 4.x structural shapes the walker discriminates on.
 */

const PAGE_A = { name: "a.png" };
const PAGE_B = { name: "b.png" };

function meshAtt(verts: number, opts: { weighted?: boolean; page?: unknown } = {}) {
  return {
    worldVerticesLength: verts * 2,
    triangles: [0, 1, 2],
    region: { page: opts.page ?? PAGE_A },
    bones: opts.weighted ? { length: 3 } : null,
    computeWorldVertices(_slot: unknown, _start: number, count: number, out: number[]) {
      for (let i = 0; i < count; i += 2) {
        out[i] = (i % 20) * 10;
        out[i + 1] = i;
      }
    },
  };
}

function regionAtt(opts: { page?: unknown; box?: [number, number, number, number] } = {}) {
  const [x0, y0, x1, y1] = opts.box ?? [0, 0, 100, 100];
  return {
    region: "page" in opts ? { page: opts.page } : { page: PAGE_A },
    computeWorldVertices(_slot: unknown, out: number[]) {
      out[0] = x0; out[1] = y0;
      out[2] = x1; out[3] = y0;
      out[4] = x1; out[5] = y1;
      out[6] = x0; out[7] = y1;
    },
  };
}

function clippingAtt() {
  return { worldVerticesLength: 8, endSlot: {} };
}

function boundingBoxAtt() {
  return { worldVerticesLength: 12 }; // VertexAttachment, no triangles
}

function slot(att: unknown, opts: { alpha?: number; blend?: number; deform?: number; boneActive?: boolean } = {}): WalkableSlot {
  return {
    color: { a: opts.alpha ?? 1 },
    bone: { active: opts.boneActive ?? true },
    deform: { length: opts.deform ?? 0 },
    data: { blendMode: opts.blend ?? 0 },
    getAttachment: () => att,
  };
}

function skel(drawOrder: WalkableSlot[], constraints: Partial<Record<"ik" | "transform" | "path" | "physics", number>> = {}): WalkableSkeleton {
  const list = (n = 0) => Array.from({ length: n }, () => ({ active: true }));
  return {
    drawOrder,
    ikConstraints: list(constraints.ik),
    transformConstraints: list(constraints.transform),
    pathConstraints: list(constraints.path),
    physicsConstraints: list(constraints.physics),
  };
}

describe("extractPoseFeatures - canonical walk", () => {
  it("counts region/sequence quads as 4 vertices (the dropped-vertex bug)", () => {
    const f = extractPoseFeatures(skel([slot(regionAtt()), slot(regionAtt()), slot(regionAtt()), slot(regionAtt())]));
    expect(f.vertices).toBe(16);
    expect(f.meshes).toBe(0);
  });

  it("counts mesh vertices as worldVerticesLength/2 and flags weighted/deformed", () => {
    const f = extractPoseFeatures(
      skel([slot(meshAtt(30, { weighted: true }), { deform: 5 }), slot(meshAtt(10))]),
    );
    expect(f.vertices).toBe(40);
    expect(f.meshes).toBe(2);
    expect(f.weightedMeshes).toBe(1);
    expect(f.deformedMeshes).toBe(1);
  });

  it("ignores invisible slots, inactive bones, and non-renderables", () => {
    const f = extractPoseFeatures(
      skel([
        slot(regionAtt(), { alpha: 0 }),
        slot(meshAtt(50), { boneActive: false }),
        slot(boundingBoxAtt(), { blend: 2 }),
        slot(null),
      ]),
    );
    expect(f.vertices).toBe(0);
    expect(f.nonNormalBlends).toBe(0); // bounding box never counts blends
    expect(f.drawCallEst).toBe(0);
  });

  it("counts clipping masks and excludes them from everything else", () => {
    const f = extractPoseFeatures(skel([slot(clippingAtt(), { blend: 3 }), slot(regionAtt())]));
    expect(f.clippingMasks).toBe(1);
    expect(f.nonNormalBlends).toBe(0);
    expect(f.vertices).toBe(4);
  });

  it("drawCallEst breaks on page change AND blend change, not on pageless attachments", () => {
    const f = extractPoseFeatures(
      skel([
        slot(regionAtt({ page: PAGE_A })),
        slot(regionAtt({ page: PAGE_A })), // same batch
        slot(regionAtt({ page: PAGE_B })), // page break -> 2
        slot(regionAtt({ page: PAGE_B }), { blend: 1 }), // blend break -> 3
        slot(regionAtt({ page: null })), // unassigned sequence: no break
        slot(regionAtt({ page: PAGE_B }), { blend: 1 }), // same page+blend as last paged
      ]),
    );
    expect(f.drawCallEst).toBe(3);
  });

  it("counts active constraints per type", () => {
    const f = extractPoseFeatures(skel([], { ik: 2, transform: 1, path: 3, physics: 4 }));
    expect(f.ik).toBe(2);
    expect(f.transform).toBe(1);
    expect(f.path).toBe(3);
    expect(f.physics).toBe(4);
  });

  it("tolerates skeletons without physicsConstraints (spine-core < 4.2)", () => {
    const s = skel([slot(regionAtt())]);
    delete (s as { physicsConstraints?: unknown }).physicsConstraints;
    expect(extractPoseFeatures(s).physics).toBe(0);
  });
});

describe("poseImpact", () => {
  it("scores features through the canonical formulas (region-only skeleton is nonzero)", () => {
    const r = poseImpact(skel([slot(regionAtt()), slot(regionAtt(), { blend: 2 })]));
    expect(r.features.vertices).toBe(8);
    expect(r.ri).toBeGreaterThan(0);
    expect(r.total).toBe(r.ri + r.ci);
  });
});

describe("estimatePoseCoverage", () => {
  it("two fully-overlapping quads read overdraw ~2, union area of one", () => {
    const c = estimatePoseCoverage(
      skel([slot(regionAtt({ box: [0, 0, 100, 100] })), slot(regionAtt({ box: [0, 0, 100, 100] }))]),
    );
    expect(c.overdrawFactor).toBeCloseTo(2, 1);
    expect(c.coveredKpx).toBeCloseTo(10, 0); // 100x100 px = 10 kpx
  });

  it("disjoint quads read overdraw ~1 and sum their areas", () => {
    const c = estimatePoseCoverage(
      skel([slot(regionAtt({ box: [0, 0, 100, 100] })), slot(regionAtt({ box: [200, 0, 300, 100] }))]),
    );
    expect(c.overdrawFactor).toBeLessThan(1.2);
    expect(c.coveredKpx).toBeGreaterThan(15);
    expect(c.coveredKpx).toBeLessThan(25);
  });

  it("a 8-layer stack moves the feature 4x vs a 2-layer stack (the calib-fill axis)", () => {
    const layers = (n: number) =>
      estimatePoseCoverage(skel(Array.from({ length: n }, () => slot(regionAtt({ box: [0, 0, 100, 100] })))));
    const light = layers(2);
    const heavy = layers(8);
    expect(heavy.overdrawFactor / light.overdrawFactor).toBeCloseTo(4, 1);
  });

  it("applies screen scale as area (scale^2) and returns identity for empty skeletons", () => {
    const base = estimatePoseCoverage(skel([slot(regionAtt({ box: [0, 0, 100, 100] }))]));
    const scaled = estimatePoseCoverage(skel([slot(regionAtt({ box: [0, 0, 100, 100] }))]), { scale: 2 });
    expect(scaled.coveredKpx / base.coveredKpx).toBeCloseTo(4, 1);
    expect(estimatePoseCoverage(skel([]))).toEqual({ coveredKpx: 0, overdrawFactor: 1 });
  });
});
