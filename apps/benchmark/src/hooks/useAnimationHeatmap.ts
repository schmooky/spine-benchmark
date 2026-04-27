import { useState, useCallback, useEffect, useRef } from 'react';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import {
  avgBoneInfluencesForMesh,
  computationalImpactCost as sharedComputationalImpactCost,
  countMixingDepth,
  ikMixScale,
  isConstraintActive,
  isPhysicsConstraintContributing,
  pathMixScale,
  renderingImpactCost as sharedRenderingImpactCost,
  transformMixScale,
} from '@spine-benchmark/metrics-impact-formula';
import { AnimationSampler } from '../core/utils/animationSampler';
import { collectSnapshot, LiveSlotInfo } from './useDrawCallInspector';
import { ClippingAttachment, MeshAttachment } from '@esotericsoftware/spine-core';

interface FrameConstraintCounts {
  ik: number;
  transform: number;
  path: number;
  physics: number;
  constraintBones: { ik: number; path: number; transform: number };
}

interface FrameMeshDetail {
  vertices: number;
  weighted: boolean;
  deformed: boolean;
  boneInfluences: number;
}

interface FrameImpactInputs {
  nonNormalBlends: number;
  clippingMasks: number;
  totalVertices: number;
  activeMeshCount: number;
  deformedMeshCount: number;
  weightedMeshCount: number;
  constraints: FrameConstraintCounts;
  meshDetails: FrameMeshDetail[];
  mixingDepth: number;
}

function countActiveConstraints(skeleton: {
  ikConstraints?: unknown[];
  transformConstraints?: unknown[];
  pathConstraints?: unknown[];
  physicsConstraints?: unknown[];
}): FrameConstraintCounts {
  const bones = {
    ik: 0,
    transform: 0,
    path: 0,
  };
  let ik = 0;
  for (const raw of skeleton.ikConstraints ?? []) {
    const c = (raw ?? {}) as { active?: boolean; mix?: number; bones?: unknown[] };
    if (!isConstraintActive(c)) continue;
    ik++;
    bones.ik += (c.bones?.length ?? 1) * ikMixScale(c);
  }

  let transform = 0;
  for (const raw of skeleton.transformConstraints ?? []) {
    const c = (raw ?? {}) as Parameters<typeof transformMixScale>[0]
      & { active?: boolean; bones?: unknown[] };
    if (!isConstraintActive(c)) continue;
    transform++;
    bones.transform += (c.bones?.length ?? 1) * transformMixScale(c);
  }

  let path = 0;
  for (const raw of skeleton.pathConstraints ?? []) {
    const c = (raw ?? {}) as Parameters<typeof pathMixScale>[0]
      & { active?: boolean; bones?: unknown[] };
    if (!isConstraintActive(c)) continue;
    path++;
    bones.path += (c.bones?.length ?? 1) * pathMixScale(c);
  }

  let physics = 0;
  for (const raw of skeleton.physicsConstraints ?? []) {
    const c = (raw ?? {}) as { active?: boolean; mix?: number };
    if (!isPhysicsConstraintContributing(c)) continue;
    physics++;
  }

  return { ik, transform, path, physics, constraintBones: bones };
}

// Per-frame heatmap costs delegate to the shared formula package so the
// in-app heatmap matches the offline benchmark and the live crawler exactly.
function renderingImpactCost(
  input: Pick<FrameImpactInputs, 'nonNormalBlends' | 'clippingMasks' | 'totalVertices'>,
): number {
  return sharedRenderingImpactCost({
    activeNonNormalBlends: input.nonNormalBlends,
    activeClippingMasks: input.clippingMasks,
    totalVertices: input.totalVertices,
  });
}

function computationalImpactCost(input: FrameImpactInputs): number {
  return sharedComputationalImpactCost({
    constraints: input.constraints,
    constraintBones: input.constraints.constraintBones,
    totalVertices: input.totalVertices,
    activeMeshCount: input.activeMeshCount,
    weightedMeshCount: input.weightedMeshCount,
    deformedMeshCount: input.deformedMeshCount,
    meshDetails: input.meshDetails,
    mixingDepth: input.mixingDepth,
  });
}

