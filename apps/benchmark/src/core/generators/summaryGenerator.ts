import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { getScoreColor, getScoreRating, getScoreInterpretation } from "../utils/scoreCalculator";
import { AnimationAnalysis } from "../SpineAnalyzer";
import i18n from "../../i18n";

/**
 * Generates a comprehensive HTML summary with per-animation analysis
 * @param spineInstance The analyzed Spine instance
 * @param boneMetrics Bone analysis metrics
 * @param animationAnalyses Per-animation analysis data
 * @param medianScore Median performance score across all animations
 * @returns HTML string containing the summary
 */
export function generateAnimationSummary(
  spineInstance: Spine,
  boneMetrics: any,
  animationAnalyses: AnimationAnalysis[],
  medianScore: number
): string {
  // Get the skeleton data
  const skeleton = spineInstance.skeleton;
  const skeletonData = skeleton.data;
  
  // Get performance rating and interpretation for median score
  const performanceRating = getScoreRating(medianScore);
  const interpretation = getScoreInterpretation(medianScore);
  
  // Find best and worst performing animations
  const sortedAnalyses = [...animationAnalyses].sort((a, b) => b.overallScore - a.overallScore);
  const bestAnimation = sortedAnalyses[0];
  const worstAnimation = sortedAnalyses[sortedAnalyses.length - 1];
  
  // Calculate aggregate statistics
  const totalMeshesAcrossAnimations = animationAnalyses.reduce((sum, a) => sum + a.meshMetrics.activeMeshCount, 0);
  const totalVerticesAcrossAnimations = animationAnalyses.reduce((sum, a) => sum + a.meshMetrics.totalVertices, 0);
  const animationsWithPhysics = animationAnalyses.filter(a => a.activeComponents.hasPhysics).length;
  const animationsWithClipping = animationAnalyses.filter(a => a.activeComponents.hasClipping).length;
  const animationsWithBlendModes = animationAnalyses.filter(a => a.activeComponents.hasBlendModes).length;
  
  // Generate HTML summary
  const scoreColor = getScoreColor(medianScore);
  
  return `
    <div class="benchmark-summary">
      <h2>${i18n.t('analysis.summary.title')}</h2>
      <p>${i18n.t('analysis.summary.skeletonLabel', { name: skeletonData.name || 'Unnamed' })}</p>
      
      <div class="score-container">
        <div class="performance-score" style="color: ${scoreColor}">${Math.round(medianScore)}</div>
        <div class="score-label">${i18n.t('analysis.summary.medianPerformanceLabel', { rating: performanceRating })}</div>
        <p class="score-interpretation">${interpretation}</p>
      </div>
      
      <h3>Animation Performance Overview</h3>
      <div class="animation-overview">
        <div class="overview-stats">
          <div class="stat-item">
            <span class="stat-label">Total Animations:</span>
            <span class="stat-value">${animationAnalyses.length}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Best Performance:</span>
            <span class="stat-value">${bestAnimation.name} (${bestAnimation.overallScore.toFixed(1)}%)</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Worst Performance:</span>
            <span class="stat-value">${worstAnimation.name} (${worstAnimation.overallScore.toFixed(1)}%)</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">With Physics:</span>
            <span class="stat-value">${animationsWithPhysics} animations</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">With Clipping:</span>
            <span class="stat-value">${animationsWithClipping} animations</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">With Special Blend Modes:</span>
            <span class="stat-value">${animationsWithBlendModes} animations</span>
          </div>
        </div>
      </div>
      
      <h3>Per-Animation Scores</h3>
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Animation</th>
            <th>Duration</th>
            <th>Overall Score</th>
            <th>Active Features</th>
            <th>Performance Impact</th>
          </tr>
        </thead>
        <tbody>
          ${sortedAnalyses.map(analysis => {
            const features = [];
            if (analysis.activeComponents.hasPhysics) features.push('Physics');
            if (analysis.activeComponents.hasIK) features.push('IK');
            if (analysis.activeComponents.hasClipping) features.push('Clipping');
            if (analysis.activeComponents.hasBlendModes) features.push('Blend');
            
            const rowClass = analysis.overallScore < 55 ? 'row-danger' : 
                           analysis.overallScore < 70 ? 'row-warning' : '';
            
            const impact = analysis.overallScore >= 85 ? 'Minimal' :
                          analysis.overallScore >= 70 ? 'Low' :
                          analysis.overallScore >= 55 ? 'Moderate' :
                          analysis.overallScore >= 40 ? 'High' : 'Very High';
            
            return `
              <tr class="${rowClass}">
                <td>${analysis.name}</td>
                <td>${analysis.duration.toFixed(2)}s</td>
                <td>
                  <div class="inline-score">
                    <span>${analysis.overallScore.toFixed(1)}%</span>
                    <div class="mini-progress-bar">
                      <div class="progress-fill" style="width: ${analysis.overallScore}%; background-color: ${getScoreColor(analysis.overallScore)};"></div>
                    </div>
                  </div>
                </td>
                <td>${features.length > 0 ? features.join(', ') : 'None'}</td>
                <td>${impact}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      
      <h3>Global Skeleton Statistics</h3>
      <div class="stats-container">
        <table class="stats-table">
          <tbody>
            <tr>
              <td>${i18n.t('analysis.summary.statistics.totalBones')}</td>
              <td>${boneMetrics.totalBones}</td>
            </tr>
            <tr>
              <td>${i18n.t('analysis.summary.statistics.maxBoneDepth')}</td>
              <td>${boneMetrics.maxDepth}</td>
            </tr>
            <tr>
              <td>${i18n.t('analysis.summary.statistics.totalAnimations')}</td>
              <td>${skeletonData.animations.length}</td>
            </tr>
            <tr>
              <td>${i18n.t('analysis.summary.statistics.skins')}</td>
              <td>${skeletonData.skins.length}</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      ${generateOptimizationRecommendations(animationAnalyses, boneMetrics)}
      
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

/**
 * Generate optimization recommendations based on animation analyses
 */
function generateOptimizationRecommendations(
  animationAnalyses: AnimationAnalysis[],
  boneMetrics: any
): string {
  const recommendations: string[] = [];
  
  // Find common issues across animations
  const physicsAnimations = animationAnalyses.filter(a => a.activeComponents.hasPhysics);
  const clippingAnimations = animationAnalyses.filter(a => a.activeComponents.hasClipping);
  const highVertexAnimations = animationAnalyses.filter(a => a.meshMetrics.totalVertices > 500);
  const poorPerformingAnimations = animationAnalyses.filter(a => a.overallScore < 55);
  
  // Bone recommendations
  if (boneMetrics.maxDepth > 5) {
    recommendations.push(i18n.t('analysis.summary.recommendations.reduceBoneDepth'));
  }
  if (boneMetrics.totalBones > 50) {
    recommendations.push(i18n.t('analysis.summary.recommendations.reduceTotalBones'));
  }
  
  // Animation-specific recommendations
  if (physicsAnimations.length > animationAnalyses.length * 0.5) {
    recommendations.push(`Physics constraints are used in ${physicsAnimations.length} out of ${animationAnalyses.length} animations. Consider baking physics simulation for static animations.`);
  }
  
  if (clippingAnimations.length > 0) {
    const animationNames = clippingAnimations.slice(0, 3).map(a => a.name).join(', ');
    const more = clippingAnimations.length > 3 ? ` and ${clippingAnimations.length - 3} more` : '';
    recommendations.push(`Clipping masks found in: ${animationNames}${more}. Consider using alpha blending or pre-masked textures instead.`);
  }
  
  if (highVertexAnimations.length > 0) {
    recommendations.push(`${highVertexAnimations.length} animations have high vertex counts (>500). Consider simplifying meshes for: ${highVertexAnimations.slice(0, 3).map(a => a.name).join(', ')}`);
  }
  
  if (poorPerformingAnimations.length > 0) {
    recommendations.push(`Focus optimization on these poor-performing animations: ${poorPerformingAnimations.slice(0, 3).map(a => `${a.name} (${a.overallScore.toFixed(0)}%)`).join(', ')}`);
  }
  
  // Find animations with multiple expensive features
  const multiIssueAnimations = animationAnalyses.filter(a => {
    let issueCount = 0;
    if (a.activeComponents.hasPhysics) issueCount++;
    if (a.activeComponents.hasClipping) issueCount++;
    if (a.meshMetrics.deformedMeshCount > 3) issueCount++;
    if (a.blendModeMetrics.activeNonNormalCount > 2) issueCount++;
    return issueCount >= 2;
  });
  
  if (multiIssueAnimations.length > 0) {
    recommendations.push(`${multiIssueAnimations.length} animations combine multiple expensive features. Consider simplifying: ${multiIssueAnimations.slice(0, 2).map(a => a.name).join(', ')}`);
  }
  
  if (recommendations.length === 0) {
    recommendations.push('Performance is generally good across all animations. Minor optimizations may still be possible in specific areas.');
  }
  
  return `
    <div class="optimization-tips">
      <h3>${i18n.t('analysis.summary.optimizationTitle')}</h3>
      <ul>
        ${recommendations.map(tip => `<li>${tip}</li>`).join('')}
      </ul>
    </div>
  `;
}

