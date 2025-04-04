import { ClippingAttachment, Spine } from '@esotericsoftware/spine-pixi-v8';
import { PERFORMANCE_FACTORS } from '../constants/performanceFactors';
import { calculateClippingScore, getScoreColor } from '../utils/scoreCalculator';

/**
 * Analyzes clipping masks in a Spine instance
 * @param spineInstance The Spine instance to analyze
 * @returns HTML output and metrics for clipping mask analysis
 */
export function analyzeClipping(spineInstance: Spine): { html: string, metrics: any } {
  const masks: [string, number][] = [];
  let totalVertices = 0;
  
  spineInstance.skeleton.slots.forEach((slot) => {
    if (slot.attachment && slot.attachment instanceof ClippingAttachment) {
      const clipping = slot.attachment as ClippingAttachment;
      const verticesCount = clipping.worldVerticesLength / 2; // Divide by 2 because each vertex has x and y
      masks.push([slot.data.name, verticesCount]);
      totalVertices += verticesCount;
    }
  });
  
  // Calculate complexity metrics
  const complexMasks = masks.filter(([_, vertexCount]) => vertexCount > 4).length;
  
  // Calculate clipping score
  const clippingScore = calculateClippingScore(masks.length, totalVertices, complexMasks);
  
  const metrics = {
    maskCount: masks.length,
    totalVertices,
    complexMasks,
    score: clippingScore
  };
  
  let html = `
    <div class="clipping-analysis">
      <h3>Clipping Masks</h3>
      <p>Total masks: ${masks.length}</p>
      <p>Total vertices in masks: ${totalVertices}</p>
      <p>Complex masks (>4 vertices): ${complexMasks}</p>
      
      <div class="performance-score">
        <h4>Clipping Performance Score: ${clippingScore.toFixed(1)}/100</h4>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${clippingScore}%; background-color: ${getScoreColor(clippingScore)};"></div>
        </div>
      </div>
      
      <div class="analysis-metrics">
        <p><strong>Performance Impact Formula:</strong></p>
        <code>clippingScore = 100 - log₂(maskCount/${PERFORMANCE_FACTORS.IDEAL_CLIPPING_COUNT} + 1) × 20 
          - log₂(vertexCount + 1) × 5 
          - (complexMasks × 10)</code>
      </div>
  `;
  
  if (masks.length > 0) {
    html += `
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Slot Name</th>
            <th>Vertex Count</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    masks.forEach(([slotName, vertexCount]) => {
      const status = vertexCount <= 4 
        ? 'Optimal' 
        : vertexCount <= 8 
          ? 'Acceptable' 
          : 'High Vertex Count';
      
      const rowClass = vertexCount <= 4 
        ? '' 
        : vertexCount <= 8 
          ? 'row-warning' 
          : 'row-danger';
      
      html += `
        <tr class="${rowClass}">
          <td>${slotName}</td>
          <td>${vertexCount}</td>
          <td>${status}</td>
        </tr>
      `;
    });
    
    html += `
        </tbody>
      </table>
      
      <div class="analysis-notes">
        <h4>Notes on Clipping Masks:</h4>
        <ul>
          <li><strong>High Impact:</strong> Clipping masks are one of the most expensive operations in Spine rendering</li>
          <li><strong>Vertex Count:</strong> Each vertex in a mask increases the computational cost</li>
          <li><strong>Optimal Configuration:</strong> Use triangular or quadrilateral masks (3-4 vertices) whenever possible</li>
          <li><strong>GPU Cost:</strong> Each clipping mask requires additional GPU rendering passes (stencil buffer operations)</li>
          <li><strong>Recommendation:</strong> Limit to 2-3 masks per skeleton, with fewer than 6 vertices each</li>
        </ul>
      </div>
    `;
  } else {
    html += `<p>No clipping masks found in this skeleton.</p>`;
  }
  
  html += `</div>`;
  
  return {html, metrics};
}