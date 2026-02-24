import React from 'react';
import { useTranslation } from 'react-i18next';
import { SpineAnalysisResult, AnimationAnalysis } from '../../core/SpineAnalyzer';
import { getImpactFromCost, getImpactBadgeClass, ImpactResult } from '../../core/utils/scoreCalculator';

interface SummaryProps {
  data: SpineAnalysisResult;
}

const IMPACT_LABEL_KEYS: Record<string, string> = {
  minimal: 'analysis.summary.impact.minimal',
  low: 'analysis.summary.impact.low',
  moderate: 'analysis.summary.impact.moderate',
  high: 'analysis.summary.impact.high',
  veryHigh: 'analysis.summary.impact.veryHigh',
};

function getImpactLabelKey(level: string): string {
  return IMPACT_LABEL_KEYS[level] ?? IMPACT_LABEL_KEYS.minimal;
}

function renderingImpact(a: AnimationAnalysis): ImpactResult {
  const cost = (a.blendModeMetrics.activeNonNormalCount * 3) + (a.clippingMetrics.activeMaskCount * 5) + (a.meshMetrics.totalVertices / 200);
  return getImpactFromCost(cost);
}

function computationalImpact(a: AnimationAnalysis): ImpactResult {
  const cost = (a.constraintMetrics.activePhysicsCount * 4) + (a.constraintMetrics.activeIkCount * 2) + (a.constraintMetrics.activeTransformCount * 1.5) + (a.constraintMetrics.activePathCount * 2.5) + (a.meshMetrics.deformedMeshCount * 1.5) + (a.meshMetrics.weightedMeshCount * 2);
  return getImpactFromCost(cost);
}

function worstImpact(impacts: ImpactResult[]): ImpactResult {
  if (impacts.length === 0) return getImpactFromCost(0);
  return impacts.reduce((worst, cur) => cur.cost > worst.cost ? cur : worst, impacts[0]);
}

export const Summary: React.FC<SummaryProps> = ({ data }) => {
  const { t } = useTranslation();

  const sortedAnimations = [...data.animations].sort((a, b) => {
    const aCost = renderingImpact(a).cost + computationalImpact(a).cost;
    const bCost = renderingImpact(b).cost + computationalImpact(b).cost;
    return bCost - aCost;
  });

  const worstRendering = worstImpact(data.animations.map(renderingImpact));
  const worstCompute = worstImpact(data.animations.map(computationalImpact));

  // Aggregate metrics across all animations for summary
  const totalBlendBreaks = Math.max(...data.animations.map(a => a.blendModeMetrics.activeNonNormalCount));
  const totalClipMasks = Math.max(...data.animations.map(a => a.clippingMetrics.activeMaskCount));
  const peakVertices = Math.max(...data.animations.map(a => a.meshMetrics.totalVertices));
  const totalPhysics = Math.max(...data.animations.map(a => a.constraintMetrics.activePhysicsCount));
  const totalIK = Math.max(...data.animations.map(a => a.constraintMetrics.activeIkCount));
  const peakDeformed = Math.max(...data.animations.map(a => a.meshMetrics.deformedMeshCount));
  const peakWeighted = Math.max(...data.animations.map(a => a.meshMetrics.weightedMeshCount));

  return (
    <div className="benchmark-summary">
      <h2>{t('analysis.summary.title')}</h2>
      <p>{t('analysis.summary.skeletonLabel', { name: data.skeletonName })}</p>

      <div className="impact-summary-grid">
        <div className="impact-summary-card">
          <div className="impact-summary-header">
            <span className="impact-summary-title">{t('analysis.impact.rendering')}</span>
            <span className={`performance-impact ${getImpactBadgeClass(worstRendering.level)}`}>
              {t(getImpactLabelKey(worstRendering.level))}
            </span>
          </div>
          <div className="impact-summary-details">
            {totalBlendBreaks > 0 && <span>{t('analysis.impact.blendBreaks', { count: totalBlendBreaks })}</span>}
            {totalClipMasks > 0 && <span>{t('analysis.impact.clipMasks', { count: totalClipMasks })}</span>}
            <span>{t('analysis.impact.peakVertices', { count: peakVertices })}</span>
          </div>
        </div>
        <div className="impact-summary-card">
          <div className="impact-summary-header">
            <span className="impact-summary-title">{t('analysis.impact.computational')}</span>
            <span className={`performance-impact ${getImpactBadgeClass(worstCompute.level)}`}>
              {t(getImpactLabelKey(worstCompute.level))}
            </span>
          </div>
          <div className="impact-summary-details">
            {totalPhysics > 0 && <span>{t('analysis.impact.physicsCount', { count: totalPhysics })}</span>}
            {totalIK > 0 && <span>{t('analysis.impact.ikCount', { count: totalIK })}</span>}
            {peakDeformed > 0 && <span>{t('analysis.impact.deformedCount', { count: peakDeformed })}</span>}
            {peakWeighted > 0 && <span>{t('analysis.impact.weightedCount', { count: peakWeighted })}</span>}
          </div>
        </div>
      </div>

      <AnimationOverview data={data} />
      <AnimationImpactTable animations={sortedAnimations} />
      <GlobalStatistics data={data} />
      <OptimizationRecommendations data={data} />
    </div>
  );
};

