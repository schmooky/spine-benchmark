import React from 'react';
import { useTranslation } from 'react-i18next';
import { SpineAnalysisResult } from '../../core/SpineAnalyzer';
import { getImpactFromCost, getImpactBadgeClass } from '../../core/utils/scoreCalculator';

interface ClippingAnalysisProps {
  data: SpineAnalysisResult;
}

function clippingImpactCost(c: any): number {
  return (c.activeMaskCount * 5);
}

export const ClippingAnalysis: React.FC<ClippingAnalysisProps> = ({ data }) => {
  const { t } = useTranslation();

  const worstImpact = data.animations.reduce((worst, a) => {
    const cost = clippingImpactCost(a.clippingMetrics);
    return cost > worst.cost ? getImpactFromCost(cost) : worst;
  }, getImpactFromCost(0));

  return (
    <div className="clipping-analysis">
      <h3>{t('analysis.clipping.title')}</h3>

      <div className="median-score">
        <h4>{t('analysis.common.worstImpact')}</h4>
        <span className={`performance-impact ${getImpactBadgeClass(worstImpact.level)}`}>
          {t('analysis.summary.impact.' + worstImpact.level)}
        </span>
      </div>

      <h4>{t('analysis.common.perAnimationBreakdown')}</h4>
      <table className="benchmark-table">
        <thead>
          <tr>
            <th>{t('analysis.common.headers.animation')}</th>
            <th>{t('analysis.clipping.headers.hasClipping')}</th>
            <th>{t('analysis.clipping.headers.activeMasks')}</th>
            <th>{t('analysis.clipping.headers.totalVertices')}</th>
            <th>{t('analysis.common.headers.impact')}</th>
          </tr>
        </thead>
        <tbody>
          {data.animations.map((animation) => {
            const c = animation.clippingMetrics;
            const impact = getImpactFromCost(clippingImpactCost(c));
            const rowClass = impact.cost >= 25 ? 'row-danger' : impact.cost >= 15 ? 'row-warning' : '';

            return (
              <tr key={animation.name} className={rowClass}>
                <td>{animation.name}</td>
                <td>{animation.activeComponents.hasClipping ? t('analysis.common.yes') : t('analysis.common.no')}</td>
                <td>{c.activeMaskCount}</td>
                <td>{c.totalVertices}</td>
                <td>
                  <span className={`performance-impact ${getImpactBadgeClass(impact.level)}`}>
                    {t('analysis.summary.impact.' + impact.level)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <GlobalClippingDetails data={data} />

      <div className="analysis-notes">
        <h4>{t('analysis.clipping.notes.title')}</h4>
        <ul>
          <li><strong>{t('analysis.clipping.notes.highImpact')}</strong></li>
          <li><strong>{t('analysis.clipping.notes.vertexCount')}</strong></li>
          <li><strong>{t('analysis.clipping.notes.optimalConfiguration')}</strong></li>
          <li><strong>{t('analysis.clipping.notes.gpuCost')}</strong></li>
          <li><strong>{t('analysis.clipping.notes.recommendation')}</strong></li>
        </ul>
      </div>
    </div>
  );
};

const GlobalClippingDetails: React.FC<{ data: SpineAnalysisResult }> = ({ data }) => {
  const { t } = useTranslation();
  const { masks } = data.globalClipping;

  if (masks.length === 0) {
    return <p>{t('analysis.clipping.noMasks')}</p>;
  }

  return (
    <>
      <h4>{t('analysis.clipping.globalMasksTitle')}</h4>
      <table className="benchmark-table">
        <thead>
          <tr>
            <th>{t('analysis.clipping.tableHeaders.slotName')}</th>
            <th>{t('analysis.clipping.tableHeaders.vertexCount')}</th>
            <th>{t('analysis.clipping.tableHeaders.status')}</th>
          </tr>
        </thead>
        <tbody>
          {masks.map((mask) => {
            const status = mask.vertexCount <= 4
              ? t('analysis.clipping.status.optimal')
              : mask.vertexCount <= 8
                ? t('analysis.clipping.status.acceptable')
                : t('analysis.clipping.status.highVertexCount');

            const rowClass = mask.vertexCount <= 4
              ? ''
              : mask.vertexCount <= 8
                ? 'row-warning'
                : 'row-danger';

            return (
              <tr key={mask.slotName} className={rowClass}>
                <td>{mask.slotName}</td>
                <td>{mask.vertexCount}</td>
                <td>{status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
};
