import { MeshAttachment, type Spine } from "@esotericsoftware/spine-pixi-v8";
import type { Graphics } from "pixi.js";

/**
 * Tool overlay draw helpers. Each takes the per-frame Graphics (already parented
 * to the Spine) and the live Spine, and draws in skeleton space. spine-pixi-v8
 * already reports bone/vertex world coordinates in the Spine's local pixi space
 * (Y-down: head is negative, feet ~0), which is exactly the space the parented
 * overlay Graphics draws in - so no axis flip is needed (Y = 1).
 */

const Y = 1;

/** Distinct, stable-ish hue per bone index, as a pixi color number. */
function boneColor(index: number): number {
  if (index < 0) return 0x8bd3ff; // rigid / single-bound vertex
  const hue = (index * 47) % 360;
  return hslToHex(hue, 70, 62);
}

function hslToHex(h: number, s: number, l: number): number {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const r = Math.round(f(0) * 255);
  const g = Math.round(f(8) * 255);
  const b = Math.round(f(4) * 255);
  return (r << 16) | (g << 8) | b;
}

/** Half-width of a bone's base as a fraction of its length (needle aspect). */
const BONE_BASE_FRAC = 0.06;
const BONE_HALFW_MIN = 1.2;
const BONE_HALFW_MAX = 10;
const BONE_PIVOT_R = 3.5;

/**
 * Draw one bone the way Spine (and most rigs) show them: an elongated,
 * needle-like isosceles triangle from a wide base at the origin tapering to a
 * sharp apex at the bone's tip, with a small filled pivot circle at the origin.
 * Base half-width scales with length (~6%) so the triangle is ~8x longer than
 * wide, clamped so tiny/huge bones stay legible.
 */
function drawBone(g: Graphics, ox: number, oy: number, tx: number, ty: number, color: number): void {
  const dx = tx - ox;
  const dy = ty - oy;
  const len = Math.hypot(dx, dy);
  if (len > 0.001) {
    // unit direction + perpendicular; base sits AT the origin, apex at the tip
    const ux = dx / len;
    const uy = dy / len;
    const halfW = Math.max(BONE_HALFW_MIN, Math.min(BONE_HALFW_MAX, len * BONE_BASE_FRAC));
    const px = -uy * halfW;
    const py = ux * halfW;
    g.poly([ox + px, (oy + py) * Y, tx, ty * Y, ox - px, (oy - py) * Y])
      .fill({ color, alpha: 0.28 })
      .stroke({ width: 1, color, alpha: 0.9 });
  }
  // pivot / origin
  g.circle(ox, oy * Y, BONE_PIVOT_R).fill({ color, alpha: 0.95 });
  g.circle(ox, oy * Y, BONE_PIVOT_R).stroke({ width: 1, color: 0x151515, alpha: 0.9 });
}

/** A dimmer bone (outline + pivot only) for context behind another overlay. */
function drawBoneFaint(g: Graphics, ox: number, oy: number, tx: number, ty: number, color: number): void {
  const dx = tx - ox;
  const dy = ty - oy;
  const len = Math.hypot(dx, dy);
  if (len > 0.001) {
    const ux = dx / len;
    const uy = dy / len;
    const halfW = Math.max(BONE_HALFW_MIN, Math.min(BONE_HALFW_MAX, len * BONE_BASE_FRAC));
    const px = -uy * halfW;
    const py = ux * halfW;
    g.poly([ox + px, (oy + py) * Y, tx, ty * Y, ox - px, (oy - py) * Y])
      .fill({ color, alpha: 0.12 })
      .stroke({ width: 1, color, alpha: 0.55 });
  }
  g.circle(ox, oy * Y, BONE_PIVOT_R).fill({ color, alpha: 0.7 });
}

/** Draw the skeleton's bones as needle triangles + pivots - the standard view. */
export function drawBones(g: Graphics, spine: Spine): void {
  const { bones } = spine.skeleton;
  for (let i = 0; i < bones.length; i++) {
    const bone = bones[i];
    const len = bone.data.length || 0;
    drawBone(g, bone.worldX, bone.worldY, bone.worldX + bone.a * len, bone.worldY + bone.c * len, boneColor(i));
  }
}

export interface MeshEntry {
  slotIndex: number;
  slotName: string;
  attachmentName: string;
  /** vertex count, handy for the list */
  vertices: number;
  weighted: boolean;
}