export interface FrameMetrics {
  time: number;
  drawCalls: number;
  textures: number;
  pageBreaks: number;
  blendBreaks: number;
  visibleSlots: number;
  nonNormalBlends: number;
  clippingMasks: number;
  meshVertices: number;
  activeMeshCount: number;
  deformedMeshCount: number;
  weightedMeshCount: number;
  activeIkCount: number;
  activeTransformCount: number;
  activePathCount: number;
  activePhysicsCount: number;
  renderingImpact: number;
  computationalImpact: number;
  totalImpact: number;
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

      // Sampling mutates live animation state; keep it hidden from rendering while we sample.
      const previousVisible = targetSpine.visible;
      targetSpine.visible = false;

      try {
        const animations = targetSpine.skeleton?.data?.animations ?? [];
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
              let visibleSlots = 0;
              let clippingMasks = 0;
              let meshVertices = 0;
              let activeMeshCount = 0;
              let deformedMeshCount = 0;
              let weightedMeshCount = 0;

              for (const slot of snapshot.slots) {
                uniquePages.add(slot.atlasPage);
                if (slot.isInvisible) continue;
                visibleSlots++;
                if (slot.blendMode !== 'Normal') {
                  nonNormalBlends++;
                }
              }

              const meshDetails: FrameMeshDetail[] = [];
              for (const slot of skeleton.drawOrder as Array<{
                color?: { a?: number };
                bone?: { active?: boolean };
                deform?: ArrayLike<number>;
                getAttachment: () => unknown;
              }>) {
                const isVisible = (slot.color?.a ?? 1) > 0 && (slot.bone ? slot.bone.active !== false : true);
                if (!isVisible) continue;
                const attachment = slot.getAttachment();
                if (!attachment) continue;

                if (attachment instanceof MeshAttachment) {
                  activeMeshCount += 1;
                  const vertCount = attachment.worldVerticesLength / 2;
                  meshVertices += vertCount;
                  const isWeighted = (attachment.bones?.length ?? 0) > 0;
                  const isDeformed = (slot.deform?.length ?? 0) > 0;
                  if (isWeighted) weightedMeshCount += 1;
                  if (isDeformed) deformedMeshCount += 1;

                  let boneInfluences = 1;
                  if (isWeighted && attachment.bones) {
                    boneInfluences = avgBoneInfluencesForMesh(attachment.bones as number[]);
                  }

                  meshDetails.push({
                    vertices: vertCount,
                    weighted: isWeighted,
                    deformed: isDeformed,
                    boneInfluences,
                  });
                } else if (attachment instanceof ClippingAttachment) {
                  clippingMasks += 1;
                }
              }

              const activeConstraints = countActiveConstraints(skeleton);
              const mixingDepth = countMixingDepth(targetSpine.state);
              const renderingCost = renderingImpactCost({
                nonNormalBlends,
                clippingMasks,
                totalVertices: meshVertices,
              });
              const computationalCost = computationalImpactCost({
                nonNormalBlends,
                clippingMasks,
                totalVertices: meshVertices,
                activeMeshCount,
                deformedMeshCount,
                weightedMeshCount,
                constraints: activeConstraints,
                meshDetails,
                mixingDepth,
              });
              const renderingImpact = Number(renderingCost.toFixed(2));
              const computationalImpact = Number(computationalCost.toFixed(2));

              frames.push({
                time,
                drawCalls: snapshot.drawCallCount,
                textures: uniquePages.size,
                pageBreaks: snapshot.pageBreaks,
                blendBreaks: snapshot.blendBreaks,
                visibleSlots,
                nonNormalBlends,
                clippingMasks,
                meshVertices,
                activeMeshCount,
                deformedMeshCount,
                weightedMeshCount,
                activeIkCount: activeConstraints.ik,
                activeTransformCount: activeConstraints.transform,
                activePathCount: activeConstraints.path,
                activePhysicsCount: activeConstraints.physics,
                renderingImpact,
                computationalImpact,
                totalImpact: Number((renderingImpact + computationalImpact).toFixed(2)),
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
        targetSpine.visible = previousVisible;
        isAnalyzingRef.current = false;
        if (runId === analysisRunRef.current) {
          setIsAnalyzing(false);
        }
      }
    }, 16);
  }, [spineInstance]);

  return { data, isAnalyzing, analyze };
}
