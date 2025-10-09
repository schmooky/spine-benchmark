import React from 'react';
import { useTranslation } from 'react-i18next';
import { SpinePerformanceAnalysisResult } from '../../core/SpinePerformanceAnalyzer';
import { getScoreColor, getScoreRating, getScoreInterpretation } from '../../core/utils/performanceCalculator';

interface PerformanceSummaryProps {
  data: SpinePerformanceAnalysisResult;
}

export const PerformanceSummary: React.FC<PerformanceSummaryProps> = ({ data }) => {
  const { t } = useTranslation();
  
  const { medianScore, bestAnimation, worstAnimation, globalMetrics } = data;
  const performanceRating = getScoreRating(medianScore);
  const interpretation = getScoreInterpretation(medianScore);
  const scoreColor = getScoreColor(medianScore);
  
  // Sort animations by score for the table
  const sortedAnimations = [...data.animations].sort((a, b) => 
    b.metrics.performanceScore - a.metrics.performanceScore
  );
  
  return (
    <div className="performance-summary">
      <h2>{t('analysis.performance.title')}</h2>
      <p>{t('analysis.performance.skeletonLabel', { name: data.skeletonName })}</p>
      
      <div className="score-container">
        <div className="performance-score" style={{ color: scoreColor }}>
          {Math.round(medianScore)}
        </div>
        <div className="score-label">
          {t('analysis.performance.medianScoreLabel', { rating: performanceRating })}
        </div>
        <p className="score-interpretation">{interpretation}</p>
      </div>
      
      <GlobalMetricsOverview metrics={globalMetrics} />
      <AnimationPerformanceTable animations={sortedAnimations} />
      <ImpactBreakdown animations={data.animations} />
      <OptimizationRecommendations data={data} />
    </div>
  );
};

