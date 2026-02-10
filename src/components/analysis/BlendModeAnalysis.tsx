import React from 'react';
import { useTranslation } from 'react-i18next';
import { BlendMode } from "@esotericsoftware/spine-pixi-v8";
import { SpineAnalysisResult } from '../../core/SpineAnalyzer';
import { getScoreColor } from '../../core/utils/scoreCalculator';
import { PERFORMANCE_FACTORS } from '../../core/constants/performanceFactors';

interface BlendModeAnalysisProps {
  data: SpineAnalysisResult;
}

export const BlendModeAnalysis: React.FC<BlendModeAnalysisProps> = ({ data }) => {
  const { t } = useTranslation();
  
  // Calculate median score for blend modes
  const scores = data.animations.map(a => a.blendModeMetrics.score);
  const medianScore = scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)] || 100;

  return (
    <div className="blend-mode-analysis">
      <h3>{t('analysis.blendMode.title')}</h3>
      
      <div className="median-score">
        <h4>{t('analysis.common.medianScore', { score: medianScore.toFixed(1) })}</h4>
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ 
              width: `${medianScore}%`, 
              backgroundColor: getScoreColor(medianScore) 
            }}
          />
        </div>
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
            <th>{t('analysis.common.headers.score')}</th>
          </tr>
        </thead>
        <tbody>
          {data.animations.map((animation) => {
            const b = animation.blendModeMetrics;
            const rowClass = b.score < 70 ? 'row-warning' : b.score < 50 ? 'row-danger' : '';
            
            return (
              <tr key={animation.name} className={rowClass}>
                <td>{animation.name}</td>
                <td>{animation.activeComponents.hasBlendModes ? t('analysis.common.yes') : t('analysis.common.no')}</td>
                <td>{b.activeNonNormalCount}</td>
                <td>{b.activeAdditiveCount}</td>
                <td>{b.activeMultiplyCount}</td>
                <td>
                  <div className="inline-score">
                    <span>{b.score.toFixed(1)}%</span>
                    <div className="mini-progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ 
                          width: `${b.score}%`, 
                          backgroundColor: getScoreColor(b.score) 
                        }}
                      />
                    </div>
                  </div>
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
