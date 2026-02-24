import { useState, useCallback, useEffect } from 'react';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { AnimationSampler } from '../core/utils/animationSampler';
import { collectSnapshot, LiveSlotInfo } from './useDrawCallInspector';

export interface FrameMetrics {
  time: number;
  drawCalls: number;
  textures: number;
  pageBreaks: number;
  blendBreaks: number;
  visibleSlots: number;
  nonNormalBlends: number;
  slots: LiveSlotInfo[];
}

export interface AnimationHeatmapData {
  animationName: string;
  duration: number;
  frames: FrameMetrics[];
}

export interface UseAnimationHeatmapResult {
  data: AnimationHeatmapData[];
  isAnalyzing: boolean;
  analyze: () => void;
}

export function useAnimationHeatmap(spineInstance: Spine | null): UseAnimationHeatmapResult {
  const [data, setData] = useState<AnimationHeatmapData[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // New spine means old heatmap data is stale.
  useEffect(() => {
    setData([]);
    setIsAnalyzing(false);
  }, [spineInstance]);

  const analyze = useCallback(() => {
    if (!spineInstance) return;

    setIsAnalyzing(true);

    // Use setTimeout to allow React to render the analyzing state before blocking
    setTimeout(() => {
      try {
        const animations = spineInstance.skeleton.data.animations;
        const results: AnimationHeatmapData[] = [];

        for (const animation of animations) {
          const frames: FrameMetrics[] = [];

          AnimationSampler.sampleAnimation(
            spineInstance,
            animation,
            (time, skeleton) => {
              const snapshot = collectSnapshot(skeleton);

              const uniquePages = new Set<string>();
              let nonNormalBlends = 0;

              for (const slot of snapshot.slots) {
                uniquePages.add(slot.atlasPage);
                if (slot.blendMode !== 'Normal') {
                  nonNormalBlends++;
                }
              }

              frames.push({
                time,
                drawCalls: snapshot.drawCallCount,
                textures: uniquePages.size,
                pageBreaks: snapshot.pageBreaks,
                blendBreaks: snapshot.blendBreaks,
                visibleSlots: snapshot.slots.length,
                nonNormalBlends,
                slots: snapshot.slots,
              });
            },
            { sampleRate: 30, preserveState: true }
          );

          results.push({
            animationName: animation.name,
            duration: animation.duration,
            frames,
          });
        }

        setData(results);
      } catch (err) {
        console.error('Animation heatmap analysis failed:', err);
        setData([]);
      } finally {
        setIsAnalyzing(false);
      }
    }, 16);
  }, [spineInstance]);

  return { data, isAnalyzing, analyze };
}