const GlobalMetricsOverview: React.FC<{ metrics: any }> = ({ metrics }) => {
  const { t } = useTranslation();
  
  return (
    <div className="global-metrics">
      <h3>{t('analysis.performance.globalMetrics')}</h3>
      <div className="metrics-grid">
        <div className="metric-item">
          <span className="metric-label">Computation Impact (CI):</span>
          <span className="metric-value">{metrics.computationImpact.toFixed(2)}</span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Rendering Impact (RI):</span>
          <span className="metric-value">{metrics.renderingImpact.toFixed(2)}</span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Total Impact:</span>
          <span className="metric-value">{metrics.totalImpact.toFixed(2)}</span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Performance Score:</span>
          <span className="metric-value" style={{ color: getScoreColor(metrics.performanceScore) }}>
            {metrics.performanceScore.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  );
};

const AnimationPerformanceTable: React.FC<{ animations: any[] }> = ({ animations }) => {
  const { t } = useTranslation();
  
  const getCIColor = (ci: number) => {
    if (ci <= 30) return '#6bcf7f';
    if (ci <= 100) return '#ffd93d';
    return '#ff6b6b';
  };
  
  const getRIColor = (ri: number) => {
    if (ri <= 20) return '#95e1a3';
    if (ri <= 50) return '#ffe66d';
    return '#ff8787';
  };
  
  return (
    <>
      <h3>{t('analysis.performance.animationScores')}</h3>
      <table className="benchmark-table performance-table">
        <thead>
          <tr>
            <th>Animation</th>
            <th>Duration</th>
            <th style={{ color: '#6bcf7f' }}>CI (CPU)</th>
            <th style={{ color: '#95e1a3' }}>RI (GPU)</th>
            <th>Total Impact</th>
            <th>Score</th>
            <th>Rating</th>
          </tr>
        </thead>
        <tbody>
          {animations.map((animation) => {
            const { metrics } = animation;
            const rating = getScoreRating(metrics.performanceScore);
            const rowClass = metrics.performanceScore < 50 ? 'row-danger' :
                           metrics.performanceScore < 70 ? 'row-warning' : '';
            
            return (
              <tr key={animation.name} className={rowClass}>
                <td className="animation-name">{animation.name}</td>
                <td>{animation.duration.toFixed(2)}s</td>
                <td>
                  <span
                    className="impact-badge ci"
                    style={{
                      color: getCIColor(metrics.computationImpact),
                      fontWeight: 700
                    }}
                  >
                    {metrics.computationImpact.toFixed(1)}
                  </span>
                </td>
                <td>
                  <span
                    className="impact-badge ri"
                    style={{
                      color: getRIColor(metrics.renderingImpact),
                      fontWeight: 700
                    }}
                  >
                    {metrics.renderingImpact.toFixed(1)}
                  </span>
                </td>
                <td className="total-impact">{metrics.totalImpact.toFixed(1)}</td>
                <td>
                  <div className="inline-score">
                    <span>{metrics.performanceScore.toFixed(1)}</span>
                    <div className="mini-progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${metrics.performanceScore}%`,
                          backgroundColor: getScoreColor(metrics.performanceScore)
                        }}
                      />
                    </div>
                  </div>
                </td>
                <td>{rating}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
};

const ImpactBreakdown: React.FC<{ animations: any[] }> = ({ animations }) => {
  const { t } = useTranslation();
  
  // Find animation with highest impacts
  let maxCIAnimation = animations[0];
  let maxRIAnimation = animations[0];
  
  animations.forEach(anim => {
    if (anim.metrics.computationImpact > maxCIAnimation.metrics.computationImpact) {
      maxCIAnimation = anim;
    }
    if (anim.metrics.renderingImpact > maxRIAnimation.metrics.renderingImpact) {
      maxRIAnimation = anim;
    }
  });
  
  return (
    <div className="impact-breakdown">
      <h3>{t('analysis.performance.impactBreakdown')}</h3>
      
      <h4>Highest Computation Impact: {maxCIAnimation.name}</h4>
      <div className="breakdown-details">
        <p>Bones: {maxCIAnimation.frameMetrics.bones.count}</p>
        <p>Max Depth: {Math.max(...maxCIAnimation.frameMetrics.bones.depths)}</p>
        <p>IK Chains: {maxCIAnimation.frameMetrics.constraints.ikChains.join(', ') || 'None'}</p>
        <p>Physics Constraints: {maxCIAnimation.frameMetrics.constraints.physicsCount}</p>
        <p>Mesh Vertices: {maxCIAnimation.frameMetrics.meshes.vertexCount}</p>
        <p>Deform Timelines: {maxCIAnimation.frameMetrics.meshes.deformTimelines}</p>
      </div>
      
      <h4>Highest Rendering Impact: {maxRIAnimation.name}</h4>
      <div className="breakdown-details">
        <p>Estimated Draw Calls: {maxRIAnimation.frameMetrics.rendering.estimatedDrawCalls}</p>
        <p>Rendered Triangles: {maxRIAnimation.frameMetrics.rendering.renderedTriangles}</p>
        <p>Non-Normal Blend Slots: {maxRIAnimation.frameMetrics.rendering.nonNormalBlendSlots}</p>
        <p>Clipping Transitions: {maxRIAnimation.frameMetrics.clipping.transitions}</p>
      </div>
    </div>
  );
};

const OptimizationRecommendations: React.FC<{ data: SpinePerformanceAnalysisResult }> = ({ data }) => {
  const { t } = useTranslation();
  const recommendations: string[] = [];
  
  // Analyze worst performing animation
  if (data.worstAnimation && data.worstAnimation.metrics.performanceScore < 50) {
    const worst = data.worstAnimation;
    
    if (worst.metrics.computationImpact > 100) {
      recommendations.push(`Animation "${worst.name}" has very high computation impact (${worst.metrics.computationImpact.toFixed(0)}). Consider reducing bone count, constraint complexity, or mesh vertices.`);
    }
    
    if (worst.metrics.renderingImpact > 50) {
      recommendations.push(`Animation "${worst.name}" has high rendering impact (${worst.metrics.renderingImpact.toFixed(0)}). Consider reducing draw calls, triangle count, or blend mode usage.`);
    }
  }
  
  // Check for depth issues
  data.animations.forEach(anim => {
    const maxDepth = Math.max(...anim.frameMetrics.bones.depths);
    const balancedDepth = Math.ceil(Math.log2(anim.frameMetrics.bones.count + 1));
    if (maxDepth > balancedDepth + 3) {
      recommendations.push(`Animation "${anim.name}" has excessive bone hierarchy depth (${maxDepth} vs ideal ${balancedDepth}). Consider flattening the hierarchy.`);
    }
  });
  
  // Check for high vertex counts
  const highVertexAnimations = data.animations.filter(a => 
    a.frameMetrics.meshes.vertexCount > 1000
  );
  if (highVertexAnimations.length > 0) {
    recommendations.push(`${highVertexAnimations.length} animations have over 1000 mesh vertices. Consider simplifying meshes or using LODs.`);
  }
  
  // Check for excessive draw calls
  const highDrawCallAnimations = data.animations.filter(a => 
    a.frameMetrics.rendering.estimatedDrawCalls > 10
  );
  if (highDrawCallAnimations.length > 0) {
    recommendations.push(`${highDrawCallAnimations.length} animations have over 10 estimated draw calls. Consider batching or reducing state changes.`);
  }
  
  if (recommendations.length === 0) {
    recommendations.push('Performance is generally good. Minor optimizations may still improve performance on low-end devices.');
  }
  
  return (
    <div className="optimization-tips">
      <h3>{t('analysis.performance.optimizationTitle')}</h3>
      <ul>
        {recommendations.map((tip, index) => (
          <li key={index}>{tip}</li>
        ))}
      </ul>
    </div>
  );
};