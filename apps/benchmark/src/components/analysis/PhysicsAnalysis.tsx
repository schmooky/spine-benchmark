import React from 'react';
import { useTranslation } from 'react-i18next';
import { SpineAnalysisResult } from '../../core/SpineAnalyzer';
import { getImpactFromCost, getImpactBadgeClass } from '../../core/utils/scoreCalculator';

interface PhysicsAnalysisProps {
  data: SpineAnalysisResult;
}

function constraintImpactCost(c: any): number {
  return (
    (c.activePhysicsCount * 0.7) +
    (c.activePathCount * 0.55) +
    (c.activeIkCount * 0.35) +
    (c.activeTransformCount * 0.2)
  );
}

export const PhysicsAnalysis: React.FC<PhysicsAnalysisProps> = ({ data }) => {
  const { t } = useTranslation();

  const worstImpact = data.animations.reduce((worst, a) => {
    const cost = constraintImpactCost(a.constraintMetrics);
    return cost > worst.cost ? getImpactFromCost(cost) : worst;
  }, getImpactFromCost(0));

  return (
    <div className="physics-analysis">
      <h3>{t('analysis.physics.title')}</h3>

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
            <th>{t('analysis.physics.headers.physics')}</th>
            <th>{t('analysis.physics.headers.ik')}</th>
            <th>{t('analysis.physics.headers.transform')}</th>
            <th>{t('analysis.physics.headers.path')}</th>
            <th>{t('analysis.physics.headers.totalActive')}</th>
            <th>{t('analysis.common.headers.impact')}</th>
          </tr>
        </thead>
        <tbody>
          {data.animations.map((animation) => {
            const c = animation.constraintMetrics;
            const hasPhysics = animation.activeComponents.hasPhysics;
            const hasIK = animation.activeComponents.hasIK;
            const hasTransform = animation.activeComponents.hasTransform;
            const hasPath = animation.activeComponents.hasPath;

            const impact = getImpactFromCost(constraintImpactCost(c));
            const rowClass = impact.cost >= 25 ? 'row-danger' : impact.cost >= 15 ? 'row-warning' : '';

            return (
              <tr key={animation.name} className={rowClass}>
                <td>{animation.name}</td>
                <td>{hasPhysics ? t('analysis.physics.values.activeCount', { count: c.activePhysicsCount }) : t('analysis.physics.values.none')}</td>
                <td>{hasIK ? t('analysis.physics.values.activeCount', { count: c.activeIkCount }) : t('analysis.physics.values.none')}</td>
                <td>{hasTransform ? t('analysis.physics.values.activeCount', { count: c.activeTransformCount }) : t('analysis.physics.values.none')}</td>
                <td>{hasPath ? t('analysis.physics.values.activeCount', { count: c.activePathCount }) : t('analysis.physics.values.none')}</td>
                <td>{c.totalActiveConstraints}</td>
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
      
      <ConstraintImpactBreakdown data={data} />
      <ConstraintDetails data={data} />
      
      <div className="analysis-notes">
        <h4>{t('analysis.physics.notes.title')}</h4>
        <ul>
          <li><strong>{t('analysis.physics.constraintTypes.ik')}:</strong> {t('analysis.physics.notes.ikConstraints')}</li>
          <li><strong>{t('analysis.physics.constraintTypes.physics')}:</strong> {t('analysis.physics.notes.physicsConstraints')}</li>
          <li><strong>{t('analysis.physics.constraintTypes.path')}:</strong> {t('analysis.physics.notes.pathConstraints')}</li>
          <li><strong>{t('analysis.physics.constraintTypes.transform')}:</strong> {t('analysis.physics.notes.transformConstraints')}</li>
          <li><strong>{t('analysis.physics.notes.recommendation').split(':')[0]}:</strong> {t('analysis.physics.notes.recommendation').split(':')[1]}</li>
        </ul>
      </div>
    </div>
  );
};

const ConstraintImpactBreakdown: React.FC<{ data: SpineAnalysisResult }> = ({ data }) => {
  const { t } = useTranslation();
  const { metrics } = data.globalPhysics;
  
  return (
    <div className="constraint-summary">
      <h4>{t('analysis.physics.impactBreakdown.title')}</h4>
      <table className="benchmark-table">
        <thead>
          <tr>
            <th>{t('analysis.physics.impactBreakdown.tableHeaders.constraintType')}</th>
            <th>{t('analysis.physics.impactBreakdown.tableHeaders.count')}</th>
            <th>{t('analysis.physics.impactBreakdown.tableHeaders.impactLevel')}</th>
            <th>{t('analysis.physics.impactBreakdown.tableHeaders.weightedImpact')}</th>
          </tr>
        </thead>
        <tbody>
          <tr className={metrics.ikImpact > 50 ? 'row-warning' : ''}>
            <td>{t('analysis.physics.constraintTypes.ik')}</td>
            <td>{metrics.ikCount}</td>
            <td>{metrics.ikImpact.toFixed(1)}%</td>
            <td>{(metrics.ikImpact * 0.20).toFixed(1)}%</td>
          </tr>
          <tr className={metrics.transformImpact > 50 ? 'row-warning' : ''}>
            <td>{t('analysis.physics.constraintTypes.transform')}</td>
            <td>{metrics.transformCount}</td>
            <td>{metrics.transformImpact.toFixed(1)}%</td>
            <td>{(metrics.transformImpact * 0.15).toFixed(1)}%</td>
          </tr>
          <tr className={metrics.pathImpact > 50 ? 'row-warning' : ''}>
            <td>{t('analysis.physics.constraintTypes.path')}</td>
            <td>{metrics.pathCount}</td>
            <td>{metrics.pathImpact.toFixed(1)}%</td>
            <td>{(metrics.pathImpact * 0.25).toFixed(1)}%</td>
          </tr>
          <tr className={metrics.physicsImpact > 50 ? 'row-warning' : ''}>
            <td>{t('analysis.physics.constraintTypes.physics')}</td>
            <td>{metrics.physicsCount}</td>
            <td>{metrics.physicsImpact.toFixed(1)}%</td>
            <td>{(metrics.physicsImpact * 0.40).toFixed(1)}%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

const ConstraintDetails: React.FC<{ data: SpineAnalysisResult }> = ({ data }) => {
  const { t } = useTranslation();
  const { ikConstraints, transformConstraints, pathConstraints, physicsConstraints } = data.globalPhysics;
  
  if (data.globalPhysics.metrics.totalConstraints === 0) {
    return <p>{t('analysis.physics.noConstraints')}</p>;
  }
  
  return (
    <>
      {ikConstraints.length > 0 && <IkConstraintsTable constraints={ikConstraints} />}
      {transformConstraints.length > 0 && <TransformConstraintsTable constraints={transformConstraints} />}
      {pathConstraints.length > 0 && <PathConstraintsTable constraints={pathConstraints} />}
      {physicsConstraints.length > 0 && <PhysicsConstraintsTable constraints={physicsConstraints} />}
    </>
  );
};

const IkConstraintsTable: React.FC<{ constraints: any[] }> = ({ constraints }) => {
  const { t } = useTranslation();
  
  return (
    <div className="constraint-details">
      <h4>{t('analysis.physics.constraintDetails.ikConstraints.title')}</h4>
      <table className="benchmark-table">
        <thead>
          <tr>
            <th>{t('analysis.physics.constraintDetails.ikConstraints.tableHeaders.name')}</th>
            <th>{t('analysis.physics.constraintDetails.ikConstraints.tableHeaders.target')}</th>
            <th>{t('analysis.physics.constraintDetails.ikConstraints.tableHeaders.bones')}</th>
            <th>{t('analysis.physics.constraintDetails.ikConstraints.tableHeaders.mix')}</th>
            <th>{t('analysis.physics.constraintDetails.ikConstraints.tableHeaders.status')}</th>
          </tr>
        </thead>
        <tbody>
          {constraints.map((ik) => {
            const complexityClass = ik.bones.length > 2 ? 'row-warning' : '';
            
            return (
              <tr key={ik.name} className={complexityClass}>
                <td>{ik.name}</td>
                <td>{ik.target}</td>
                <td>{ik.bones.join(', ')}</td>
                <td>{ik.mix.toFixed(2)}</td>
                <td>{ik.isActive ? t('analysis.physics.status.active') : t('analysis.physics.status.inactive')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const TransformConstraintsTable: React.FC<{ constraints: any[] }> = ({ constraints }) => {
  const { t } = useTranslation();
  
  return (
    <div className="constraint-details">
      <h4>{t('analysis.physics.constraintDetails.transformConstraints.title')}</h4>
      <table className="benchmark-table">
        <thead>
          <tr>
            <th>{t('analysis.physics.constraintDetails.transformConstraints.tableHeaders.name')}</th>
            <th>{t('analysis.physics.constraintDetails.transformConstraints.tableHeaders.target')}</th>
            <th>{t('analysis.physics.constraintDetails.transformConstraints.tableHeaders.bones')}</th>
            <th>{t('analysis.physics.constraintDetails.transformConstraints.tableHeaders.properties')}</th>
            <th>{t('analysis.physics.constraintDetails.transformConstraints.tableHeaders.status')}</th>
          </tr>
        </thead>
        <tbody>
          {constraints.map((tc) => {
            const props = [];
            if (tc.mixRotate > 0) props.push(`${t('analysis.physics.properties.rotate')}: ${tc.mixRotate.toFixed(2)}`);
            if (tc.mixX > 0) props.push(`${t('analysis.physics.properties.x')}: ${tc.mixX.toFixed(2)}`);
            if (tc.mixY > 0) props.push(`${t('analysis.physics.properties.y')}: ${tc.mixY.toFixed(2)}`);
            if (tc.mixScaleX > 0) props.push(`${t('analysis.physics.properties.scaleX')}: ${tc.mixScaleX.toFixed(2)}`);
            if (tc.mixScaleY > 0) props.push(`${t('analysis.physics.properties.scaleY')}: ${tc.mixScaleY.toFixed(2)}`);
            if (tc.mixShearY > 0) props.push(`${t('analysis.physics.properties.shearY')}: ${tc.mixShearY.toFixed(2)}`);
            
            const complexityClass = props.length > 3 ? 'row-warning' : '';
            
            return (
              <tr key={tc.name} className={complexityClass}>
                <td>{tc.name}</td>
                <td>{tc.target}</td>
                <td>{tc.bones.join(', ')}</td>
                <td>{props.join(', ')}</td>
                <td>{tc.isActive ? t('analysis.physics.status.active') : t('analysis.physics.status.inactive')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const PathConstraintsTable: React.FC<{ constraints: any[] }> = ({ constraints }) => {
  const { t } = useTranslation();
  
  const getRotateModeName = (mode: number): string => {
    switch(mode) {
      case 0: return t('analysis.physics.modes.rotate.tangent');
      case 1: return t('analysis.physics.modes.rotate.chain');
      case 2: return t('analysis.physics.modes.rotate.chainScale');
      default: return `Unknown (${mode})`;
    }
  };
  
  const getSpacingModeName = (mode: number): string => {
    switch(mode) {
      case 0: return t('analysis.physics.modes.spacing.length');
      case 1: return t('analysis.physics.modes.spacing.fixed');
      case 2: return t('analysis.physics.modes.spacing.percent');
      case 3: return t('analysis.physics.modes.spacing.proportional');
      default: return `Unknown (${mode})`;
    }
  };
  
  return (
    <div className="constraint-details">
      <h4>{t('analysis.physics.constraintDetails.pathConstraints.title')}</h4>
      <table className="benchmark-table">
        <thead>
          <tr>
            <th>{t('analysis.physics.constraintDetails.pathConstraints.tableHeaders.name')}</th>
            <th>{t('analysis.physics.constraintDetails.pathConstraints.tableHeaders.target')}</th>
            <th>{t('analysis.physics.constraintDetails.pathConstraints.tableHeaders.bones')}</th>
            <th>{t('analysis.physics.constraintDetails.pathConstraints.tableHeaders.modes')}</th>
            <th>{t('analysis.physics.constraintDetails.pathConstraints.tableHeaders.status')}</th>
          </tr>
        </thead>
        <tbody>
          {constraints.map((p) => {
            const complexityClass = (p.rotateMode === 2 || p.bones.length > 3) ? 'row-warning' : '';
            
            return (
              <tr key={p.name} className={complexityClass}>
                <td>{p.name}</td>
                <td>{p.target}</td>
                <td>{p.bones.join(', ')}</td>
                <td>
                  {t('analysis.physics.properties.rotate')}: {getRotateModeName(p.rotateMode)},
                  {' '}
                  {t('analysis.physics.properties.spacing')}: {getSpacingModeName(p.spacingMode)}
                </td>
                <td>{p.isActive ? t('analysis.physics.status.active') : t('analysis.physics.status.inactive')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const PhysicsConstraintsTable: React.FC<{ constraints: any[] }> = ({ constraints }) => {
  const { t } = useTranslation();
  
  return (
    <div className="constraint-details">
      <h4>{t('analysis.physics.constraintDetails.physicsConstraints.title')}</h4>
      <table className="benchmark-table">
        <thead>
          <tr>
            <th>{t('analysis.physics.constraintDetails.physicsConstraints.tableHeaders.name')}</th>
            <th>{t('analysis.physics.constraintDetails.physicsConstraints.tableHeaders.bone')}</th>
            <th>{t('analysis.physics.constraintDetails.physicsConstraints.tableHeaders.properties')}</th>
            <th>{t('analysis.physics.constraintDetails.physicsConstraints.tableHeaders.parameters')}</th>
            <th>{t('analysis.physics.constraintDetails.physicsConstraints.tableHeaders.status')}</th>
          </tr>
        </thead>
        <tbody>
          {constraints.map((p) => {
            const props = [];
            if (p.affectsX) props.push(t('analysis.physics.properties.x'));
            if (p.affectsY) props.push(t('analysis.physics.properties.y'));
            if (p.affectsRotation) props.push(t('analysis.physics.properties.rotation'));
            if (p.affectsScale) props.push(t('analysis.physics.properties.scale'));
            if (p.affectsShear) props.push(t('analysis.physics.properties.shear'));
            
            const params = [
              `${t('analysis.physics.parameters.inertia')}: ${p.inertia.toFixed(2)}`,
              `${t('analysis.physics.parameters.strength')}: ${p.strength.toFixed(2)}`,
              `${t('analysis.physics.parameters.damping')}: ${p.damping.toFixed(2)}`
            ];
            
            if (p.wind !== 0) params.push(`${t('analysis.physics.parameters.wind')}: ${p.wind.toFixed(2)}`);
            if (p.gravity !== 0) params.push(`${t('analysis.physics.parameters.gravity')}: ${p.gravity.toFixed(2)}`);
            
            const complexityClass = props.length > 2 ? 'row-warning' : '';
            
            return (
              <tr key={p.name} className={complexityClass}>
                <td>{p.name}</td>
                <td>{p.bone}</td>
                <td>{props.join(', ')}</td>
                <td>{params.join(', ')}</td>
                <td>{p.isActive ? t('analysis.physics.status.active') : t('analysis.physics.status.inactive')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