/** Every mesh attachment currently on the skeleton (reflects the active skin). */
export function listMeshAttachments(spine: Spine): MeshEntry[] {
  const out: MeshEntry[] = [];
  const slots = spine.skeleton.slots;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const att = slot.getAttachment();
    if (att instanceof MeshAttachment) {
      out.push({
        slotIndex: i,
        slotName: slot.data.name,
        attachmentName: att.name,
        vertices: att.worldVerticesLength / 2,
        weighted: !!att.bones,
      });
    }
  }
  return out;
}

interface VertexWeight {
  domBone: number;
  domWeight: number;
}

/** Per-vertex dominant bone + weight, parsed from spine's packed weight arrays. */
function perVertexWeights(att: MeshAttachment, count: number): VertexWeight[] {
  const bones = att.bones;
  const vertices = att.vertices;
  const result: VertexWeight[] = [];

  if (!bones) {
    // rigid mesh: every vertex bound to the slot bone, uniform weight
    for (let i = 0; i < count; i++) result.push({ domBone: -1, domWeight: 1 });
    return result;
  }

  let v = 0; // index into bones[]
  let w = 0; // index into vertices[]
  for (let i = 0; i < count; i++) {
    const n = bones[v++];
    let domBone = -1;
    let domWeight = -1;
    for (let k = 0; k < n; k++) {
      const boneIdx = bones[v++];
      w += 2; // skip local x,y
      const weight = vertices[w++];
      if (weight > domWeight) {
        domWeight = weight;
        domBone = boneIdx;
      }
    }
    result.push({ domBone, domWeight: Math.max(0, domWeight) });
  }
  return result;
}

/** The skeleton bone indices a mesh's weights reference (empty for rigid). */
function affectingBones(att: MeshAttachment): number[] {
  const bones = att.bones;
  if (!bones) return [];
  const set = new Set<number>();
  let v = 0;
  const count = att.worldVerticesLength / 2;
  for (let i = 0; i < count; i++) {
    const n = bones[v++];
    for (let k = 0; k < n; k++) {
      set.add(bones[v]);
      v += 1; // bone index; the x,y,weight triples live in att.vertices, not here
    }
  }
  return [...set];
}

/**
 * Build a per-frame overlay that highlights one mesh: the bones that drive it
 * (drawn faded, each in its own colour) behind its deformed wireframe, plus
 * vertices coloured by their dominant bone and sized by weight - so a vertex
 * tinted like a bone is read as bound to that bone. Spine's weight view, live.
 */
export function makeMeshDraw(slotIndex: number) {
  return (g: Graphics, spine: Spine): void => {
    const slot = spine.skeleton.slots[slotIndex];
    if (!slot) return;
    const att = slot.getAttachment();
    if (!(att instanceof MeshAttachment)) return;

    // affecting bones first, faded, colour-matched to the weight vertices
    const skelBones = spine.skeleton.bones;
    const boneIdxs = affectingBones(att);
    if (boneIdxs.length > 0) {
      for (const bi of boneIdxs) {
        const b = skelBones[bi];
        if (!b) continue;
        const len = b.data.length || 0;
        drawBoneFaint(g, b.worldX, b.worldY, b.worldX + b.a * len, b.worldY + b.c * len, boneColor(bi));
      }
    } else if (slot.bone) {
      // rigid mesh: bound to the slot's bone, shown in the rigid colour
      const b = slot.bone;
      const len = b.data.length || 0;
      drawBoneFaint(g, b.worldX, b.worldY, b.worldX + b.a * len, b.worldY + b.c * len, boneColor(-1));
    }

    const n = att.worldVerticesLength;
    const world = new Float32Array(n);
    att.computeWorldVertices(slot, 0, n, world, 0, 2);
    const count = n / 2;

    // wireframe from triangles
    const tris = att.triangles;
    for (let i = 0; i < tris.length; i += 3) {
      const a = tris[i] * 2;
      const b = tris[i + 1] * 2;
      const c = tris[i + 2] * 2;
      g.moveTo(world[a], world[a + 1] * Y)
        .lineTo(world[b], world[b + 1] * Y)
        .lineTo(world[c], world[c + 1] * Y)
        .lineTo(world[a], world[a + 1] * Y)
        .stroke({ width: 1, color: 0xcfcfcf, alpha: 0.38 });
    }

    // weight-colored vertices
    const weights = perVertexWeights(att, count);
    for (let i = 0; i < count; i++) {
      const x = world[i * 2];
      const y = world[i * 2 + 1] * Y;
      const vw = weights[i];
      const r = 2.2 + vw.domWeight * 3;
      g.circle(x, y, r).fill({ color: boneColor(vw.domBone), alpha: 0.95 });
    }
  };
}
