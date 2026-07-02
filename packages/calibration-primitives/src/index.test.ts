import { describe, it, expect } from "vitest";
import { calibrationSet, pureFillSkeleton, pureComputeSkeleton } from "./index.js";

/** Structural validation of the generated Spine JSON (catches malformed
 * primitives without a browser: valid JSON, meshes well-formed, constraints
 * reference existing bones, deform timelines reference existing slots). */
function validate(skeletonJson: string) {
  const s = JSON.parse(skeletonJson);
  expect(s.skeleton?.spine).toBeTypeOf("string");
  expect(Array.isArray(s.bones)).toBe(true);
  expect(Array.isArray(s.slots)).toBe(true);
  expect(Array.isArray(s.skins)).toBe(true);

  const boneNames = new Set(s.bones.map((b: { name: string }) => b.name));
  const slotNames = new Set(s.slots.map((sl: { name: string }) => sl.name));

  // every slot's bone exists
  for (const sl of s.slots) expect(boneNames.has(sl.bone)).toBe(true);

  // meshes: uvs/vertices/triangles consistent; triangle indices in range
  const skin = s.skins[0];
  for (const [, atts] of Object.entries(skin.attachments as Record<string, Record<string, { type?: string; uvs?: number[]; vertices?: number[]; triangles?: number[] }>>)) {
    for (const [, a] of Object.entries(atts)) {
      if (a.type !== "mesh") continue;
      expect(a.uvs!.length).toBe(a.vertices!.length); // non-weighted
      const verts = a.uvs!.length / 2;
      for (const idx of a.triangles!) expect(idx).toBeLessThan(verts);
    }
  }

  // constraints reference existing bones
  for (const p of s.physics ?? []) expect(boneNames.has(p.bone)).toBe(true);
  for (const ik of s.ik ?? []) {
    for (const b of ik.bones) expect(boneNames.has(b)).toBe(true);
    expect(boneNames.has(ik.target)).toBe(true);
  }
  for (const tr of s.transform ?? []) {
    for (const b of tr.bones) expect(boneNames.has(b)).toBe(true);
  }

  // deform timelines reference existing slots
  const deform = s.animations?.idle?.deform?.default ?? {};
  for (const slot of Object.keys(deform)) expect(slotNames.has(slot)).toBe(true);
}

describe("calibration primitives", () => {
  it("pure-fill skeleton is well-formed and has no constraints", () => {
    const f = pureFillSkeleton({ layers: 8, sizePx: 512 });
    validate(f.skeleton);
    const s = JSON.parse(f.skeleton);
    expect(s.physics ?? []).toHaveLength(0);
    expect(s.ik ?? []).toHaveLength(0);
    expect(f.expected.overdrawFactor).toBe(8);
  });

  it("pure-compute skeleton has constraints + deform, tiny meshes", () => {
    const c = pureComputeSkeleton({ bones: 24, physics: 8, ik: 4, transform: 4, deformedMeshes: 8 });
    validate(c.skeleton);
    const s = JSON.parse(c.skeleton);
    expect(s.physics.length).toBe(8);
    expect(s.ik.length).toBe(4);
    expect(Object.keys(s.animations.idle.deform.default).length).toBe(8);
  });

  it("all calibrationSet() primitives validate", () => {
    for (const { files } of calibrationSet()) validate(files.skeleton);
  });
});
