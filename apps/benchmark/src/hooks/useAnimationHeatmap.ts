import { useState, useCallback, useEffect, useRef } from 'react';
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
  const isAnalyzingRef = useRef(false);
  const analysisRunRef = useRef(0);

  // New spine means old heatmap data is stale.
  useEffect(() => {
    analysisRunRef.current += 1;
    setData([]);
    setIsAnalyzing(false);
    isAnalyzingRef.current = false;
  }, [spineInstance]);

  const analyze = useCallback(() => {
    if (!spineInstance || isAnalyzingRef.current) return;

    const runId = ++analysisRunRef.current;
    const targetSpine = spineInstance;
    isAnalyzingRef.current = true;
    setIsAnalyzing(true);

    // Use setTimeout to allow React to render the analyzing state before blocking
    setTimeout(() => {
      if (runId !== analysisRunRef.current) {
        isAnalyzingRef.current = false;
        return;
      }

      try {
        const animations = targetSpine.skeleton.data.animations;
        const results: AnimationHeatmapData[] = [];

        for (const animation of animations) {
          const frames: FrameMetrics[] = [];

          AnimationSampler.sampleAnimation(
            targetSpine,
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
        isAnalyzingRef.current = false;
        if (runId === analysisRunRef.current) {
          setIsAnalyzing(false);
        }
      }
    }, 16);
  }, [spineInstance]);

  return { data, isAnalyzing, analyze };
}
