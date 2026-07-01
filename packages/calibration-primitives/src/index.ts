/**
 * @module @spine-benchmark/calibration-primitives
 *
 * Procedural Spine skeletons that vary ONE cost axis at a time, so the fit in
 * @spine-benchmark/metrics-model can recover the rendering (GPU) and
 * computational (CPU) coefficients without them being tangled (the real-asset
 * "calibration" spines were contaminated and mis-graded).
 *
 * - pure fill: a stack of full-size quads -> lots of covered pixels + overdraw,
 *   a handful of bones, no constraints, no deform. Moves RI only.
 * - pure compute: a bone chain with physics/IK/transform constraints and
 *   deformed meshes, all drawn ~1px -> heavy update cost, ~zero fill. Moves CI.
 *
 * Each generator returns the three files a spine needs (skeleton .json, .atlas,
 * and a 1x1 white .png data URL) so they upload and load through the normal
 * asset pipeline with no runtime special-casing.
 */

export interface SpineFiles {
  /** skeleton JSON (stringified). */
  skeleton: string;
  /** atlas text. */
  atlas: string;
  /** 1x1 white png as a data URL. */
  pngDataUrl: string;
  /** the feature vector these files are designed to produce (ground truth). */
  expected: {
    coveredKpxAtScale1: number;
    overdrawFactor: number;
    meshes: number;
    physics: number;
    ik: number;
    transform: number;
    deformedMeshes: number;
    vertices: number;
  };
}

/** A 1x1 fully-white opaque PNG (base64). Meshes stretch this single texel. */
const WHITE_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const ATLAS = `white.png
size: 1,1
format: RGBA8888
filter: Linear,Linear
repeat: none
white
  rotate: false
  xy: 0, 0
  size: 1, 1
  orig: 1, 1
  offset: 0, 0
  index: -1
`;

function quadMesh(w: number, h: number) {
  const hw = w / 2;
  const hh = h / 2;
  return {
    type: "mesh",
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    triangles: [0, 1, 2, 2, 3, 0],
    vertices: [-hw, -hh, hw, -hh, hw, hh, -hw, hh],
    hull: 4,
    width: w,
    height: h,
  };
}

/**
 * Pure-fill primitive: `layers` stacked full-size quads. Coverage scales with
 * quad size; overdraw with the number of layers. Constraints/deform: none.
 */
export function pureFillSkeleton(opts: { layers?: number; sizePx?: number } = {}): SpineFiles {
  const layers = Math.max(1, opts.layers ?? 8);
  const size = opts.sizePx ?? 512;
  const slots = [];
  const attachments: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < layers; i++) {
    slots.push({ name: `q${i}`, bone: "root", attachment: "white" });
    attachments[`q${i}`] = { white: quadMesh(size, size) };
  }
  const skeleton = {
    skeleton: { hash: `fill-${layers}-${size}`, spine: "4.2.00", x: -size / 2, y: -size / 2, width: size, height: size },
    bones: [{ name: "root" }],
    slots,
    skins: [{ name: "default", attachments }],
    animations: { idle: {} },
  };
  return {
    skeleton: JSON.stringify(skeleton),
    atlas: ATLAS,
    pngDataUrl: WHITE_PNG_DATA_URL,
    expected: {
      coveredKpxAtScale1: (size * size) / 1000,
      overdrawFactor: layers,
      meshes: layers,
      physics: 0,
      ik: 0,
      transform: 0,
      deformedMeshes: 0,
      vertices: layers * 4,
    },
  };
}

/**
 * Pure-compute primitive: a chain of `bones` bones with physics + IK + transform
 * constraints and `deformedMeshes` tiny deformed quads (1px, off to the side so
 * fill is ~0). Moves CI, not RI.
 */
