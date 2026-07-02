import {
  RegionAttachment,
  MeshAttachment,
  type Spine,
} from "@esotericsoftware/spine-pixi-v8";

/**
 * Live draw-call analysis using the classic Spine batching model: walk the
 * current draw order and start a new batch (draw call) whenever the atlas page
 * (texture) or the blend mode changes between consecutive renderable slots.
 * Reflects the live pose, so it changes as animations swap attachments / draw
 * order. Note: this is the engine-agnostic count (one texture per batch). The
 * pixi renderer can batch several textures per GPU draw call, so the actual
 * hardware draw calls may be fewer - but this is the number that matters for
 * atlas packing and single-texture-batch runtimes.
 */

const BLEND_NAMES = ["normal", "additive", "multiply", "screen"];

export type BreakReason = "first" | "page" | "blend" | "page+blend";

export interface DrawBatch {
  index: number;
  page: string;
  blend: string;
  slots: string[];
  reason: BreakReason;
}

export interface DrawCallAnalysis {
  total: number;
  pageBreaks: number;
  blendBreaks: number;
  pages: number;
  renderedSlots: number;
  batches: DrawBatch[];
}

/** Atlas page name for a renderable attachment, or null when it isn't drawn. */
function pageOf(att: unknown): string | null {
  if (!(att instanceof RegionAttachment) && !(att instanceof MeshAttachment)) {
    return null;
  }
  const region = (att as unknown as { region?: any }).region;
  if (!region) return "unknown";
  const name = region.page?.name;
  if (typeof name === "string" && name) return name;
  const src = region.texture?.source ?? region.texture;
  if (src?.label) return String(src.label);
  if (src?.uid != null) return `texture #${src.uid}`;
  return "unknown";
}

export function analyzeDrawCalls(spine: Spine): DrawCallAnalysis {
  const drawOrder = spine.skeleton.drawOrder;
  const batches: DrawBatch[] = [];
  const pages = new Set<string>();
  let pageBreaks = 0;
  let blendBreaks = 0;
  let renderedSlots = 0;
  let current: DrawBatch | null = null;

  for (const slot of drawOrder) {
    const page = pageOf(slot.getAttachment());
    if (page == null) continue; // not drawn -> doesn't break the batch
    renderedSlots++;
    pages.add(page);
    const blend = BLEND_NAMES[slot.data.blendMode] ?? "normal";

    if (current && page === current.page && blend === current.blend) {
      current.slots.push(slot.data.name);
      continue;
    }

    let reason: BreakReason = "first";
    if (current) {
      const pageChanged: boolean = page !== current.page;
      const blendChanged: boolean = blend !== current.blend;
      reason =
        pageChanged && blendChanged
          ? "page+blend"
          : pageChanged
            ? "page"
            : "blend";
      if (pageChanged) pageBreaks++;
      if (blendChanged) blendBreaks++;
    }

    current = {
      index: batches.length,
      page,
      blend,
      slots: [slot.data.name],
      reason,
    };
    batches.push(current);
  }

  return {
    total: batches.length,
    pageBreaks,
    blendBreaks,
    pages: pages.size,
    renderedSlots,
    batches,
  };
}
