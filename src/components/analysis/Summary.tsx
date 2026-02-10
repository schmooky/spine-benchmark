import React from 'react';
import { useTranslation } from 'react-i18next';
import { SpineAnalysisResult } from '../../core/SpineAnalyzer';
import { getScoreColor, getScoreRating, getScoreInterpretation } from '../../core/utils/scoreCalculator';

interface SummaryProps {
  data: SpineAnalysisResult;
}

export const Summary: React.FC<SummaryProps> = ({ data }) => {
  const { t } = useTranslation();
  
  const { medianScore, bestAnimation, worstAnimation, stats, skeleton } = data;
  const performanceRating = getScoreRating(medianScore);
  const interpretation = getScoreInterpretation(medianScore);
  const scoreColor = getScoreColor(medianScore);
  
  // Sort animations by score for the table
  const sortedAnimations = [...data.animations].sort((a, b) => b.overallScore - a.overallScore);
  
  return (
    <div className="benchmark-summary">
      <h2>{t('analysis.summary.title')}</h2>
      <p>{t('analysis.summary.skeletonLabel', { name: data.skeletonName })}</p>
      
      <div className="score-container">
        <div className="performance-score" style={{ color: scoreColor }}>
          {Math.round(medianScore)}
        </div>
        <div className="score-label">
          {t('analysis.summary.medianPerformanceLabel', { rating: performanceRating })}
        </div>
        <p className="score-interpretation">{interpretation}</p>
      </div>
      
      <AnimationOverview data={data} />
      <AnimationScoresTable animations={sortedAnimations} />
      <GlobalStatistics data={data} />
      <OptimizationRecommendations data={data} />
      <PerformanceExplanation />
    </div>
  );
};

const AnimationOverview: React.FC<{ data: SpineAnalysisResult }> = ({ data }) => {
  const { t } = useTranslation();
  const { bestAnimation, worstAnimation, stats } = data;
  
  return (
    <div className="animation-overview">
      <h3>{t('analysis.summary.animationOverview.title')}</h3>
      <div className="overview-stats">
        <div className="stat-item">
          <span className="stat-label">{t('analysis.summary.animationOverview.totalAnimations')}</span>
          <span className="stat-value">{data.totalAnimations}</span>
        </div>
        {bestAnimation && (
          <div className="stat-item">
            <span className="stat-label">{t('analysis.summary.animationOverview.bestPerformance')}</span>
            <span className="stat-value">
              {bestAnimation.name} ({bestAnimation.overallScore.toFixed(1)}%)
            </span>
          </div>
        )}
        {worstAnimation && (
          <div className="stat-item">
            <span className="stat-label">{t('analysis.summary.animationOverview.worstPerformance')}</span>
            <span className="stat-value">
              {worstAnimation.name} ({worstAnimation.overallScore.toFixed(1)}%)
            </span>
          </div>
        )}
        <div className="stat-item">
          <span className="stat-label">{t('analysis.summary.animationOverview.withPhysics')}</span>
          <span className="stat-value">{t('analysis.summary.animationOverview.animationsCount', { count: stats.animationsWithPhysics })}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t('analysis.summary.animationOverview.withClipping')}</span>
          <span className="stat-value">{t('analysis.summary.animationOverview.animationsCount', { count: stats.animationsWithClipping })}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t('analysis.summary.animationOverview.withSpecialBlendModes')}</span>
          <span className="stat-value">{t('analysis.summary.animationOverview.animationsCount', { count: stats.animationsWithBlendModes })}</span>
        </div>
      </div>
    </div>
  );
};

