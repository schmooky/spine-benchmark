import React from 'react';
import { useTranslation } from 'react-i18next';
import { SpineAnalysisResult } from '../../core/SpineAnalyzer';
import { getScoreColor } from '../../core/utils/scoreCalculator';
import { PERFORMANCE_FACTORS } from '../../core/constants/performanceFactors';

interface MeshAnalysisProps {
  data: SpineAnalysisResult;
}

export const MeshAnalysis: React.FC<MeshAnalysisProps> = ({ data }) => {
  const { t } = useTranslation();
  
  // Calculate median score for meshes
  const scores = data.animations.map(a => a.meshMetrics.score);
  const medianScore = scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)] || 100;

  return (
    <div className="mesh-analysis">
      <h3>{t('analysis.mesh.title')}</h3>
      
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
            <th>{t('analysis.mesh.headers.activeMeshes')}</th>
            <th>{t('analysis.mesh.headers.totalVertices')}</th>
            <th>{t('analysis.mesh.headers.deformed')}</th>
            <th>{t('analysis.mesh.headers.weighted')}</th>
            <th>{t('analysis.common.headers.score')}</th>
          </tr>
        </thead>
        <tbody>
          {data.animations.map((animation) => {
            const m = animation.meshMetrics;
            const rowClass = m.score < 70 ? 'row-warning' : m.score < 50 ? 'row-danger' : '';
            
            return (
              <tr key={animation.name} className={rowClass}>
                <td>{animation.name}</td>
                <td>{m.activeMeshCount}</td>
                <td>{m.totalVertices}</td>
                <td>{m.deformedMeshCount}</td>
                <td>{m.weightedMeshCount}</td>
                <td>
                  <div className="inline-score">
                    <span>{m.score.toFixed(1)}%</span>
                    <div className="mini-progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ 
                          width: `${m.score}%`, 
                          backgroundColor: getScoreColor(m.score) 
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
      
      <GlobalMeshDetails data={data} />
      
      <div className="analysis-notes">
        <h4>{t('analysis.mesh.notes.title')}</h4>
        <ul>
          <li><strong>{t('analysis.mesh.notes.vertexCount')}</strong></li>
          <li><strong>{t('analysis.mesh.notes.deformation', { factor: PERFORMANCE_FACTORS.MESH_DEFORMED_FACTOR })}</strong></li>
          <li><strong>{t('analysis.mesh.notes.boneWeights', { factor: PERFORMANCE_FACTORS.MESH_WEIGHTED_FACTOR })}</strong></li>
          <li><strong>{t('analysis.mesh.notes.optimizationTip')}</strong></li>
        </ul>
      </div>
    </div>
  );
};

const GlobalMeshDetails: React.FC<{ data: SpineAnalysisResult }> = ({ data }) => {
  const { t } = useTranslation();
  const { meshes } = data.globalMesh;
  
  // Sort by vertex count descending
  const sortedMeshes = [...meshes].sort((a, b) => b.vertices - a.vertices);
  
  return (
    <>
      <h4>{t('analysis.mesh.globalDetails')}</h4>
      <table className="benchmark-table">
        <thead>
          <tr>
            <th>{t('analysis.mesh.tableHeaders.slot')}</th>
            <th>{t('analysis.mesh.tableHeaders.vertices')}</th>
            <th>{t('analysis.mesh.tableHeaders.deformed')}</th>
            <th>{t('analysis.mesh.tableHeaders.boneWeights')}</th>
            <th>{t('analysis.mesh.tableHeaders.hasParentMesh')}</th>
          </tr>
        </thead>
        <tbody>
          {sortedMeshes.slice(0, 10).map((mesh) => {
            // Determine row color based on vertex count and deformation
            let rowClass = '';
            if (mesh.vertices > 100 || (mesh.vertices > 50 && mesh.isDeformed)) {
              rowClass = 'row-danger';
            } else if (mesh.vertices > 50 || (mesh.vertices > 20 && mesh.isDeformed)) {
              rowClass = 'row-warning';
            }
            
            return (
              <tr key={mesh.slotName} className={rowClass}>
                <td>{mesh.slotName}</td>
                <td>{mesh.vertices}</td>
                <td>{mesh.isDeformed ? t('analysis.mesh.values.yes') : t('analysis.mesh.values.no')}</td>
                <td>{mesh.boneWeights}</td>
                <td>{mesh.hasParentMesh ? t('analysis.mesh.values.yes') : t('analysis.mesh.values.no')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sortedMeshes.length > 10 && (
        <p className="table-note">{t('analysis.mesh.topMeshesNote', { count: sortedMeshes.length })}</p>
      )}
    </>
  );
};
