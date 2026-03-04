import { useEffect, useRef, useState } from 'react';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { BlendMode, RegionAttachment, MeshAttachment, TextureAtlasRegion } from '@esotericsoftware/spine-core';

export interface LiveSlotInfo {
  index: number;
  slotName: string;
  attachmentName: string;
  atlasPage: string;
  blendMode: string;
  isBreak: boolean;
  isInvisible: boolean;
}

export interface DrawCallSnapshot {
  slots: LiveSlotInfo[];
  drawCallCount: number;
  flushCount: number;
  pageBreaks: number;
  blendBreaks: number;
}

const EMPTY_SNAPSHOT: DrawCallSnapshot = {
  slots: [],
  drawCallCount: 0,
  flushCount: 0,
  pageBreaks: 0,
  blendBreaks: 0,
};

const BLEND_MODE_NAMES: Record<number, string> = {
  [BlendMode.Normal]: 'Normal',
  [BlendMode.Additive]: 'Additive',
  [BlendMode.Multiply]: 'Multiply',
  [BlendMode.Screen]: 'Screen',
};

const THROTTLE_MS = 100;

function getAtlasPageName(attachment: RegionAttachment | MeshAttachment): string {
  try {
    const region = attachment.region as TextureAtlasRegion | null;
    return region?.page?.name ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function collectSnapshot(skeleton: { drawOrder: any[] }): DrawCallSnapshot {
  const slots: LiveSlotInfo[] = [];
  let drawCallCount = 0;
  let pageBreaks = 0;
  let blendBreaks = 0;
  let prevPage: string | null = null;
  let prevBlend: string | null = null;

  for (let i = 0; i < skeleton.drawOrder.length; i++) {
    const slot = skeleton.drawOrder[i];
    const attachment = slot.getAttachment();
    if (!attachment) continue;

    const isInvisible = slot.color.a <= 0 || (slot.bone && !slot.bone.active);

    const isRegionOrMesh =
      attachment instanceof RegionAttachment || attachment instanceof MeshAttachment;
    const atlasPage = isRegionOrMesh ? getAtlasPageName(attachment) : 'unknown';
    const blendMode = BLEND_MODE_NAMES[slot.data.blendMode] ?? 'Normal';

    // Only visible slots contribute to draw call / break counting
    let isBreak = false;
    if (!isInvisible) {
      const pageChanged = prevPage !== null && atlasPage !== prevPage;
      const blendChanged = prevBlend !== null && blendMode !== prevBlend;
      isBreak = pageChanged || blendChanged;

      if (prevPage === null) {
        drawCallCount = 1;
      } else if (isBreak) {
        drawCallCount += 1;
        if (pageChanged) pageBreaks += 1;
        if (blendChanged) blendBreaks += 1;
      }

      prevPage = atlasPage;
      prevBlend = blendMode;
    }

    slots.push({
      index: i,
      slotName: slot.data.name,
      attachmentName: attachment.name,
      atlasPage,
      blendMode,
      isBreak,
      isInvisible: !!isInvisible,
    });
  }

  // For this route, "flushes" map to submitted batches/draw calls.
  return { slots, drawCallCount, flushCount: drawCallCount, pageBreaks, blendBreaks };
}

export function useDrawCallInspector(spineInstance: Spine | null): DrawCallSnapshot {
  const [snapshot, setSnapshot] = useState<DrawCallSnapshot>(EMPTY_SNAPSHOT);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    if (!spineInstance) {
      setSnapshot(EMPTY_SNAPSHOT);
      return;
    }

    let rafId: number;
    let running = true;

    const tick = () => {
      if (!running) return;
      const now = performance.now();
      if (now - lastUpdateRef.current >= THROTTLE_MS) {
        lastUpdateRef.current = now;
        try {
          const result = collectSnapshot(spineInstance.skeleton);
          setSnapshot(result);
        } catch {
          // skeleton may not be ready yet
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
    };
  }, [spineInstance]);

  return snapshot;
}
