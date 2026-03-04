import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  buildImpactDeltaModel,
  buildImpactReportModel,
  type ImpactDeltaMetric,
  type ImpactLevel,
  type ImpactReportModel,
  type ImpactSupplementalMetrics,
  type SpineAnalysisResult,
} from '../../core/SpineAnalyzer';
import { getImpactBadgeClass } from '../../core/utils/scoreCalculator';

interface SummaryProps {
  data: SpineAnalysisResult;
  supplemental?: ImpactSupplementalMetrics;
}

const IMPACT_LABEL_KEYS: Record<ImpactLevel, string> = {
  minimal: 'analysis.summary.impact.minimal',
  low: 'analysis.summary.impact.low',
  moderate: 'analysis.summary.impact.moderate',
  high: 'analysis.summary.impact.high',
  veryHigh: 'analysis.summary.impact.veryHigh',
};

function metricLabel(t: TFunction, key: ImpactDeltaMetric['key']): string {
  switch (key) {
    case 'rendering':
      return t('analysis.impact.rendering');
    case 'computational':
      return t('analysis.impact.computational');
    case 'total':
      return t('analysis.summary.delta.totalImpact');
    case 'pageBreaks':
      return t('analysis.summary.delta.pageBreaks');
    case 'blendSwitches':
      return t('analysis.summary.delta.blendSwitches');
    case 'meshDensity':
      return t('analysis.summary.delta.meshDensity');
    case 'constraints':
      return t('analysis.summary.delta.constraints');
    default:
      return key;
  }
}

function summaryMetricLabel(
  t: TFunction,
  metric: ImpactReportModel['summary']['rendering']['metrics'][number],
): string {
  switch (metric.key) {
    case 'peakBlendSwitches':
      return t('analysis.impact.blendBreaks', { count: metric.value });
    case 'peakClipMasks':
      return t('analysis.impact.clipMasks', { count: metric.value });
    case 'peakVertices':
      return t('analysis.impact.peakVertices', { count: metric.value });
    case 'peakPageBreaks':
      return t('analysis.impact.pageBreaks', { count: metric.value });
    case 'peakPhysics':
      return t('analysis.impact.physicsCount', { count: metric.value });
    case 'peakIk':
      return t('analysis.impact.ikCount', { count: metric.value });
    case 'peakDeformedMeshes':
      return t('analysis.impact.deformedCount', { count: metric.value });
    case 'peakWeightedMeshes':
      return t('analysis.impact.weightedCount', { count: metric.value });
    case 'peakConstraints':
      return t('analysis.impact.constraintsCount', { count: metric.value });
    default:
      return `${metric.value}`;
  }
}

function shouldRenderSummaryMetric(metric: ImpactReportModel['summary']['rendering']['metrics'][number]): boolean {
  if (metric.key === 'peakVertices') return true;
  return metric.value > 0;
}

function deltaClass(direction: ImpactDeltaMetric['direction']): string {
  switch (direction) {
    case 'better':
      return 'impact-delta-better';
    case 'worse':
      return 'impact-delta-worse';
    default:
      return 'impact-delta-neutral';
  }
}

