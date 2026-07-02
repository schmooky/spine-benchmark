import { EventTimeline, type Spine } from "@esotericsoftware/spine-pixi-v8";

/**
 * Per-animation analysis for the Animations tool: overall stats plus a
 * keyframe-density heatmap (animated bones x time buckets). Reads straight off
 * the parsed skeleton data - every Timeline exposes its `frames` (keyframe times
 * at a `getFrameEntries()` stride) and, for bone/slot timelines, the index it
 * targets.
 */

const HEATMAP_COLS = 28;
const MAX_BONE_ROWS = 12;

export interface BoneHeatRow {
  name: string;
  buckets: number[];
  total: number;
}

export interface AnimationInfo {
  name: string;
  duration: number;
  timelineCount: number;
  keyCount: number;
  boneCount: number;
  slotCount: number;
  eventCount: number;
  /** draw-order / constraint / other non-bone, non-slot timelines present */
  hasOther: boolean;
  heat: {
    cols: number;
    max: number;
    rows: BoneHeatRow[];
    /** animated bones beyond the rows shown */
    extraBones: number;
  };
}

export function analyzeAnimations(spine: Spine): AnimationInfo[] {
  const data = spine.skeleton.data;

  return data.animations.map((anim): AnimationInfo => {
    const cols = HEATMAP_COLS;
    const dur = anim.duration || 0;
    const bucketDur = dur > 0 ? dur / cols : 1;

    const boneBuckets = new Map<number, number[]>();
    const slots = new Set<number>();
    let keyCount = 0;
    let eventCount = 0;
    let hasOther = false;

    for (const tl of anim.timelines) {
      const stride = tl.getFrameEntries();
      const frames = tl.frames;
      const frameCount = stride > 0 ? Math.floor(frames.length / stride) : 0;
      if (frameCount === 0) continue;
      keyCount += frameCount;

      const target = tl as unknown as { boneIndex?: number; slotIndex?: number };
      if (typeof target.boneIndex === "number") {
        let buckets = boneBuckets.get(target.boneIndex);
        if (!buckets) {
          buckets = new Array(cols).fill(0);
          boneBuckets.set(target.boneIndex, buckets);
        }
        for (let f = 0; f < frameCount; f++) {
          const time = frames[f * stride];
          const b = Math.min(cols - 1, Math.max(0, Math.floor(time / bucketDur)));
          buckets[b]++;
        }
      } else if (typeof target.slotIndex === "number") {
        slots.add(target.slotIndex);
      } else if (tl instanceof EventTimeline) {
        eventCount += frameCount;
      } else {
        hasOther = true;
      }
    }

    const allRows: BoneHeatRow[] = [];
    for (const [boneIndex, buckets] of boneBuckets) {
      const total = buckets.reduce((a, b) => a + b, 0);
      allRows.push({
        name: data.bones[boneIndex]?.name ?? `bone ${boneIndex}`,
        buckets,
        total,
      });
    }
    allRows.sort((a, b) => b.total - a.total);
    const rows = allRows.slice(0, MAX_BONE_ROWS);

    let max = 0;
    for (const r of rows) for (const v of r.buckets) if (v > max) max = v;

    return {
      name: anim.name,
      duration: dur,
      timelineCount: anim.timelines.length,
      keyCount,
      boneCount: boneBuckets.size,
      slotCount: slots.size,
      eventCount,
      hasOther,
      heat: { cols, max, rows, extraBones: allRows.length - rows.length },
    };
  });
}
