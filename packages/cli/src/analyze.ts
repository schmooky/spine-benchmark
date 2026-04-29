/**
 * Headless analysis: constructs a Skeleton from SkeletonData, runs the
 * canonical RI/CI formulas per animation, and returns a structured result.
 *
 * This does NOT use the full metrics-pipeline (which depends on Spine
 * pixi-v8 + AnimationState), because we have no renderer. Instead we
 * walk the skeleton's static data:
 *   - Per animation: sample the timeline, count blend modes, clipping,
 *     meshes, constraints.
 *   - Compute RI/CI via the canonical metrics-impact-formula.
 *
 * For the CLI's purposes, a static-data analysis is sufficient and
 * matches what the offline benchmark produces.
 */
import {
  type SkeletonData,
  Skeleton,
  AnimationState,
  AnimationStateData,
  Physics,
  BlendMode,
  ClippingAttachment,
  MeshAttachment,
} from '@esotericsoftware/spine-core';
import {
  activeConstraintStats,
  avgBoneInfluencesForMesh,
  classifyImpactLevel,
  computationalImpactCost,
  countMixingDepth,
  renderingImpactCost,
  type ImpactLevel,
} from '@spine-benchmark/metrics-impact-formula';

export interface AnimationReport {
  name: string;
  duration: number;
  ri: number;
  ci: number;
  total: number;
  riLevel: ImpactLevel;
  ciLevel: ImpactLevel;
  totalLevel: ImpactLevel;
  peakNonNormalBlends: number;
  peakClippingMasks: number;
  peakVertices: number;
  peakActiveConstraints: number;
  peakMeshes: number;
  peakWeightedMeshes: number;
  peakDeformedMeshes: number;
}

export interface AnalysisReport {
  skeletonName: string;
  spineVersion: string;
  totalBones: number;
  totalSlots: number;
  totalAnimations: number;
  totalSkins: number;
  animations: AnimationReport[];
  worstRI: { animation: string; cost: number; level: ImpactLevel };
  worstCI: { animation: string; cost: number; level: ImpactLevel };
}

