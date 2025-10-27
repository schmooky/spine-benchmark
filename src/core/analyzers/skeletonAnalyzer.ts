import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { PERFORMANCE_FACTORS } from "../constants/performanceFactors";
import { calculateBoneScore, calculateMaxDepth } from "../utils/scoreCalculator";

interface BoneNode {
  name: string;
  type: string;
  x: string;
  y: string;
  children: BoneNode[];
}

export interface SkeletonMetrics {
  totalBones: number;
  rootBones: number;
  maxDepth: number;
  score: number;
}

export interface SkeletonAnalysis {
  boneTree: BoneNode[];
  metrics: SkeletonMetrics;
}

/**
 * Analyzes the skeleton structure of a Spine instance
 * @param spineInstance The Spine instance to analyze
 * @returns Skeleton analysis data
 */
export function analyzeSkeletonStructure(spineInstance: Spine): SkeletonAnalysis {
  const skeleton = spineInstance.skeleton;
  
  function buildBoneNode(bone: any): BoneNode {
    const children = bone.children || [];
    return {
      name: bone.data.name,
      type: 'bone',
      x: bone.x.toFixed(2),
      y: bone.y.toFixed(2),
      children: children.map(buildBoneNode)
    };
  }
  
  const rootBones = skeleton.bones.filter(bone => !bone.parent);
  const boneTree = rootBones.map(buildBoneNode);
  
  const maxDepth = calculateMaxDepth(boneTree);
  const totalBones = skeleton.bones.length;
  
  const boneScore = calculateBoneScore(totalBones, maxDepth);
  
  const metrics: SkeletonMetrics = {
    totalBones,
    rootBones: rootBones.length,
    maxDepth,
    score: boneScore
  };
  
  return {
    boneTree,
    metrics
  };
}