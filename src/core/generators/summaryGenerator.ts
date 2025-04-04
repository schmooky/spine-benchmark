import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { getScoreColor, getScoreRating, getScoreInterpretation } from "../utils/scoreCalculator";

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
    { name: 'Bone Structure', score: boneMetrics.score, weight: '15%' },
    { name: 'Mesh Complexity', score: meshMetrics.score, weight: '25%' },
    { name: 'Clipping Masks', score: clippingMetrics.score, weight: '20%' },
    { name: 'Blend Modes', score: blendModeMetrics.score, weight: '15%' },
    { name: 'Constraints', score: constraintMetrics.score, weight: '25%' },
  ];
  
  // Generate skeleton statistics
  const stats = [
    { name: 'Total Bones', value: boneMetrics.totalBones },
    { name: 'Max Bone Depth', value: boneMetrics.maxDepth },
    { name: 'Total Meshes', value: meshMetrics.totalMeshCount },
    { name: 'Total Vertices', value: meshMetrics.totalVertices },
    { name: 'Clipping Masks', value: clippingMetrics.maskCount },
    { name: 'Non-Normal Blend Modes', value: blendModeMetrics.nonNormalBlendModeCount },
    { name: 'Total Constraints', value: constraintMetrics.totalConstraints },
    { name: 'Animations', value: skeletonData.animations.length },
    { name: 'Skins', value: skeletonData.skins.length },
  ];
  
  // Generate optimization recommendations
  const recommendations: string[] = [];
  
  // Bone recommendations
  if (boneMetrics.maxDepth > 5) {
    recommendations.push('Reduce bone hierarchy depth by flattening the structure where possible.');
  }
  if (boneMetrics.totalBones > 50) {
    recommendations.push('Consider reducing the total number of bones by simplifying the skeleton.');
  }
  
  // Mesh recommendations
  if (meshMetrics.totalVertices > 500) {
    recommendations.push('Reduce the total number of vertices across all meshes.');
  }
  if (meshMetrics.deformedMeshCount > 5) {
    recommendations.push('Minimize the number of deformed meshes, especially those with high vertex counts.');
  }
  if (meshMetrics.weightedMeshCount > 5) {
    recommendations.push('Reduce the number of meshes with bone weights, as they require more calculations.');
  }
  
  // Clipping recommendations
  if (clippingMetrics.maskCount > 2) {
    recommendations.push('Limit the number of clipping masks as they significantly impact performance.');
  }
  if (clippingMetrics.complexMasks > 0) {
    recommendations.push('Simplify complex clipping masks to use fewer vertices (4 or less is optimal).');
  }
  
  // Blend mode recommendations
  if (blendModeMetrics.nonNormalBlendModeCount > 2) {
    recommendations.push('Reduce the number of non-normal blend modes to minimize render state changes.');
  }
  if (blendModeMetrics.additiveCount > 5) {
    recommendations.push('Minimize the use of additive blend modes as they are particularly expensive.');
  }
  
  // Constraint recommendations
  if (constraintMetrics.physicsCount > 1) {
    recommendations.push('Physics constraints are particularly expensive - consider reducing their number or complexity.');
  }
  if (constraintMetrics.ikImpact > 50) {
    recommendations.push('Simplify IK constraints by reducing chain length or number of affected bones.');
  }
  if (constraintMetrics.pathImpact > 50) {
    recommendations.push('Optimize path constraints by simplifying paths or reducing the number of constrained bones.');
  }
  
  // Generate HTML summary
  const scoreColor = getScoreColor(overallScore);
  
  return `
    <div class="benchmark-summary">
      <h2>Spine Performance Analysis</h2>
      <p>Skeleton: ${skeletonData.name || 'Unnamed'}</p>
      
      <div class="score-container">
        <div class="performance-score" style="color: ${scoreColor}">${Math.round(overallScore)}</div>
        <div class="score-label">${performanceRating} Performance</div>
        <p class="score-interpretation">${interpretation}</p>
      </div>
      
      <h3>Component Scores</h3>
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Component</th>
            <th>Score</th>
            <th>Weight</th>
            <th>Meter</th>
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
      
      <h3>Skeleton Statistics</h3>
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
          <h3>Optimization Recommendations</h3>
          <ul>
            ${recommendations.map(tip => `<li>${tip}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      
      <div class="performance-explanation">
        <h3>Performance Score Interpretation</h3>
        <table class="benchmark-table">
          <thead>
            <tr>
              <th>Score Range</th>
              <th>Rating</th>
              <th>Interpretation</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>85-100</td>
              <td>Excellent</td>
              <td>Suitable for all platforms and continuous animations</td>
            </tr>
            <tr>
              <td>70-84</td>
              <td>Good</td>
              <td>Works well on most platforms but may have issues on low-end devices</td>
            </tr>
            <tr>
              <td>55-69</td>
              <td>Moderate</td>
              <td>May cause performance dips, especially with multiple instances</td>
            </tr>
            <tr>
              <td>40-54</td>
              <td>Poor</td>
              <td>Performance issues likely on most devices</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}