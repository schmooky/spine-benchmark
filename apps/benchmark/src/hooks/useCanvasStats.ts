import { useEffect, useRef, useState } from 'react';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { BlendMode, RegionAttachment, MeshAttachment, TextureAtlasRegion } from '@esotericsoftware/spine-core';

export interface CanvasStats {
  fps: number;
  drawCalls: number;
  flushes: number;
  textures: number;
}

const EMPTY_STATS: CanvasStats = { fps: 0, drawCalls: 0, flushes: 0, textures: 0 };
const FPS_SAMPLES = 60;

function countDrawCallsFlushesAndTextures(
  skeleton: { drawOrder: any[] },
): { drawCalls: number; flushes: number; textures: number } {
  let drawCalls = 0;
  let prevPage: string | null = null;
  let prevBlend: number | null = null;
  const pages = new Set<string>();

  for (let i = 0; i < skeleton.drawOrder.length; i++) {
    const slot = skeleton.drawOrder[i];
    const attachment = slot.getAttachment();
    if (!attachment) continue;

    const isRegionOrMesh =
      attachment instanceof RegionAttachment || attachment instanceof MeshAttachment;
    if (!isRegionOrMesh) continue;

    let pageName = 'unknown';
    try {
      const region = attachment.region as TextureAtlasRegion | null;
      pageName = region?.page?.name ?? 'unknown';
    } catch { /* ignore */ }

    pages.add(pageName);

    const blendMode = slot.data.blendMode as number;
    const pageChanged = prevPage !== null && pageName !== prevPage;
    const blendChanged = prevBlend !== null && blendMode !== prevBlend;

    if (prevPage === null) {
      drawCalls = 1;
    } else if (pageChanged || blendChanged) {
      drawCalls += 1;
    }

    prevPage = pageName;
    prevBlend = blendMode;
  }

  // In Pixi's batched path, each submitted batch maps to one flush.
  const flushes = drawCalls;

  return { drawCalls, flushes, textures: pages.size };
}

// Throttle expensive stats computation to reduce observer-effect overhead
const STATS_UPDATE_INTERVAL = 250; // 4 updates/sec

export function useCanvasStats(spineInstance: Spine | null): CanvasStats {
  const [stats, setStats] = useState<CanvasStats>(EMPTY_STATS);
  const frameTimesRef = useRef<number[]>([]);
  const lastTimeRef = useRef(0);
  const lastStatsUpdateRef = useRef(0);

  useEffect(() => {
    if (!spineInstance) {
      setStats(EMPTY_STATS);
      return;
    }

    let rafId: number;
    let running = true;
    frameTimesRef.current = [];
    lastTimeRef.current = performance.now();
    lastStatsUpdateRef.current = 0;

    const tick = () => {
      if (!running) return;

      const now = performance.now();
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;

      // Always collect frame times for accurate FPS averaging
      const frameTimes = frameTimesRef.current;
      frameTimes.push(delta);
      if (frameTimes.length > FPS_SAMPLES) {
        frameTimes.shift();
      }

      // Only compute expensive draw call stats and trigger React update at throttled interval
      if (now - lastStatsUpdateRef.current >= STATS_UPDATE_INTERVAL) {
        lastStatsUpdateRef.current = now;

        const avgDelta = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        const fps = avgDelta > 0 ? Math.round(1000 / avgDelta) : 0;

        try {
          const { drawCalls, flushes, textures } = countDrawCallsFlushesAndTextures(spineInstance.skeleton);
          setStats({ fps, drawCalls, flushes, textures });
        } catch {
          setStats((prev) => ({ ...prev, fps }));
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

  return stats;
}
