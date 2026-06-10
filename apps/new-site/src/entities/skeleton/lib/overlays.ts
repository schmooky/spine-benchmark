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

/** Draw the skeleton's bones as segments + joints - the "bone structure" view. */
export function drawBones(g: Graphics, spine: Spine): void {
  const { bones } = spine.skeleton;
  for (let i = 0; i < bones.length; i++) {
    const bone = bones[i];
    const len = bone.data.length || 0;
    const x1 = bone.worldX;
    const y1 = bone.worldY;
    const color = boneColor(i);

    if (len > 0) {
      const x2 = x1 + bone.a * len;
      const y2 = y1 + bone.c * len;
      g.moveTo(x1, y1 * Y)
        .lineTo(x2, y2 * Y)
        .stroke({ width: 2, color, alpha: 0.85 });
      g.circle(x2, y2 * Y, 2).fill({ color, alpha: 0.9 });
    }
    // joint
    g.circle(x1, y1 * Y, 3.5).fill({ color: 0x1e1e1e, alpha: 1 });
    g.circle(x1, y1 * Y, 3.5).stroke({ width: 1.5, color, alpha: 1 });
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

/**
 * Build a per-frame overlay that highlights one mesh: its deformed wireframe
 * plus vertices colored by their dominant bone and sized by weight - Spine's
 * weight view, live.
 */
export function makeMeshDraw(slotIndex: number) {
  return (g: Graphics, spine: Spine): void => {
    const slot = spine.skeleton.slots[slotIndex];
    if (!slot) return;
    const att = slot.getAttachment();
    if (!(att instanceof MeshAttachment)) return;

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
        .stroke({ width: 1, color: 0x9fd2ff, alpha: 0.4 });
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