const AnimationScoresTable: React.FC<{ animations: any[] }> = ({ animations }) => {
  const { t } = useTranslation();
  return (
    <>
      <h3>{t('analysis.summary.perAnimationScoresTitle')}</h3>
      <table className="benchmark-table">
        <thead>
          <tr>
            <th>{t('analysis.common.headers.animation')}</th>
            <th>{t('analysis.summary.tableHeaders.duration')}</th>
            <th>{t('analysis.summary.tableHeaders.overallScore')}</th>
            <th>{t('analysis.summary.tableHeaders.activeFeatures')}</th>
            <th>{t('analysis.summary.tableHeaders.performanceImpact')}</th>
          </tr>
        </thead>
        <tbody>
          {animations.map((animation) => {
            const features = [];
            if (animation.activeComponents.hasPhysics) features.push(t('analysis.summary.features.physics'));
            if (animation.activeComponents.hasIK) features.push(t('analysis.summary.features.ik'));
            if (animation.activeComponents.hasClipping) features.push(t('analysis.summary.features.clipping'));
            if (animation.activeComponents.hasBlendModes) features.push(t('analysis.summary.features.blend'));
            
            const rowClass = animation.overallScore < 55 ? 'row-danger' : 
                           animation.overallScore < 70 ? 'row-warning' : '';
            
            const impact = animation.overallScore >= 85 ? t('analysis.summary.impact.minimal') :
                          animation.overallScore >= 70 ? t('analysis.summary.impact.low') :
                          animation.overallScore >= 55 ? t('analysis.summary.impact.moderate') :
                          animation.overallScore >= 40 ? t('analysis.summary.impact.high') : t('analysis.summary.impact.veryHigh');
            
            return (
              <tr key={animation.name} className={rowClass}>
                <td>{animation.name}</td>
                <td>{animation.duration.toFixed(2)}s</td>
                <td>
                  <div className="inline-score">
                    <span>{animation.overallScore.toFixed(1)}%</span>
                    <div className="mini-progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ 
                          width: `${animation.overallScore}%`, 
                          backgroundColor: getScoreColor(animation.overallScore) 
                        }}
                      />
                    </div>
                  </div>
                </td>
                <td>{features.length > 0 ? features.join(', ') : t('analysis.summary.features.none')}</td>
                <td>{impact}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
};

const GlobalStatistics: React.FC<{ data: SpineAnalysisResult }> = ({ data }) => {
  const { t } = useTranslation();
  const { skeleton } = data;
  
  return (
    <>
      <h3>{t('analysis.summary.globalSkeletonStatisticsTitle')}</h3>
      <div className="stats-container">
        <table className="stats-table">
          <tbody>
            <tr>
              <td>{t('analysis.summary.statistics.totalBones')}</td>
              <td>{skeleton.metrics.totalBones}</td>
            </tr>
            <tr>
              <td>{t('analysis.summary.statistics.maxBoneDepth')}</td>
              <td>{skeleton.metrics.maxDepth}</td>
            </tr>
            <tr>
              <td>{t('analysis.summary.statistics.totalAnimations')}</td>
              <td>{data.totalAnimations}</td>
            </tr>
            <tr>
              <td>{t('analysis.summary.statistics.skins')}</td>
              <td>{data.totalSkins}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
};

const OptimizationRecommendations: React.FC<{ data: SpineAnalysisResult }> = ({ data }) => {
  const { t } = useTranslation();
  
  const recommendations: string[] = [];
  const { skeleton, stats, animations } = data;
  
  // Bone recommendations
  if (skeleton.metrics.maxDepth > 5) {
    recommendations.push(t('analysis.summary.recommendations.reduceBoneDepth'));
  }
  if (skeleton.metrics.totalBones > 50) {
    recommendations.push(t('analysis.summary.recommendations.reduceTotalBones'));
  }
  
  // Animation-specific recommendations
  if (stats.animationsWithPhysics > data.totalAnimations * 0.5) {
    recommendations.push(
      t('analysis.summary.recommendations.physicsUsage', {
        used: stats.animationsWithPhysics,
        total: data.totalAnimations
      })
    );
  }
  
  if (stats.animationsWithClipping > 0) {
    const clippingAnimations = animations.filter(a => a.activeComponents.hasClipping);
    const animationNames = clippingAnimations.slice(0, 3).map(a => a.name).join(', ');
    const more = clippingAnimations.length > 3 ? t('analysis.summary.recommendations.andMore', { count: clippingAnimations.length - 3 }) : '';
    recommendations.push(
      t('analysis.summary.recommendations.clippingFound', { names: animationNames, more })
    );
  }
  
  if (stats.highVertexAnimations > 0) {
    const highVertexAnims = animations.filter(a => a.meshMetrics.totalVertices > 500);
    recommendations.push(
      t('analysis.summary.recommendations.highVertexAnimations', {
        count: stats.highVertexAnimations,
        names: highVertexAnims.slice(0, 3).map(a => a.name).join(', ')
      })
    );
  }
  
  if (stats.poorPerformingAnimations > 0) {
    const poorAnims = animations.filter(a => a.overallScore < 55);
    recommendations.push(
      t('analysis.summary.recommendations.focusPoorAnimations', {
        names: poorAnims.slice(0, 3).map(a => `${a.name} (${a.overallScore.toFixed(0)}%)`).join(', ')
      })
    );
  }
  
  // Find animations with multiple expensive features
  const multiIssueAnimations = animations.filter(a => {
    let issueCount = 0;
    if (a.activeComponents.hasPhysics) issueCount++;
    if (a.activeComponents.hasClipping) issueCount++;
    if (a.meshMetrics.deformedMeshCount > 3) issueCount++;
    if (a.blendModeMetrics.activeNonNormalCount > 2) issueCount++;
    return issueCount >= 2;
  });
  
  if (multiIssueAnimations.length > 0) {
    recommendations.push(
      t('analysis.summary.recommendations.multiIssueAnimations', {
        count: multiIssueAnimations.length,
        names: multiIssueAnimations.slice(0, 2).map(a => a.name).join(', ')
      })
    );
  }
  
  if (recommendations.length === 0) {
    recommendations.push(t('analysis.summary.recommendations.performanceGenerallyGood'));
  }
  
  return (
    <div className="optimization-tips">
      <h3>{t('analysis.summary.optimizationTitle')}</h3>
      <ul>
        {recommendations.map((tip, index) => (
          <li key={index}>{tip}</li>
        ))}
      </ul>
    </div>
  );
};

const PerformanceExplanation: React.FC = () => {
  const { t } = useTranslation();
  
  return (
    <div className="performance-explanation">
      <h3>{t('analysis.summary.performanceExplanationTitle')}</h3>
      <table className="benchmark-table">
        <thead>
          <tr>
            <th>{t('analysis.summary.tableHeaders.scoreRange')}</th>
            <th>{t('analysis.summary.tableHeaders.rating')}</th>
            <th>{t('analysis.summary.tableHeaders.interpretation')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{t('analysis.summary.performanceRanges.excellent.range')}</td>
            <td>{t('analysis.summary.performanceRanges.excellent.rating')}</td>
            <td>{t('analysis.summary.performanceRanges.excellent.description')}</td>
          </tr>
          <tr>
            <td>{t('analysis.summary.performanceRanges.good.range')}</td>
            <td>{t('analysis.summary.performanceRanges.good.rating')}</td>
            <td>{t('analysis.summary.performanceRanges.good.description')}</td>
          </tr>
          <tr>
            <td>{t('analysis.summary.performanceRanges.moderate.range')}</td>
            <td>{t('analysis.summary.performanceRanges.moderate.rating')}</td>
            <td>{t('analysis.summary.performanceRanges.moderate.description')}</td>
          </tr>
          <tr>
            <td>{t('analysis.summary.performanceRanges.poor.range')}</td>
            <td>{t('analysis.summary.performanceRanges.poor.rating')}</td>
            <td>{t('analysis.summary.performanceRanges.poor.description')}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
