import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { getScoreColor, getScoreRating, getScoreInterpretation } from "../utils/scoreCalculator";
import i18n from "../../i18n";

/**
 * Generates a comprehensive HTML summary of the skeleton analysis
 * @param spineInstance The analyzed Spine instance
 * @param boneMetrics Bone analysis metrics
 * @param meshMetrics Mesh analysis metrics
 * @param clippingMetrics Clipping mask analysis metrics
 * @param blendModeMetrics Blend mode analysis metrics
 * @param constraintMetrics Constraint analysis metrics
 * @param overallScore The calculated overall performance score
 * @returns HTML string containing the summary
 */
export function generateSummary(
  spineInstance: Spine,
  boneMetrics: any,
  meshMetrics: any,
  clippingMetrics: any,
  blendModeMetrics: any,
  constraintMetrics: any,
  overallScore: number
): string {
  // Get the skeleton data
  const skeleton = spineInstance.skeleton;
  const skeletonData = skeleton.data;
  
  // Get performance rating and interpretation
  const performanceRating = getScoreRating(overallScore);
  const interpretation = getScoreInterpretation(overallScore);
  // Generate component score table
  const componentScores = [
    { name: i18n.t('analysis.summary.components.boneStructure'), score: boneMetrics.score, weight: '15%' },
    { name: i18n.t('analysis.summary.components.meshComplexity'), score: meshMetrics.score, weight: '25%' },
    { name: i18n.t('analysis.summary.components.clippingMasks'), score: clippingMetrics.score, weight: '20%' },
    { name: i18n.t('analysis.summary.components.blendModes'), score: blendModeMetrics.score, weight: '15%' },
    { name: i18n.t('analysis.summary.components.constraints'), score: constraintMetrics.score, weight: '25%' },
  ];
  
  // Generate skeleton statistics
  const stats = [
    { name: i18n.t('analysis.summary.statistics.totalBones'), value: boneMetrics.totalBones },
    { name: i18n.t('analysis.summary.statistics.maxBoneDepth'), value: boneMetrics.maxDepth },
    { name: i18n.t('analysis.summary.statistics.totalMeshes'), value: meshMetrics.totalMeshCount },
    { name: i18n.t('analysis.summary.statistics.totalVertices'), value: meshMetrics.totalVertices },
    { name: i18n.t('analysis.summary.statistics.clippingMasks'), value: clippingMetrics.maskCount },
    { name: i18n.t('analysis.summary.statistics.nonNormalBlendModes'), value: blendModeMetrics.nonNormalBlendModeCount },
    { name: i18n.t('analysis.summary.statistics.totalConstraints'), value: constraintMetrics.totalConstraints },
    { name: i18n.t('analysis.summary.statistics.animations'), value: skeletonData.animations.length },
    { name: i18n.t('analysis.summary.statistics.skins'), value: skeletonData.skins.length },
  ];
  
  // Generate optimization recommendations
  const recommendations: string[] = [];
  
  // Bone recommendations
  if (boneMetrics.maxDepth > 5) {
    recommendations.push(i18n.t('analysis.summary.recommendations.reduceBoneDepth'));
  }
  if (boneMetrics.totalBones > 50) {
    recommendations.push(i18n.t('analysis.summary.recommendations.reduceTotalBones'));
  }
  
  // Mesh recommendations
  if (meshMetrics.totalVertices > 500) {
    recommendations.push(i18n.t('analysis.summary.recommendations.reduceVertices'));
  }
  if (meshMetrics.deformedMeshCount > 5) {
    recommendations.push(i18n.t('analysis.summary.recommendations.minimizeDeformedMeshes'));
  }
  if (meshMetrics.weightedMeshCount > 5) {
    recommendations.push(i18n.t('analysis.summary.recommendations.reduceWeightedMeshes'));
  }
  
  // Clipping recommendations
  if (clippingMetrics.maskCount > 2) {
    recommendations.push(i18n.t('analysis.summary.recommendations.limitClippingMasks'));
  }
  if (clippingMetrics.complexMasks > 0) {
    recommendations.push(i18n.t('analysis.summary.recommendations.simplifyComplexMasks'));
  }
  
  // Blend mode recommendations
  if (blendModeMetrics.nonNormalBlendModeCount > 2) {
    recommendations.push(i18n.t('analysis.summary.recommendations.reduceNonNormalBlendModes'));
  }
  if (blendModeMetrics.additiveCount > 5) {
    recommendations.push(i18n.t('analysis.summary.recommendations.minimizeAdditiveBlendModes'));
  }
  
  // Constraint recommendations
  if (constraintMetrics.physicsCount > 1) {
    recommendations.push(i18n.t('analysis.summary.recommendations.reducePhysicsConstraints'));
  }
  if (constraintMetrics.ikImpact > 50) {
    recommendations.push(i18n.t('analysis.summary.recommendations.simplifyIkConstraints'));
  }
  if (constraintMetrics.pathImpact > 50) {
    recommendations.push(i18n.t('analysis.summary.recommendations.optimizePathConstraints'));
  }
  
  // Generate HTML summary
  const scoreColor = getScoreColor(overallScore);
  
  return `
    <div class="benchmark-summary">
      <h2>${i18n.t('analysis.summary.title')}</h2>
      <p>${i18n.t('analysis.summary.skeletonLabel', { name: skeletonData.name || 'Unnamed' })}</p>
      
      <div class="score-container">
        <div class="performance-score" style="color: ${scoreColor}">${Math.round(overallScore)}</div>
        <div class="score-label">${i18n.t('analysis.summary.performanceLabel', { rating: performanceRating })}</div>
        <p class="score-interpretation">${interpretation}</p>
      </div>
      
      <h3>${i18n.t('analysis.summary.componentScoresTitle')}</h3>
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>${i18n.t('analysis.summary.tableHeaders.component')}</th>
            <th>${i18n.t('analysis.summary.tableHeaders.score')}</th>
            <th>${i18n.t('analysis.summary.tableHeaders.weight')}</th>
            <th>${i18n.t('analysis.summary.tableHeaders.meter')}</th>
          </tr>
        </thead>
        <tbody>
          ${componentScores.map(component => `
            <tr>
              <td>${component.name}</td>
              <td>${component.score.toFixed(1)}</td>
              <td>${component.weight}</td>
              <td>
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${component.score}%; background-color: ${getScoreColor(component.score)};"></div>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <h3>${i18n.t('analysis.summary.skeletonStatsTitle')}</h3>
      <div class="stats-container">
        <table class="stats-table">
          <tbody>
            ${stats.map(stat => `
              <tr>
                <td>${stat.name}</td>
                <td>${stat.value}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      ${recommendations.length > 0 ? `
        <div class="optimization-tips">
          <h3>${i18n.t('analysis.summary.optimizationTitle')}</h3>
          <ul>
            ${recommendations.map(tip => `<li>${tip}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      
      <div class="performance-explanation">
        <h3>${i18n.t('analysis.summary.performanceExplanationTitle')}</h3>
        <table class="benchmark-table">
          <thead>
            <tr>
              <th>${i18n.t('analysis.summary.tableHeaders.scoreRange')}</th>
              <th>${i18n.t('analysis.summary.tableHeaders.rating')}</th>
              <th>${i18n.t('analysis.summary.tableHeaders.interpretation')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${i18n.t('analysis.summary.performanceRanges.excellent.range')}</td>
              <td>${i18n.t('analysis.summary.performanceRanges.excellent.rating')}</td>
              <td>${i18n.t('analysis.summary.performanceRanges.excellent.description')}</td>
            </tr>
            <tr>
              <td>${i18n.t('analysis.summary.performanceRanges.good.range')}</td>
              <td>${i18n.t('analysis.summary.performanceRanges.good.rating')}</td>
              <td>${i18n.t('analysis.summary.performanceRanges.good.description')}</td>
            </tr>
            <tr>
              <td>${i18n.t('analysis.summary.performanceRanges.moderate.range')}</td>
              <td>${i18n.t('analysis.summary.performanceRanges.moderate.rating')}</td>
              <td>${i18n.t('analysis.summary.performanceRanges.moderate.description')}</td>
            </tr>
            <tr>
              <td>${i18n.t('analysis.summary.performanceRanges.poor.range')}</td>
              <td>${i18n.t('analysis.summary.performanceRanges.poor.rating')}</td>
              <td>${i18n.t('analysis.summary.performanceRanges.poor.description')}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}