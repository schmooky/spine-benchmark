import { ClippingAttachment, Spine } from '@esotericsoftware/spine-pixi-v8';
import { PERFORMANCE_FACTORS } from '../constants/performanceFactors';
import { calculateClippingScore, getScoreColor } from '../utils/scoreCalculator';
import i18n from '../../i18n';

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
      <h3>${i18n.t('analysis.clipping.title')}</h3>
      <p>${i18n.t('analysis.clipping.statistics.totalMasks', { count: masks.length })}</p>
      <p>${i18n.t('analysis.clipping.statistics.totalVerticesInMasks', { count: totalVertices })}</p>
      <p>${i18n.t('analysis.clipping.statistics.complexMasks', { count: complexMasks })}</p>
      
      <div class="performance-score">
        <h4>${i18n.t('analysis.clipping.performanceScore.title', { score: clippingScore.toFixed(1) })}</h4>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${clippingScore}%; background-color: ${getScoreColor(clippingScore)};"></div>
        </div>
      </div>
      
      <div class="analysis-metrics">
        <p><strong>${i18n.t('analysis.clipping.formula.title')}</strong></p>
        <code>${i18n.t('analysis.clipping.formula.description', { idealClippingCount: PERFORMANCE_FACTORS.IDEAL_CLIPPING_COUNT })}</code>
      </div>
  `;
  
  if (masks.length > 0) {
    html += `
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>${i18n.t('analysis.clipping.tableHeaders.slotName')}</th>
            <th>${i18n.t('analysis.clipping.tableHeaders.vertexCount')}</th>
            <th>${i18n.t('analysis.clipping.tableHeaders.status')}</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    masks.forEach(([slotName, vertexCount]) => {
      const status = vertexCount <= 4 
        ? i18n.t('analysis.clipping.status.optimal')
        : vertexCount <= 8 
          ? i18n.t('analysis.clipping.status.acceptable')
          : i18n.t('analysis.clipping.status.highVertexCount');
      
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
        <h4>${i18n.t('analysis.clipping.notes.title')}</h4>
        <ul>
          <li><strong>${i18n.t('analysis.clipping.notes.highImpact')}</strong></li>
          <li><strong>${i18n.t('analysis.clipping.notes.vertexCount')}</strong></li>
          <li><strong>${i18n.t('analysis.clipping.notes.optimalConfiguration')}</strong></li>
          <li><strong>${i18n.t('analysis.clipping.notes.gpuCost')}</strong></li>
          <li><strong>${i18n.t('analysis.clipping.notes.recommendation')}</strong></li>
        </ul>
      </div>
    `;
  } else {
    html += `<p>${i18n.t('analysis.clipping.noMasks')}</p>`;
  }
  
  html += `</div>`;
  
  return {html, metrics};
}