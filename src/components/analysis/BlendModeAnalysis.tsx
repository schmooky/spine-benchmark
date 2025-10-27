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
  
  const scores = data.animations.map(a => a.blendModeMetrics.score);
  const medianScore = scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)] || 100;

  return (
    <div className="blend-mode-analysis">
      <h3>{t('analysis.blendMode.title')}</h3>
      
      <div className="median-score">
        <h4>Median Performance Score: {medianScore.toFixed(1)}%</h4>
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

      <h4>Per-Animation Breakdown (Maximum Concurrent)</h4>
      <table className="benchmark-table">
        <thead>
          <tr>
            <th>Animation</th>
            <th>Has Blend Modes</th>
            <th>Max Non-Normal</th>
            <th>Max Additive</th>
            <th>Max Multiply</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {data.animations.map((animation) => {
            const b = animation.blendModeMetrics;
            const rowClass = b.score < 70 ? 'row-warning' : b.score < 50 ? 'row-danger' : '';
            
            return (
              <tr key={animation.name} className={rowClass}>
                <td>{animation.name}</td>
                <td>{animation.activeComponents.hasBlendModes ? 'Yes' : 'No'}</td>
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
          <li><strong>Frame-by-Frame Analysis:</strong> Values shown are the maximum number of blend modes visible at any single frame.</li>
          <li><strong>Blend Mode Impact:</strong> Non-normal blend modes require additional GPU render passes.</li>
          <li><strong>Concurrent vs Total:</strong> Having 10 blend modes where only 2 are visible at once is much better than having 10 visible simultaneously.</li>
          <li><strong>Optimization:</strong> Use normal blend mode when possible, pre-composite effects for static elements.</li>
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