export function analyzeSkeletonData(skeletonData: SkeletonData): AnalysisReport {
  const skeleton = new Skeleton(skeletonData);
  const stateData = new AnimationStateData(skeletonData);
  const state = new AnimationState(stateData);

  const animations: AnimationReport[] = [];

  for (const animation of skeletonData.animations) {
    const duration = animation.duration;
    const sampleRate = 30;
    const sampleCount = Math.max(2, Math.ceil(duration * sampleRate) + 1);

    let peakNonNormalBlends = 0;
    let peakClippingMasks = 0;
    let peakVertices = 0;
    let peakActiveConstraints = 0;
    let peakMeshes = 0;
    let peakWeightedMeshes = 0;
    let peakDeformedMeshes = 0;
    let peakCi = 0;
    let peakCiInputs: Parameters<typeof computationalImpactCost>[0] | null = null;

    state.clearTracks();
    state.setAnimation(0, animation.name, false);

    for (let i = 0; i < sampleCount; i++) {
      const time = duration > 0 ? (i / (sampleCount - 1)) * duration : 0;
      const track = state.getCurrent(0);
      if (track) {
        track.trackTime = time;
        track.animationLast = time;
      }
      state.update(0);
      state.apply(skeleton);
      skeleton.updateWorldTransform(Physics.update);

      // Count per-frame metrics from the live skeleton state
      let nonNormal = 0;
      let clips = 0;
      let verts = 0;
      let meshCount = 0;
      let weightedCount = 0;
      let deformedCount = 0;
      const frameMeshDetails: Array<{ vertices: number; weighted: boolean; deformed: boolean; boneInfluences: number }> = [];

      for (const slot of skeleton.drawOrder) {
        if (slot.color.a <= 0) continue;
        if (slot.bone && slot.bone.active === false) continue;
        const att = slot.getAttachment();
        if (!att) continue;

        if (slot.data.blendMode !== BlendMode.Normal) nonNormal++;
        if (att instanceof ClippingAttachment) clips++;
        if (att instanceof MeshAttachment) {
          meshCount++;
          const vertCount = (att.worldVerticesLength ?? 0) / 2;
          verts += vertCount;
          const isWeighted = att.bones != null && att.bones.length > 0;
          const isDeformed = slot.deform != null && slot.deform.length > 0;
          if (isWeighted) weightedCount++;
          if (isDeformed) deformedCount++;

          let boneInfluences = 1;
          if (isWeighted && att.bones) {
            boneInfluences = avgBoneInfluencesForMesh(att.bones);
          }
          frameMeshDetails.push({
            vertices: vertCount,
            weighted: isWeighted,
            deformed: isDeformed,
            boneInfluences,
          });
        }
      }

      // Active counts and mix-scaled bone counts in one pass via the
      // canonical helper. Crawler/heatmap/gif-capture share this exact path.
      const constraintStats = activeConstraintStats(
        skeleton as Parameters<typeof activeConstraintStats>[0],
      );
      const { ik: activeIk, transform: activeTransform, path: activePath, physics: activePhysics } =
        constraintStats.active;
      const totalActive = activeIk + activeTransform + activePath + activePhysics;

      peakNonNormalBlends = Math.max(peakNonNormalBlends, nonNormal);
      peakClippingMasks = Math.max(peakClippingMasks, clips);
      peakVertices = Math.max(peakVertices, verts);
      peakActiveConstraints = Math.max(peakActiveConstraints, totalActive);
      peakMeshes = Math.max(peakMeshes, meshCount);
      peakWeightedMeshes = Math.max(peakWeightedMeshes, weightedCount);
      peakDeformedMeshes = Math.max(peakDeformedMeshes, deformedCount);

      const mixingDepth = countMixingDepth(state);

      // Track the frame that produces the highest CI
      const frameCiInputs = {
        constraints: constraintStats.active,
        constraintBones: constraintStats.bones,
        totalVertices: verts,
        activeMeshCount: meshCount,
        weightedMeshCount: weightedCount,
        deformedMeshCount: deformedCount,
        meshDetails: frameMeshDetails,
        mixingDepth,
      };
      const frameCi = computationalImpactCost(frameCiInputs);
      if (frameCi > peakCi) {
        peakCi = frameCi;
        peakCiInputs = frameCiInputs;
      }
    }

    const ri = renderingImpactCost({
      activeNonNormalBlends: peakNonNormalBlends,
      activeClippingMasks: peakClippingMasks,
      totalVertices: peakVertices,
    });
    const ci = peakCiInputs ? computationalImpactCost(peakCiInputs) : 0;
    const total = ri + ci;

    animations.push({
      name: animation.name,
      duration,
      ri: Number(ri.toFixed(2)),
      ci: Number(ci.toFixed(2)),
      total: Number(total.toFixed(2)),
      riLevel: classifyImpactLevel(ri),
      ciLevel: classifyImpactLevel(ci),
      totalLevel: classifyImpactLevel(total),
      peakNonNormalBlends,
      peakClippingMasks,
      peakVertices,
      peakActiveConstraints,
      peakMeshes,
      peakWeightedMeshes,
      peakDeformedMeshes,
    });
  }

  // Reset skeleton
  state.clearTracks();
  skeleton.setToSetupPose();

  // Sort by total cost descending
  animations.sort((a, b) => b.total - a.total);

  const worstRI = animations.reduce(
    (w, a) => (a.ri > w.cost ? { animation: a.name, cost: a.ri, level: a.riLevel } : w),
    { animation: '(none)', cost: 0, level: 'minimal' as ImpactLevel },
  );
  const worstCI = animations.reduce(
    (w, a) => (a.ci > w.cost ? { animation: a.name, cost: a.ci, level: a.ciLevel } : w),
    { animation: '(none)', cost: 0, level: 'minimal' as ImpactLevel },
  );

  return {
    skeletonName: skeletonData.name || '(unnamed)',
    spineVersion: (skeletonData as any).version || '(unknown)',
    totalBones: skeletonData.bones.length,
    totalSlots: skeletonData.slots.length,
    totalAnimations: skeletonData.animations.length,
    totalSkins: skeletonData.skins.length,
    animations,
    worstRI,
    worstCI,
  };
}
