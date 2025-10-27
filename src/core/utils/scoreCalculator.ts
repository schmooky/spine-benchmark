import { PERFORMANCE_FACTORS } from "../constants/performanceFactors";
import i18n from "../../i18n";

/**
 * Calculates the mesh performance score
 * @param metrics Mesh metrics
 * @returns Score from 0-100
 */
export function calculateMeshScore(metrics: any): number {
  
  const { totalMeshCount, totalVertices, deformedMeshCount, weightedMeshCount } = metrics;
  const { IDEAL_MESH_COUNT, IDEAL_VERTEX_COUNT, MESH_DEFORMED_FACTOR, MESH_WEIGHTED_FACTOR } = PERFORMANCE_FACTORS;
  
  let score = 100;
  
  if (totalMeshCount > 0) {
    score -= Math.log2(totalMeshCount / IDEAL_MESH_COUNT + 1) * 15;
  }
  
  if (totalVertices > 0) {
    score -= Math.log2(totalVertices / IDEAL_VERTEX_COUNT + 1) * 10;
  }
  
  score -= deformedMeshCount * MESH_DEFORMED_FACTOR;
  
  score -= weightedMeshCount * MESH_WEIGHTED_FACTOR;
  
  return Math.max(0, score);
}

/**
 * Calculates the clipping mask performance score
 * @param maskCount Number of clipping masks
 * @param vertexCount Total vertices in all masks
 * @param complexMasks Number of masks with more than 4 vertices
 * @returns Score from 0-100
 */
export function calculateClippingScore(maskCount: number, vertexCount: number, complexMasks: number): number {
  
  const { IDEAL_CLIPPING_COUNT } = PERFORMANCE_FACTORS;
  
  let score = 100;
  
  if (maskCount > 0) {
    score -= Math.log2(maskCount / IDEAL_CLIPPING_COUNT + 1) * 20;
  }
  
  if (vertexCount > 0) {
    score -= Math.log2(vertexCount + 1) * 5;
  }
  
  score -= complexMasks * 10;
  
  return Math.max(0, score);
}

/**
 * Calculates the blend mode performance score
 * @param nonNormalCount Number of non-normal blend modes
 * @param additiveCount Number of additive blend modes
 * @returns Score from 0-100
 */
export function calculateBlendModeScore(nonNormalCount: number, additiveCount: number): number {
  
  const { IDEAL_BLEND_MODE_COUNT } = PERFORMANCE_FACTORS;
  
  let score = 100;
  
  if (nonNormalCount > 0) {
    score -= Math.log2(nonNormalCount / IDEAL_BLEND_MODE_COUNT + 1) * 20;
  }
  
  score -= additiveCount * 2;
  
  return Math.max(0, score);
}

/**
 * Calculates the bone structure performance score
 * @param totalBones Total number of bones
 * @param maxDepth Maximum depth of bone hierarchy
 * @returns Score from 0-100
 */
export function calculateBoneScore(totalBones: number, maxDepth: number): number {
  
  const { IDEAL_BONE_COUNT, BONE_DEPTH_FACTOR } = PERFORMANCE_FACTORS;
  
  let score = 100;
  
  if (totalBones > 0) {
    score -= Math.log2(totalBones / IDEAL_BONE_COUNT + 1) * 15;
  }
  
  score -= maxDepth * BONE_DEPTH_FACTOR;
  
  return Math.max(0, score);
}

/**
 * Calculates the constraint performance score
 * @param ikImpact IK constraints impact
 * @param transformImpact Transform constraints impact
 * @param pathImpact Path constraints impact
 * @param physicsImpact Physics constraints impact
 * @returns Score from 0-100
 */
function calculateConstraintScore(
  ikImpact: number,
  transformImpact: number,
  pathImpact: number,
  physicsImpact: number
): number {
  const {
    IK_WEIGHT,
    TRANSFORM_WEIGHT,
    PATH_WEIGHT,
    PHYSICS_WEIGHT
  } = PERFORMANCE_FACTORS;
  
  const totalImpact =
    (ikImpact * IK_WEIGHT) +
    (transformImpact * TRANSFORM_WEIGHT) +
    (pathImpact * PATH_WEIGHT) +
    (physicsImpact * PHYSICS_WEIGHT);
  
  const score = 100 - (totalImpact * 0.5);
  
  return Math.max(0, score);
}

/**
 * Helper function to calculate maximum depth of a tree structure
 * @param nodes Tree nodes
 * @returns Maximum depth of the tree
 */
export function calculateMaxDepth(nodes: any[]): number {
  if (!nodes || nodes.length === 0) return 0;
  
  return 1 + Math.max(...nodes.map(node => 
    node.children ? calculateMaxDepth(node.children) : 0
  ));
}

/**
 * Calculate overall performance score from component scores
 * @param componentScores Scores for each component
 * @returns Overall performance score (40-100)
 */
export function calculateOverallScore(componentScores: { [key: string]: number }): number {
  const { 
    BONE_WEIGHT, 
    MESH_WEIGHT, 
    CLIPPING_WEIGHT, 
    BLEND_MODE_WEIGHT, 
    CONSTRAINT_WEIGHT 
  } = PERFORMANCE_FACTORS;
  
  const weightedScore = 
    (componentScores.boneScore * BONE_WEIGHT) +
    (componentScores.meshScore * MESH_WEIGHT) +
    (componentScores.clippingScore * CLIPPING_WEIGHT) +
    (componentScores.blendModeScore * BLEND_MODE_WEIGHT) +
    (componentScores.constraintScore * CONSTRAINT_WEIGHT);
  
  return Math.max(40, Math.round(weightedScore));
}

/**
 * Helper method to get a color for a score
 * @param score Performance score
 * @returns CSS color string
 */
export function getScoreColor(score: number): string {
  if (score >= 85) return '#4caf50';
  if (score >= 70) return '#8bc34a';
  if (score >= 55) return '#ffb300';
  if (score >= 40) return '#f57c00';
  return '#e53935';
}

/**
 * Helper method to get a rating label for a score
 * @param score Performance score
 * @returns Text rating
 */
function getScoreRating(score: number): string {
  if (score >= 85) return i18n.t('analysis.scores.ratings.excellent');
  if (score >= 70) return i18n.t('analysis.scores.ratings.good');
  if (score >= 55) return i18n.t('analysis.scores.ratings.moderate');
  if (score >= 40) return i18n.t('analysis.scores.ratings.poor');
  return i18n.t('analysis.scores.ratings.veryPoor');
}

/**
 * Helper method to get interpretation for a score
 * @param score Performance score
 * @returns Score interpretation text
 */
function getScoreInterpretation(score: number): string {
  if (score >= 85) return i18n.t('analysis.scores.interpretations.excellent');
  if (score >= 70) return i18n.t('analysis.scores.interpretations.good');
  if (score >= 55) return i18n.t('analysis.scores.interpretations.moderate');
  if (score >= 40) return i18n.t('analysis.scores.interpretations.poor');
  return i18n.t('analysis.scores.interpretations.veryPoor');
}