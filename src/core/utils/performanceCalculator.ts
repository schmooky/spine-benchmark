import { PERFORMANCE_WEIGHTS } from "../constants/performanceWeights";

interface FrameData {
  bones: { count: number; depths: number[] };
  constraints: {
    ikChains: number[];
    transformCount: number;
    pathBonesAffected: number[];
    pathSampleSteps: number[];
    physicsCount: number;
  };
  animation: {
    activeTracksMinusBase: number;
    appliedTimelines: number;
  };
  meshes: {
    vertexCount: number;
    skinnedWeights: number;
    deformTimelines: number;
  };
  clipping: {
    attachmentTris: number;
    polyTris: number;
    transitions: number;
  };
  rendering: {
    estimatedDrawCalls: number;
    renderedTriangles: number;
    nonNormalBlendSlots: number;
  };
}

/**
 * Calculate DepthPenalty as per specification
 */
function calculateDepthPenalty(depths: number[], boneCount: number): number {
  if (boneCount === 0) return 0;
  
  const {
    w_depth_lin,
    w_depth_poly,
    gamma,
    w_depth_mean,
    depth_power
  } = PERFORMANCE_WEIGHTS;
  
  // Calculate balanced depth
  const D_bal = Math.ceil(Math.log2(boneCount + 1));
  
  // Calculate maximum depth
  const D_max = Math.max(...depths, 0);
  
  // Calculate excess depth
  const ExcessDepth = Math.max(0, D_max - D_bal);
  
  // Calculate weighted depth mean
  let depthSum = 0;
  depths.forEach(depth => {
    depthSum += Math.pow(depth, depth_power);
  });
  const WeightedDepthMean = depthSum / boneCount;
  
  // Calculate balanced depth mean
  const BalancedDepthMean = Math.pow(D_bal, depth_power);
  
  // Calculate depth degeneracy
  const DepthDegeneracy = Math.max(0, WeightedDepthMean - BalancedDepthMean);
  
  // Calculate total penalty
  const DepthPenalty = 
    w_depth_lin * ExcessDepth +
    w_depth_poly * Math.pow(ExcessDepth, gamma) +
    w_depth_mean * DepthDegeneracy;
  
  return DepthPenalty;
}

/**
 * Calculate ComputationImpact (CI) as per specification
 */
export function calculateComputationImpact(frameData: FrameData): number {
  const {
    wb,
    wIK,
    wTC,
    wPC,
    wPH,
    wmesh,
    wskin,
    wdef,
    wclip,
    wmix
  } = PERFORMANCE_WEIGHTS;
  
  // Base bone cost
  let CI = wb * frameData.bones.count;
  
  // IK constraint cost
  const ikCost = frameData.constraints.ikChains.reduce((sum, chain) => sum + chain, 0);
  CI += wIK * ikCost;
  
  // Transform constraint cost
  CI += wTC * frameData.constraints.transformCount;
  
  // Path constraint cost
  let pathCost = 0;
  for (let i = 0; i < frameData.constraints.pathBonesAffected.length; i++) {
    pathCost += frameData.constraints.pathBonesAffected[i] * 
                (frameData.constraints.pathSampleSteps[i] || 1);
  }
  CI += wPC * pathCost;
  
  // Physics constraint cost
  CI += wPH * frameData.constraints.physicsCount;
  
  // Mesh vertex cost
  CI += wmesh * frameData.meshes.vertexCount;
  
  // Skinning cost
  CI += wskin * frameData.meshes.skinnedWeights;
  
  // Deformation cost
  CI += wdef * frameData.meshes.deformTimelines;
  
  // Clipping cost (multiplicative)
  CI += wclip * (frameData.clipping.attachmentTris * frameData.clipping.polyTris);
  
  // Animation mixing cost
  CI += wmix * (frameData.animation.activeTracksMinusBase * frameData.animation.appliedTimelines);
  
  // Add depth penalty
  CI += calculateDepthPenalty(frameData.bones.depths, frameData.bones.count);
  
  return CI;
}

/**
 * Calculate RenderingImpact (RI) as per specification
 */
export function calculateRenderingImpact(frameData: FrameData): number {
  const {
    wdc,
    wtri,
    wblend
  } = PERFORMANCE_WEIGHTS;
  
  const RI = 
    wdc * frameData.rendering.estimatedDrawCalls +
    wtri * frameData.rendering.renderedTriangles +
    wblend * frameData.rendering.nonNormalBlendSlots;
  
  return RI;
}

/**
 * Calculate PerformanceScore from TotalImpact as per specification
 */
export function calculatePerformanceScore(totalImpact: number): number {
  const { S, k } = PERFORMANCE_WEIGHTS;
  
  const totalImpactNorm = totalImpact / S;
  const performanceScore = 100 * Math.exp(-k * totalImpactNorm);
  
  // Ensure score is in [0, 100] range
  return Math.max(0, Math.min(100, performanceScore));
}

/**
 * Get a color for a performance score
 */
export function getScoreColor(score: number): string {
  if (score >= 85) return '#4caf50'; // Green for excellent
  if (score >= 70) return '#8bc34a'; // Light green for good
  if (score >= 55) return '#ffb300'; // Amber for moderate
  if (score >= 40) return '#f57c00'; // Orange for poor
  return '#e53935'; // Red for very poor
}

/**
 * Get a rating label for a score
 */
export function getScoreRating(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Moderate';
  if (score >= 40) return 'Poor';
  return 'Very Poor';
}

/**
 * Get interpretation for a score
 */
export function getScoreInterpretation(score: number): string {
  if (score >= 85) return 'This skeleton will perform excellently on all devices';
  if (score >= 70) return 'This skeleton will perform well on most devices';
  if (score >= 55) return 'This skeleton may have performance issues on lower-end devices';
  if (score >= 40) return 'This skeleton will likely have performance issues on many devices';
  return 'This skeleton has severe performance issues and needs optimization';
}