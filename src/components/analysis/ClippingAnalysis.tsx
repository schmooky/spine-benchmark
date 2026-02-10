import React from 'react';
import { useTranslation } from 'react-i18next';
import { SpineAnalysisResult } from '../../core/SpineAnalyzer';
import { getScoreColor } from '../../core/utils/scoreCalculator';
import { PERFORMANCE_FACTORS } from '../../core/constants/performanceFactors';

interface ClippingAnalysisProps {
  data: SpineAnalysisResult;
}

export const ClippingAnalysis: React.FC<ClippingAnalysisProps> = ({ data }) => {
  const { t } = useTranslation();
  
  // Calculate median score for clipping
  const scores = data.animations.map(a => a.clippingMetrics.score);
  const medianScore = scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)] || 100;

  return (
    <div className="clipping-analysis">
      <h3>{t('analysis.clipping.title')}</h3>
      
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

      <h4>{t('analysis.common.perAnimationBreakdown')}</h4>
      <table className="benchmark-table">
        <thead>
          <tr>
            <th>{t('analysis.common.headers.animation')}</th>
            <th>{t('analysis.clipping.headers.hasClipping')}</th>
            <th>{t('analysis.clipping.headers.activeMasks')}</th>
            <th>{t('analysis.clipping.headers.totalVertices')}</th>
            <th>{t('analysis.common.headers.score')}</th>
          </tr>
        </thead>
        <tbody>
          {data.animations.map((animation) => {
            const c = animation.clippingMetrics;
            const rowClass = c.score < 70 ? 'row-warning' : c.score < 50 ? 'row-danger' : '';
            
            return (
              <tr key={animation.name} className={rowClass}>
                <td>{animation.name}</td>
                <td>{animation.activeComponents.hasClipping ? t('analysis.common.yes') : t('analysis.common.no')}</td>
                <td>{c.activeMaskCount}</td>
                <td>{c.totalVertices}</td>
                <td>
                  <div className="inline-score">
                    <span>{c.score.toFixed(1)}%</span>
                    <div className="mini-progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ 
                          width: `${c.score}%`, 
                          backgroundColor: getScoreColor(c.score) 
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
