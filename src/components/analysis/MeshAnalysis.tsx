import React from 'react';
import { useTranslation } from 'react-i18next';
import { SpineAnalysisResult } from '../../core/SpineAnalyzer';
import { getImpactFromCost, getImpactBadgeClass } from '../../core/utils/scoreCalculator';
import { PERFORMANCE_FACTORS } from '../../core/constants/performanceFactors';

interface MeshAnalysisProps {
  data: SpineAnalysisResult;
}

function meshImpactCost(m: any): number {
  return (m.totalVertices / 200) + (m.deformedMeshCount * 1.5) + (m.weightedMeshCount * 2);
}

export const MeshAnalysis: React.FC<MeshAnalysisProps> = ({ data }) => {
  const { t } = useTranslation();

  const worstImpact = data.animations.reduce((worst, a) => {
    const cost = meshImpactCost(a.meshMetrics);
    return cost > worst.cost ? getImpactFromCost(cost) : worst;
  }, getImpactFromCost(0));

  return (
    <div className="mesh-analysis">
      <h3>{t('analysis.mesh.title')}</h3>

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
            <th>{t('analysis.mesh.headers.activeMeshes')}</th>
            <th>{t('analysis.mesh.headers.totalVertices')}</th>
            <th>{t('analysis.mesh.headers.deformed')}</th>
            <th>{t('analysis.mesh.headers.weighted')}</th>
            <th>{t('analysis.common.headers.impact')}</th>
          </tr>
        </thead>
        <tbody>
          {data.animations.map((animation) => {
            const m = animation.meshMetrics;
            const impact = getImpactFromCost(meshImpactCost(m));
            const rowClass = impact.cost >= 25 ? 'row-danger' : impact.cost >= 15 ? 'row-warning' : '';

            return (
              <tr key={animation.name} className={rowClass}>
                <td>{animation.name}</td>
                <td>{m.activeMeshCount}</td>
                <td>{m.totalVertices}</td>
                <td>{m.deformedMeshCount}</td>
                <td>{m.weightedMeshCount}</td>
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
