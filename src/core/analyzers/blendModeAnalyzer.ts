import { BlendMode, Spine } from "@esotericsoftware/spine-pixi-v8";
import { PERFORMANCE_FACTORS } from "../constants/performanceFactors";
import { calculateBlendModeScore, getScoreColor } from "../utils/scoreCalculator";

/**
 * Analyzes blend modes in a Spine instance
 * @param spineInstance The Spine instance to analyze
 * @returns HTML output and metrics for blend mode analysis
 */
export function analyzeBlendModes(spineInstance: Spine): { html: string, metrics: any } {
  const blendModeCount = new Map<BlendMode, number>();
  const slotsWithNonNormalBlendMode = new Map<string, BlendMode>();
  
  // Initialize blend mode counts
  Object.values(BlendMode).forEach(mode => {
    if (typeof mode === 'number') {
      blendModeCount.set(mode as BlendMode, 0);
    }
  });
  
  // Count blend modes
  spineInstance.skeleton.slots.forEach(slot => {
    const blendMode = slot.data.blendMode;
    blendModeCount.set(blendMode, (blendModeCount.get(blendMode) || 0) + 1);
    
    if (blendMode !== BlendMode.Normal) {
      slotsWithNonNormalBlendMode.set(slot.data.name, blendMode);
    }
  });
  
  // Count specific blend mode types
  const additiveCount = Array.from(slotsWithNonNormalBlendMode.values())
    .filter(mode => mode === BlendMode.Additive).length;
  
  const multiplyCount = Array.from(slotsWithNonNormalBlendMode.values())
    .filter(mode => mode === BlendMode.Multiply).length;
  
  // Calculate blend mode score
  const blendModeScore = calculateBlendModeScore(slotsWithNonNormalBlendMode.size, additiveCount);
  
  const metrics = {
    nonNormalBlendModeCount: slotsWithNonNormalBlendMode.size,
    additiveCount,
    multiplyCount,
    score: blendModeScore
  };
  
  let html = `
    <div class="blend-mode-analysis">
      <h3>Blend Modes</h3>
      <p>Non-normal blend modes: ${slotsWithNonNormalBlendMode.size}</p>
      <p>Additive blend modes: ${additiveCount}</p>
      <p>Multiply blend modes: ${multiplyCount}</p>
      
      <div class="performance-score">
        <h4>Blend Mode Performance Score: ${blendModeScore.toFixed(1)}/100</h4>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${blendModeScore}%; background-color: ${getScoreColor(blendModeScore)};"></div>
        </div>
      </div>
      
      <div class="analysis-metrics">
        <p><strong>Performance Impact Formula:</strong></p>
        <code>blendModeScore = 100 - log₂(nonNormalCount/${PERFORMANCE_FACTORS.IDEAL_BLEND_MODE_COUNT} + 1) × 20 
          - (additiveCount × 2)</code>
      </div>
      
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Blend Mode</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  // Sort by frequency
  const sortedCounts = Array.from(blendModeCount.entries())
    .sort((a, b) => b[1] - a[1]);
  
  sortedCounts.forEach(([mode, count]) => {
    if (count > 0) {
      const modeName = BlendMode[mode];
      const rowClass = mode !== BlendMode.Normal && count > 0 
        ? 'row-warning' 
        : '';
      
      html += `
        <tr class="${rowClass}">
          <td>${modeName}</td>
          <td>${count}</td>
        </tr>
      `;
    }
  });
  
  html += `
        </tbody>
      </table>
  `;
  
  if (slotsWithNonNormalBlendMode.size > 0) {
    html += `
      <h4>Slots with Non-Normal Blend Modes:</h4>
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Slot Name</th>
            <th>Blend Mode</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    slotsWithNonNormalBlendMode.forEach((mode, slotName) => {
      html += `
        <tr>
          <td>${slotName}</td>
          <td>${BlendMode[mode]}</td>
        </tr>
      `;
    });
    
    html += `
        </tbody>
      </table>
      
      <div class="analysis-notes">
        <h4>Notes on Blend Modes:</h4>
        <ul>
          <li><strong>Normal Blend Mode:</strong> Most efficient, requires a single rendering pass</li>
          <li><strong>Non-Normal Blend Modes:</strong> Each requires a separate render pass or shader switch</li>
          <li><strong>Rendering Cost:</strong> Each blend mode change forces a renderer "flush" operation</li>
          <li><strong>Additive Blend:</strong> Higher cost than normal blend due to blending calculations</li>
          <li><strong>Multiply Blend:</strong> Similar to additive, requires additional GPU operations</li>
          <li><strong>Recommendation:</strong> Limit to 2 non-normal blend modes per skeleton</li>
        </ul>
      </div>
    `;
  }
  
  html += `</div>`;
  
  return {html, metrics};
}