function formatDelta(delta: number): string {
  if (Math.abs(delta) < 0.05) return '0.0';
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`;
}

function featureLabel(t: TFunction, key: 'physics' | 'ik' | 'clipping' | 'blend'): string {
  switch (key) {
    case 'physics':
      return t('analysis.summary.features.physics');
    case 'ik':
      return t('analysis.summary.features.ik');
    case 'clipping':
      return t('analysis.summary.features.clipping');
    case 'blend':
      return t('analysis.summary.features.blend');
    default:
      return key;
  }
}

export const Summary: React.FC<SummaryProps> = ({ data, supplemental }) => {
  const { t } = useTranslation();
  const [baseline, setBaseline] = useState<ImpactReportModel | null>(null);

  const report = useMemo(() => buildImpactReportModel(data, { supplemental }), [data, supplemental]);
  const delta = useMemo(() => (baseline ? buildImpactDeltaModel(report, baseline) : null), [report, baseline]);

  const primaryDeltaMetrics = useMemo(
    () =>
      delta?.metrics.filter(
        (metric) =>
          metric.key === 'rendering' || metric.key === 'computational' || metric.key === 'total',
      ) ?? [],
    [delta],
  );

  const topAnimationDeltas = useMemo(
    () =>
      delta?.animations
        .filter((entry) => entry.direction !== 'neutral')
        .slice(0, 6) ?? [],
    [delta],
  );

  return (
    <div className="benchmark-summary">
      <h2>{t('analysis.summary.title')}</h2>
      <p>{t('analysis.summary.skeletonLabel', { name: report.skeleton.name })}</p>

      <section className="impact-delta-toolbar">
        <div className="impact-delta-toolbar-actions">
          <button type="button" className="secondary-btn" onClick={() => setBaseline(report)}>
            {t('analysis.summary.delta.actions.captureBaseline')}
          </button>
          {baseline && (
            <button type="button" className="secondary-btn" onClick={() => setBaseline(null)}>
              {t('analysis.summary.delta.actions.clearBaseline')}
            </button>
          )}
        </div>
        {baseline ? (
          <p className="subtle-text">
            {t('analysis.summary.delta.activeBaseline', {
              baseline: baseline.skeleton.name,
              current: report.skeleton.name,
            })}
          </p>
        ) : (
          <p className="subtle-text">{t('analysis.summary.delta.hint')}</p>
        )}
      </section>

      <div className="impact-summary-grid">
        <div className="impact-summary-card">
          <div className="impact-summary-header">
            <span className="impact-summary-title">{t('analysis.impact.rendering')}</span>
            <span className={`performance-impact ${getImpactBadgeClass(report.summary.rendering.worst.level)}`}>
              {t(IMPACT_LABEL_KEYS[report.summary.rendering.worst.level])}
            </span>
          </div>
          <div className="impact-summary-details">
            {report.summary.rendering.metrics.filter(shouldRenderSummaryMetric).map((metric) => (
              <span key={metric.key}>{summaryMetricLabel(t, metric)}</span>
            ))}
          </div>
        </div>

        <div className="impact-summary-card">
          <div className="impact-summary-header">
            <span className="impact-summary-title">{t('analysis.impact.computational')}</span>
            <span className={`performance-impact ${getImpactBadgeClass(report.summary.computational.worst.level)}`}>
              {t(IMPACT_LABEL_KEYS[report.summary.computational.worst.level])}
            </span>
          </div>
          <div className="impact-summary-details">
            {report.summary.computational.metrics.filter(shouldRenderSummaryMetric).map((metric) => (
              <span key={metric.key}>{summaryMetricLabel(t, metric)}</span>
            ))}
          </div>
        </div>
      </div>

      {delta && (
        <section className="impact-delta-panel">
          <h3>{t('analysis.summary.delta.title')}</h3>
          <div className="impact-delta-grid">
            {primaryDeltaMetrics.map((metric) => (
              <div key={metric.key} className={`impact-delta-card ${deltaClass(metric.direction)}`}>
                <div className="impact-delta-card-top">
                  <strong>{metricLabel(t, metric.key)}</strong>
                  <span className={`impact-delta-direction ${deltaClass(metric.direction)}`}>
                    {t(`analysis.summary.delta.direction.${metric.direction}`)}
                  </span>
                </div>
                <div className="impact-delta-values">
                  <span>{t('analysis.summary.delta.baselineValue', { value: metric.baseline.cost.toFixed(1) })}</span>
                  <span>{t('analysis.summary.delta.currentValue', { value: metric.current.cost.toFixed(1) })}</span>
                  <span>{t('analysis.summary.delta.deltaValue', { value: formatDelta(metric.delta) })}</span>
                </div>
              </div>
            ))}
          </div>

          {topAnimationDeltas.length > 0 && (
            <div className="impact-delta-animation-list">
              <h4>{t('analysis.summary.delta.perAnimationTitle')}</h4>
              {topAnimationDeltas.map((entry) => (
                <div key={entry.name} className={`impact-delta-animation-row impact-delta-${entry.direction}`}>
                  <span>{entry.name}</span>
                  {entry.direction === 'new' && <span>{t('analysis.summary.delta.animation.new')}</span>}
                  {entry.direction === 'removed' && <span>{t('analysis.summary.delta.animation.removed')}</span>}
                  {entry.delta !== null && (
                    <span>
                      {t('analysis.summary.delta.animation.delta', {
                        baseline: entry.baselineTotalCost?.toFixed(1) ?? '-',
                        current: entry.currentTotalCost?.toFixed(1) ?? '-',
                        delta: formatDelta(entry.delta),
                      })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="animation-overview">
        <h3>{t('analysis.summary.animationOverview.title')}</h3>
        <div className="overview-stats">
          <div className="stat-item">
            <span className="stat-label">{t('analysis.summary.animationOverview.totalAnimations')}</span>
            <span className="stat-value">{report.overview.totalAnimations}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{t('analysis.summary.animationOverview.withPhysics')}</span>
            <span className="stat-value">
              {t('analysis.summary.animationOverview.animationsCount', {
                count: report.overview.animationsWithPhysics,
              })}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{t('analysis.summary.animationOverview.withClipping')}</span>
            <span className="stat-value">
              {t('analysis.summary.animationOverview.animationsCount', {
                count: report.overview.animationsWithClipping,
              })}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{t('analysis.summary.animationOverview.withSpecialBlendModes')}</span>
            <span className="stat-value">
              {t('analysis.summary.animationOverview.animationsCount', {
                count: report.overview.animationsWithBlendModes,
              })}
            </span>
          </div>
        </div>
      </section>

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
          {report.animations.map((animation) => (
            <tr
              key={animation.name}
              className={
                animation.rowTone === 'danger'
                  ? 'row-danger'
                  : animation.rowTone === 'warning'
                    ? 'row-warning'
                    : ''
              }
            >
              <td>{animation.name}</td>
              <td>{t('analysis.summary.durationSeconds', { value: animation.durationSec.toFixed(2) })}</td>
              <td>
                <span className={`performance-impact ${getImpactBadgeClass(animation.rendering.level)}`}>
                  {t(IMPACT_LABEL_KEYS[animation.rendering.level])}
                </span>
              </td>
              <td>
                <span className={`performance-impact ${getImpactBadgeClass(animation.computational.level)}`}>
                  {t(IMPACT_LABEL_KEYS[animation.computational.level])}
                </span>
              </td>
              <td>
                {animation.activeFeatures.length > 0
                  ? animation.activeFeatures.map((feature) => featureLabel(t, feature)).join(', ')
                  : t('analysis.summary.features.none')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>{t('analysis.summary.globalSkeletonStatisticsTitle')}</h3>
      <div className="stats-container">
        <table className="stats-table">
          <tbody>
            <tr>
              <td>{t('analysis.summary.statistics.totalBones')}</td>
              <td>{report.skeleton.totalBones}</td>
            </tr>
            <tr>
              <td>{t('analysis.summary.statistics.maxBoneDepth')}</td>
              <td>{report.skeleton.maxDepth}</td>
            </tr>
            <tr>
              <td>{t('analysis.summary.statistics.totalAnimations')}</td>
              <td>{report.skeleton.totalAnimations}</td>
            </tr>
            <tr>
              <td>{t('analysis.summary.statistics.skins')}</td>
              <td>{report.skeleton.totalSkins}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <section className="impact-advisor-panel">
        <h3>{t('analysis.summary.advisor.title')}</h3>
        <div className="impact-advisor-list">
          {report.advisor.map((item) => (
            <article
              key={item.id}
              className={`impact-advisor-card impact-advisor-${item.severity}`}
            >
              <div className="impact-advisor-header">
                <strong>{t(item.titleKey, item.params)}</strong>
                <span className="impact-advisor-severity">
                  {t(`analysis.summary.advisor.severity.${item.severity}`)}
                </span>
              </div>
              <p>{t(item.bodyKey, item.params)}</p>
              {item.affectedAnimations.length > 0 && (
                <small>
                  {t('analysis.summary.advisor.affectedAnimations', {
                    names: item.affectedAnimations.join(', '),
                  })}
                </small>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