const AnimationOverview: React.FC<{ data: SpineAnalysisResult }> = ({ data }) => {
  const { t } = useTranslation();
  const { stats } = data;

  return (
    <div className="animation-overview">
      <h3>{t('analysis.summary.animationOverview.title')}</h3>
      <div className="overview-stats">
        <div className="stat-item">
          <span className="stat-label">{t('analysis.summary.animationOverview.totalAnimations')}</span>
          <span className="stat-value">{data.totalAnimations}</span>
        </div>
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

const AnimationImpactTable: React.FC<{ animations: AnimationAnalysis[] }> = ({ animations }) => {
  const { t } = useTranslation();
  return (
    <>
      <h3>{t('analysis.summary.perAnimationScoresTitle')}</h3>
      <table className="benchmark-table">
        <thead>
          <tr>
            <th>{t('analysis.common.headers.animation')}</th>
            <th>{t('analysis.summary.tableHeaders.duration')}</th>
            <th>{t('analysis.impact.rendering')}</th>
            <th>{t('analysis.impact.computational')}</th>
            <th>{t('analysis.summary.tableHeaders.activeFeatures')}</th>
          </tr>
        </thead>
        <tbody>
          {animations.map((animation) => {
            const features: string[] = [];
            if (animation.activeComponents.hasPhysics) features.push(t('analysis.summary.features.physics'));
            if (animation.activeComponents.hasIK) features.push(t('analysis.summary.features.ik'));
            if (animation.activeComponents.hasClipping) features.push(t('analysis.summary.features.clipping'));
            if (animation.activeComponents.hasBlendModes) features.push(t('analysis.summary.features.blend'));

            const render = renderingImpact(animation);
            const compute = computationalImpact(animation);
            const totalCost = render.cost + compute.cost;
            const rowClass = totalCost >= 25 ? 'row-danger' : totalCost >= 15 ? 'row-warning' : '';

            return (
              <tr key={animation.name} className={rowClass}>
                <td>{animation.name}</td>
                <td>{animation.duration.toFixed(2)}s</td>
                <td>
                  <span className={`performance-impact ${getImpactBadgeClass(render.level)}`}>
                    {t(getImpactLabelKey(render.level))}
                  </span>
                </td>
                <td>
                  <span className={`performance-impact ${getImpactBadgeClass(compute.level)}`}>
                    {t(getImpactLabelKey(compute.level))}
                  </span>
                </td>
                <td>{features.length > 0 ? features.join(', ') : t('analysis.summary.features.none')}</td>
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

  if (skeleton.metrics.maxDepth > 5) {
    recommendations.push(t('analysis.summary.recommendations.reduceBoneDepth'));
  }
  if (skeleton.metrics.totalBones > 50) {
    recommendations.push(t('analysis.summary.recommendations.reduceTotalBones'));
  }

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

  // Find animations with high combined impact
  const highImpactAnimations = animations.filter(a => {
    const r = renderingImpact(a);
    const c = computationalImpact(a);
    return (r.cost + c.cost) >= 25;
  });

  if (highImpactAnimations.length > 0) {
    recommendations.push(
      t('analysis.summary.recommendations.multiIssueAnimations', {
        count: highImpactAnimations.length,
        names: highImpactAnimations.slice(0, 2).map(a => a.name).join(', ')
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