export function pureComputeSkeleton(
  opts: { bones?: number; physics?: number; ik?: number; transform?: number; deformedMeshes?: number } = {},
): SpineFiles {
  const boneCount = Math.max(2, opts.bones ?? 24);
  const physicsN = opts.physics ?? 8;
  const ikN = opts.ik ?? 4;
  const transformN = opts.transform ?? 4;
  const deformN = opts.deformedMeshes ?? 8;

  const bones: Record<string, unknown>[] = [{ name: "root" }];
  for (let i = 1; i < boneCount; i++) {
    bones.push({ name: `b${i}`, parent: i === 1 ? "root" : `b${i - 1}`, length: 20, x: 20 });
  }

  const physics = Array.from({ length: physicsN }, (_, i) => ({
    name: `phys${i}`,
    order: i,
    bone: `b${1 + (i % (boneCount - 1))}`,
    inertia: 0.8,
    strength: 80,
    damping: 0.9,
    mass: 1,
    wind: 20,
    x: 1,
    y: 1,
  }));
  const ik = Array.from({ length: ikN }, (_, i) => ({
    name: `ik${i}`,
    order: physicsN + i,
    bones: [`b${1 + (i % (boneCount - 2))}`, `b${2 + (i % (boneCount - 2))}`],
    target: "root",
  }));
  const transform = Array.from({ length: transformN }, (_, i) => ({
    name: `tr${i}`,
    order: physicsN + ikN + i,
    bones: [`b${1 + (i % (boneCount - 1))}`],
    target: "root",
    rotation: 15,
    mixRotate: 0.5,
  }));

  const slots = [];
  const attachments: Record<string, Record<string, unknown>> = {};
  const deformTimelines: Record<string, unknown> = {};
  for (let i = 0; i < deformN; i++) {
    const slot = `d${i}`;
    slots.push({ name: slot, bone: `b${1 + (i % (boneCount - 1))}`, attachment: "white" });
    attachments[slot] = { white: quadMesh(1, 1) };
    // a deform timeline makes the mesh count as "deformed" (skinning/update cost)
    deformTimelines[slot] = {
      white: [
        { time: 0, vertices: [0, 0, 0.2, 0, 0, 0.2, 0.2, 0.2] },
        { time: 0.5, vertices: [0, 0, -0.2, 0, 0, -0.2, -0.2, -0.2] },
        { time: 1, vertices: [0, 0, 0.2, 0, 0, 0.2, 0.2, 0.2] },
      ],
    };
  }

  const skeleton = {
    skeleton: { hash: `compute-${boneCount}`, spine: "4.2.00", x: -2, y: -2, width: 4, height: 4 },
    bones,
    slots,
    ...(physicsN ? { physics } : {}),
    ...(ikN ? { ik } : {}),
    ...(transformN ? { transform } : {}),
    skins: [{ name: "default", attachments }],
    animations: { idle: { deform: { default: deformTimelines } } },
  };
  return {
    skeleton: JSON.stringify(skeleton),
    atlas: ATLAS,
    pngDataUrl: WHITE_PNG_DATA_URL,
    expected: {
      coveredKpxAtScale1: (deformN * 1) / 1000,
      overdrawFactor: 1,
      meshes: deformN,
      physics: physicsN,
      ik: ikN,
      transform: transformN,
      deformedMeshes: deformN,
      vertices: deformN * 4,
    },
  };
}

/** The calibration set: a spread of fill and compute dial settings. */
export function calibrationSet(): { id: string; kind: "fill" | "compute"; files: SpineFiles }[] {
  return [
    { id: "calib-fill-light", kind: "fill", files: pureFillSkeleton({ layers: 2, sizePx: 512 }) },
    { id: "calib-fill-heavy", kind: "fill", files: pureFillSkeleton({ layers: 16, sizePx: 768 }) },
    { id: "calib-compute-light", kind: "compute", files: pureComputeSkeleton({ bones: 12, physics: 4, ik: 2, transform: 2, deformedMeshes: 4 }) },
    { id: "calib-compute-heavy", kind: "compute", files: pureComputeSkeleton({ bones: 48, physics: 24, ik: 8, transform: 8, deformedMeshes: 16 }) },
  ];
}
