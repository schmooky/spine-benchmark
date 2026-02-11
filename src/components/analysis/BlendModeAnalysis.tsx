import React from 'react';
import { useTranslation } from 'react-i18next';
import { BlendMode } from "@esotericsoftware/spine-pixi-v8";
import { SpineAnalysisResult } from '../../core/SpineAnalyzer';
import { getImpactFromCost, getImpactBadgeClass } from '../../core/utils/scoreCalculator';

interface BlendModeAnalysisProps {
  data: SpineAnalysisResult;
}

function blendModeImpactCost(b: any): number {
  return (b.activeNonNormalCount * 3);
}

export const BlendModeAnalysis: React.FC<BlendModeAnalysisProps> = ({ data }) => {
  const { t } = useTranslation();

  const worstImpact = data.animations.reduce((worst, a) => {
    const cost = blendModeImpactCost(a.blendModeMetrics);
    return cost > worst.cost ? getImpactFromCost(cost) : worst;
  }, getImpactFromCost(0));

  return (
    <div className="blend-mode-analysis">
      <h3>{t('analysis.blendMode.title')}</h3>

      <div className="median-score">
        <h4>{t('analysis.common.worstImpact')}</h4>
        <span className={`performance-impact ${getImpactBadgeClass(worstImpact.level)}`}>
          {t('analysis.summary.impact.' + worstImpact.level)}
        </span>
      </div>

      <h4>{t('analysis.blendMode.perAnimationBreakdownTitle')}</h4>
      <table className="benchmark-table">
        <thead>
          <tr>
            <th>{t('analysis.common.headers.animation')}</th>
            <th>{t('analysis.blendMode.headers.hasBlendModes')}</th>
            <th>{t('analysis.blendMode.headers.maxNonNormal')}</th>
            <th>{t('analysis.blendMode.headers.maxAdditive')}</th>
            <th>{t('analysis.blendMode.headers.maxMultiply')}</th>
            <th>{t('analysis.common.headers.impact')}</th>
          </tr>
        </thead>
        <tbody>
          {data.animations.map((animation) => {
            const b = animation.blendModeMetrics;
            const impact = getImpactFromCost(blendModeImpactCost(b));
            const rowClass = impact.cost >= 25 ? 'row-danger' : impact.cost >= 15 ? 'row-warning' : '';

            return (
              <tr key={animation.name} className={rowClass}>
                <td>{animation.name}</td>
                <td>{animation.activeComponents.hasBlendModes ? t('analysis.common.yes') : t('analysis.common.no')}</td>
                <td>{b.activeNonNormalCount}</td>
                <td>{b.activeAdditiveCount}</td>
                <td>{b.activeMultiplyCount}</td>
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

      <GlobalBlendModeDetails data={data} />

      <div className="analysis-notes">
        <h4>{t('analysis.blendMode.notes.title')}</h4>
        <ul>
          <li><strong>{t('analysis.blendMode.notes.frameByFrameTitle')}:</strong> {t('analysis.blendMode.notes.frameByFrameDescription')}</li>
          <li><strong>{t('analysis.blendMode.notes.impactTitle')}:</strong> {t('analysis.blendMode.notes.impactDescription')}</li>
          <li><strong>{t('analysis.blendMode.notes.concurrentTitle')}:</strong> {t('analysis.blendMode.notes.concurrentDescription')}</li>
          <li><strong>{t('analysis.blendMode.notes.optimizationTitle')}:</strong> {t('analysis.blendMode.notes.optimizationDescription')}</li>
        </ul>
      </div>
    </div>
  );
};

const GlobalBlendModeDetails: React.FC<{ data: SpineAnalysisResult }> = ({ data }) => {
  const { t } = useTranslation();
  const { globalBlendMode } = data;
  const { blendModeCounts, slotsWithNonNormalBlendMode, metrics } = globalBlendMode;

  if (slotsWithNonNormalBlendMode.size === 0) {
    return null;
  }

  return (
    <>
      <h4>{t('analysis.blendMode.slotsWithNonNormalTitle')}</h4>
      <table className="benchmark-table">
        <thead>
          <tr>
            <th>{t('analysis.blendMode.tableHeaders.slotName')}</th>
            <th>{t('analysis.blendMode.tableHeaders.blendMode')}</th>
          </tr>
        </thead>
        <tbody>
          {Array.from(slotsWithNonNormalBlendMode.entries()).map(([slotName, mode]) => (
            <tr key={slotName}>
              <td>{slotName}</td>
              <td>{BlendMode[mode]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};
