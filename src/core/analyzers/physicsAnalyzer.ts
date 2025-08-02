import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { PERFORMANCE_FACTORS } from "../constants/performanceFactors";
import { getScoreColor } from "../utils/scoreCalculator";
import i18n from "../../i18n";

/**
 * Analyzes physics and other constraints in a Spine instance
 * @param spineInstance The Spine instance to analyze
 * @returns HTML output and metrics for constraints analysis
 */
export function analyzePhysics(spineInstance: Spine): { html: string, metrics: any } {
  const skeleton = spineInstance.skeleton;
  
  // Get all constraints
  const ikConstraints = skeleton.ikConstraints;
  const transformConstraints = skeleton.transformConstraints;
  const pathConstraints = skeleton.pathConstraints;
  const physicsConstraints = skeleton.physicsConstraints || [];  // May be undefined in older versions
  
  // Analyze IK Constraints
  const ikData = ikConstraints.map(constraint => ({
    name: constraint.data.name,
    target: constraint.target.data.name,
    bones: constraint.bones.map(bone => bone.data.name),
    mix: constraint.mix,
    softness: constraint.softness,
    bendDirection: constraint.bendDirection,
    compress: constraint.compress,
    stretch: constraint.stretch,
    isActive: constraint.isActive()
  }));
  
  // Analyze Transform Constraints
  const transformData = transformConstraints.map(constraint => ({
    name: constraint.data.name,
    target: constraint.target.data.name,
    bones: constraint.bones.map(bone => bone.data.name),
    mixRotate: constraint.mixRotate,
    mixX: constraint.mixX,
    mixY: constraint.mixY,
    mixScaleX: constraint.mixScaleX,
    mixScaleY: constraint.mixScaleY,
    mixShearY: constraint.mixShearY,
    isActive: constraint.isActive(),
    isLocal: constraint.data.local,
    isRelative: constraint.data.relative
  }));
  
  // Analyze Path Constraints
  const pathData = pathConstraints.map(constraint => {
    const positionMode = constraint.data.positionMode; // Fixed or Percent
    const spacingMode = constraint.data.spacingMode; // Length, Fixed, Percent, or Proportional
    const rotateMode = constraint.data.rotateMode; // Tangent, Chain, or ChainScale
    
    return {
      name: constraint.data.name,
      target: constraint.target.data.name,
      bones: constraint.bones.map(bone => bone.data.name),
      mixRotate: constraint.mixRotate,
      mixX: constraint.mixX,
      mixY: constraint.mixY,
      position: constraint.position,
      spacing: constraint.spacing,
      positionMode: positionMode,
      spacingMode: spacingMode,
      rotateMode: rotateMode,
      offsetRotation: constraint.data.offsetRotation,
      isActive: constraint.isActive(),
      // Track complexity: world positions, curves, segments arrays
      worldPositionsCount: constraint.world ? constraint.world.length / 3 : 0,
      hasSegments: constraint.segments && constraint.segments.length > 0,
      hasLengths: constraint.lengths && constraint.lengths.length > 0
    };
  });
  
  // Analyze Physics Constraints
  const physicsData = physicsConstraints.map(constraint => ({
    name: constraint.data.name,
    bone: constraint.bone.data.name,
    inertia: constraint.inertia,
    strength: constraint.strength,
    damping: constraint.damping,
    massInverse: constraint.massInverse,
    wind: constraint.wind,
    gravity: constraint.gravity,
    mix: constraint.mix,
    affectsX: constraint.data.x > 0,
    affectsY: constraint.data.y > 0,
    affectsRotation: constraint.data.rotate > 0,
    affectsScale: constraint.data.scaleX > 0,
    affectsShear: constraint.data.shearX > 0,
    isActive: constraint.isActive()
  }));
  
  // Calculate constraint performance impact scores
  const ikImpact = calculateIkImpact(ikData);
  const transformImpact = calculateTransformImpact(transformData);
  const pathImpact = calculatePathImpact(pathData);
  const physicsImpact = calculatePhysicsImpact(physicsData);
  
  // Total constraints
  const totalConstraints = ikConstraints.length + transformConstraints.length + 
                           pathConstraints.length + physicsConstraints.length;
  
  // Calculate constraint score based on weighted impacts
  let constraintScore = 100;
  
  if (totalConstraints > 0) {
    const totalWeightedImpact = 
      (ikImpact * PERFORMANCE_FACTORS.IK_WEIGHT) +
      (transformImpact * PERFORMANCE_FACTORS.TRANSFORM_WEIGHT) +
      (pathImpact * PERFORMANCE_FACTORS.PATH_WEIGHT) +
      (physicsImpact * PERFORMANCE_FACTORS.PHYSICS_WEIGHT);
    
    constraintScore = Math.max(0, 100 - (totalWeightedImpact * 0.5));
  }
  
  // Generate HTML output
  let html = `
    <div class="physics-analysis">
      <h3>${i18n.t('analysis.physics.title')}</h3>
      <p>${i18n.t('analysis.physics.statistics.totalConstraints', { count: totalConstraints })}</p>
      
      <div class="performance-score">
        <h4>${i18n.t('analysis.physics.performanceScore.title', { score: constraintScore.toFixed(1) })}</h4>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${constraintScore}%; background-color: ${getScoreColor(constraintScore)};"></div>
        </div>
      </div>
      
      <div class="analysis-metrics">
        <p><strong>${i18n.t('analysis.physics.formula.title')}</strong></p>
        <code>${i18n.t('analysis.physics.formula.description')}</code>
        <p>${i18n.t('analysis.physics.formula.explanation')}</p>
      </div>
      
      <div class="constraint-summary">
        <h4>${i18n.t('analysis.physics.impactBreakdown.title')}</h4>
        <table class="benchmark-table">
          <thead>
            <tr>
              <th>${i18n.t('analysis.physics.impactBreakdown.tableHeaders.constraintType')}</th>
              <th>${i18n.t('analysis.physics.impactBreakdown.tableHeaders.count')}</th>
              <th>${i18n.t('analysis.physics.impactBreakdown.tableHeaders.impactLevel')}</th>
              <th>${i18n.t('analysis.physics.impactBreakdown.tableHeaders.weightedImpact')}</th>
            </tr>
          </thead>
          <tbody>
            <tr class="${ikImpact > 50 ? 'row-warning' : ''}">
              <td>${i18n.t('analysis.physics.constraintTypes.ik')}</td>
              <td>${ikConstraints.length}</td>
              <td>${ikImpact.toFixed(1)}%</td>
              <td>${(ikImpact * PERFORMANCE_FACTORS.IK_WEIGHT).toFixed(1)}%</td>
            </tr>
            <tr class="${transformImpact > 50 ? 'row-warning' : ''}">
              <td>${i18n.t('analysis.physics.constraintTypes.transform')}</td>
              <td>${transformConstraints.length}</td>
              <td>${transformImpact.toFixed(1)}%</td>
              <td>${(transformImpact * PERFORMANCE_FACTORS.TRANSFORM_WEIGHT).toFixed(1)}%</td>
            </tr>
            <tr class="${pathImpact > 50 ? 'row-warning' : ''}">
              <td>${i18n.t('analysis.physics.constraintTypes.path')}</td>
              <td>${pathConstraints.length}</td>
              <td>${pathImpact.toFixed(1)}%</td>
              <td>${(pathImpact * PERFORMANCE_FACTORS.PATH_WEIGHT).toFixed(1)}%</td>
            </tr>
            <tr class="${physicsImpact > 50 ? 'row-warning' : ''}">
              <td>${i18n.t('analysis.physics.constraintTypes.physics')}</td>
              <td>${physicsConstraints.length}</td>
              <td>${physicsImpact.toFixed(1)}%</td>
              <td>${(physicsImpact * PERFORMANCE_FACTORS.PHYSICS_WEIGHT).toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </div>
  `;
  
  // Add constraint details if any exist
  if (totalConstraints > 0) {
    // IK Constraints Table
    if (ikData.length > 0) {
      html += createIkTable(ikData);
    }
    
    // Transform Constraints Table
    if (transformData.length > 0) {
      html += createTransformTable(transformData);
    }
    
    // Path Constraints Table
    if (pathData.length > 0) {
      html += createPathTable(pathData);
    }
    
    // Physics Constraints Table
    if (physicsData.length > 0) {
      html += createPhysicsTable(physicsData);
    }
    
    // Add general notes about constraints
    html += `
      <div class="analysis-notes">
        <h4>${i18n.t('analysis.physics.notes.title')}</h4>
        <ul>
          <li><strong>${i18n.t('analysis.physics.constraintTypes.ik')}:</strong> ${i18n.t('analysis.physics.notes.ikConstraints')}</li>
          <li><strong>${i18n.t('analysis.physics.constraintTypes.physics')}:</strong> ${i18n.t('analysis.physics.notes.physicsConstraints')}</li>
          <li><strong>${i18n.t('analysis.physics.constraintTypes.path')}:</strong> ${i18n.t('analysis.physics.notes.pathConstraints')}</li>
          <li><strong>${i18n.t('analysis.physics.constraintTypes.transform')}:</strong> ${i18n.t('analysis.physics.notes.transformConstraints')}</li>
          <li><strong>${i18n.t('analysis.physics.notes.recommendation').split(':')[0]}:</strong> ${i18n.t('analysis.physics.notes.recommendation').split(':')[1]}</li>
        </ul>
      </div>
    `;
  } else {
    html += `<p>${i18n.t('analysis.physics.noConstraints')}</p>`;
  }
  
  html += `</div>`;
  
  return {
    html, 
    metrics: {
      ikCount: ikConstraints.length,
      transformCount: transformConstraints.length,
      pathCount: pathConstraints.length,
      physicsCount: physicsConstraints.length,
      totalConstraints,
      ikImpact,
      transformImpact,
      pathImpact,
      physicsImpact,
      score: constraintScore
    }
  };
}

/**
 * Calculate the performance impact of IK constraints
 * @param ikData Array of IK constraint data
 * @returns Impact score from 0-100
 */
function calculateIkImpact(ikData: any[]): number {
  if (ikData.length === 0) return 0;
  
  // Base impact from constraint count (logarithmic scaling)
  let impact = Math.log2(ikData.length + 1) * 20;
  
  // Add impact from bone chain complexity
  let totalBones = 0;
  let maxChainLength = 0;
  
  ikData.forEach(ik => {
    totalBones += ik.bones.length;
    maxChainLength = Math.max(maxChainLength, ik.bones.length);
  });
  
  // Add impact based on total bones in constraints
  impact += Math.log2(totalBones + 1) * 10;
  
  // Add penalty for very long chains (exponential cost)
  if (maxChainLength > 2) {
    impact += Math.pow(maxChainLength, PERFORMANCE_FACTORS.IK_CHAIN_LENGTH_FACTOR) * 2;
  }
  
  return Math.min(100, impact);
}

/**
 * Calculate the performance impact of transform constraints
 * @param transformData Array of transform constraint data
 * @returns Impact score from 0-100
 */
function calculateTransformImpact(transformData: any[]): number {
  if (transformData.length === 0) return 0;
  
  // Base impact from constraint count (logarithmic scaling)
  let impact = Math.log2(transformData.length + 1) * 15;
  
  // Add impact from bone count
  let totalBones = 0;
  transformData.forEach(t => {
    totalBones += t.bones.length;
  });
  
  // Add impact based on total bones
  impact += Math.log2(totalBones + 1) * 8;
  
  // Add impact based on property complexity
  let propertyComplexity = 0;
  transformData.forEach(t => {
    // Count how many properties are affected (mixRotate, mixX, etc.)
    let affectedProps = 0;
    if (t.mixRotate > 0) affectedProps++;
    if (t.mixX > 0) affectedProps++;
    if (t.mixY > 0) affectedProps++;
    if (t.mixScaleX > 0) affectedProps++;
    if (t.mixScaleY > 0) affectedProps++;
    if (t.mixShearY > 0) affectedProps++;
    
    propertyComplexity += affectedProps;
  });
  
  // Add property complexity impact
  impact += propertyComplexity * 5;
  
  return Math.min(100, impact);
}

/**
 * Calculate the performance impact of path constraints
 * @param pathData Array of path constraint data
 * @returns Impact score from 0-100
 */
function calculatePathImpact(pathData: any[]): number {
  if (pathData.length === 0) return 0;
  
  // Base impact from constraint count (logarithmic scaling)
  let impact = Math.log2(pathData.length + 1) * 20;
  
  // Add impact from bone count
  let totalBones = 0;
  pathData.forEach(p => {
    totalBones += p.bones.length;
  });
  
  // Add impact based on total bones
  impact += Math.log2(totalBones + 1) * 10;
  
  // Add impact based on mode complexity
  let modeComplexity = 0;
  pathData.forEach(p => {
    // ChainScale is more expensive than Chain, which is more expensive than Tangent
    if (p.rotateMode === 2) modeComplexity += 3; // ChainScale
    else if (p.rotateMode === 1) modeComplexity += 2; // Chain
    else modeComplexity += 1; // Tangent
    
    // Proportional spacing is more complex
    if (p.spacingMode === 3) modeComplexity += 2; // Proportional
    else modeComplexity += 1; // Other modes
    
    // Complex paths with many world positions
    if (p.worldPositionsCount > 20) modeComplexity += 2;
  });
  
  // Add mode complexity impact
  impact += modeComplexity * 7;
  
  return Math.min(100, impact);
}

/**
 * Calculate the performance impact of physics constraints
 * @param physicsData Array of physics constraint data
 * @returns Impact score from 0-100
 */
function calculatePhysicsImpact(physicsData: any[]): number {
  if (physicsData.length === 0) return 0;
  
  // Base impact from constraint count (logarithmic scaling)
  let impact = Math.log2(physicsData.length + 1) * 30;
  
  // Add impact based on property complexity
  let propertiesComplexity = 0;
  physicsData.forEach(p => {
    // Count affected properties
    let affectedProps = 0;
    if (p.affectsX) affectedProps++;
    if (p.affectsY) affectedProps++;
    if (p.affectsRotation) affectedProps++;
    if (p.affectsScale) affectedProps++;
    if (p.affectsShear) affectedProps++;
    
    // Higher damping/strength values can increase iteration count
    const iterationFactor = Math.max(1, 3 - p.damping) * p.strength / 50;
    
    // Wind and gravity add complexity
    const forceComplexity = (Math.abs(p.wind) > 0 ? 1 : 0) + (Math.abs(p.gravity) > 0 ? 1 : 0);
    
    propertiesComplexity += affectedProps * (1 + iterationFactor + forceComplexity);
  });
  
  // Add properties complexity impact
  impact += propertiesComplexity * 5;
  
  return Math.min(100, impact);
}

/**
 * Creates an HTML table for IK constraints
 */
function createIkTable(ikData: any[]): string {
  return `
    <div class="constraint-details">
      <h4>${i18n.t('analysis.physics.constraintDetails.ikConstraints.title')}</h4>
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>${i18n.t('analysis.physics.constraintDetails.ikConstraints.tableHeaders.name')}</th>
            <th>${i18n.t('analysis.physics.constraintDetails.ikConstraints.tableHeaders.target')}</th>
            <th>${i18n.t('analysis.physics.constraintDetails.ikConstraints.tableHeaders.bones')}</th>
            <th>${i18n.t('analysis.physics.constraintDetails.ikConstraints.tableHeaders.mix')}</th>
            <th>${i18n.t('analysis.physics.constraintDetails.ikConstraints.tableHeaders.status')}</th>
          </tr>
        </thead>
        <tbody>
          ${ikData.map(ik => {
            const complexityClass = ik.bones.length > 2 ? 'row-warning' : '';
            
            return `
              <tr class="${complexityClass}">
                <td>${ik.name}</td>
                <td>${ik.target}</td>
                <td>${ik.bones.join(', ')}</td>
                <td>${ik.mix.toFixed(2)}</td>
                <td>${ik.isActive ? i18n.t('analysis.physics.status.active') : i18n.t('analysis.physics.status.inactive')}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Creates an HTML table for transform constraints
 */
function createTransformTable(transformData: any[]): string {
  return `
    <div class="constraint-details">
      <h4>${i18n.t('analysis.physics.constraintDetails.transformConstraints.title')}</h4>
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>${i18n.t('analysis.physics.constraintDetails.transformConstraints.tableHeaders.name')}</th>
            <th>${i18n.t('analysis.physics.constraintDetails.transformConstraints.tableHeaders.target')}</th>
            <th>${i18n.t('analysis.physics.constraintDetails.transformConstraints.tableHeaders.bones')}</th>
            <th>${i18n.t('analysis.physics.constraintDetails.transformConstraints.tableHeaders.properties')}</th>
            <th>${i18n.t('analysis.physics.constraintDetails.transformConstraints.tableHeaders.status')}</th>
          </tr>
        </thead>
        <tbody>
          ${transformData.map(t => {
            // List affected properties
            const props = [];
            if (t.mixRotate > 0) props.push(`${i18n.t('analysis.physics.properties.rotate')}: ${t.mixRotate.toFixed(2)}`);
            if (t.mixX > 0) props.push(`${i18n.t('analysis.physics.properties.x')}: ${t.mixX.toFixed(2)}`);
            if (t.mixY > 0) props.push(`${i18n.t('analysis.physics.properties.y')}: ${t.mixY.toFixed(2)}`);
            if (t.mixScaleX > 0) props.push(`${i18n.t('analysis.physics.properties.scaleX')}: ${t.mixScaleX.toFixed(2)}`);
            if (t.mixScaleY > 0) props.push(`${i18n.t('analysis.physics.properties.scaleY')}: ${t.mixScaleY.toFixed(2)}`);
            if (t.mixShearY > 0) props.push(`${i18n.t('analysis.physics.properties.shearY')}: ${t.mixShearY.toFixed(2)}`);
            
            const complexityClass = props.length > 3 ? 'row-warning' : '';
            
            return `
              <tr class="${complexityClass}">
                <td>${t.name}</td>
                <td>${t.target}</td>
                <td>${t.bones.join(', ')}</td>
                <td>${props.join(', ')}</td>
                <td>${t.isActive ? i18n.t('analysis.physics.status.active') : i18n.t('analysis.physics.status.inactive')}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Creates an HTML table for path constraints
 */
function createPathTable(pathData: any[]): string {
  // Helper function to get readable mode names
  const getRotateModeName = (mode: number): string => {
    switch(mode) {
      case 0: return i18n.t('analysis.physics.modes.rotate.tangent');
      case 1: return i18n.t('analysis.physics.modes.rotate.chain');
      case 2: return i18n.t('analysis.physics.modes.rotate.chainScale');
      default: return `Unknown (${mode})`;
    }
  };
  
  const getSpacingModeName = (mode: number): string => {
    switch(mode) {
      case 0: return i18n.t('analysis.physics.modes.spacing.length');
      case 1: return i18n.t('analysis.physics.modes.spacing.fixed');
      case 2: return i18n.t('analysis.physics.modes.spacing.percent');
      case 3: return i18n.t('analysis.physics.modes.spacing.proportional');
      default: return `Unknown (${mode})`;
    }
  };
  
  return `
    <div class="constraint-details">
      <h4>${i18n.t('analysis.physics.constraintDetails.pathConstraints.title')}</h4>
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>${i18n.t('analysis.physics.constraintDetails.pathConstraints.tableHeaders.name')}</th>
            <th>${i18n.t('analysis.physics.constraintDetails.pathConstraints.tableHeaders.target')}</th>
            <th>${i18n.t('analysis.physics.constraintDetails.pathConstraints.tableHeaders.bones')}</th>
            <th>${i18n.t('analysis.physics.constraintDetails.pathConstraints.tableHeaders.modes')}</th>
            <th>${i18n.t('analysis.physics.constraintDetails.pathConstraints.tableHeaders.status')}</th>
          </tr>
        </thead>
        <tbody>
          ${pathData.map(p => {
            const complexityClass = (p.rotateMode === 2 || p.bones.length > 3) ? 'row-warning' : '';
            
            return `
              <tr class="${complexityClass}">
                <td>${p.name}</td>
                <td>${p.target}</td>
                <td>${p.bones.join(', ')}</td>
                <td>${i18n.t('analysis.physics.properties.rotate')}: ${getRotateModeName(p.rotateMode)}, Spacing: ${getSpacingModeName(p.spacingMode)}</td>
                <td>${p.isActive ? i18n.t('analysis.physics.status.active') : i18n.t('analysis.physics.status.inactive')}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Creates an HTML table for physics constraints
 */
function createPhysicsTable(physicsData: any[]): string {
  return `
    <div class="constraint-details">
      <h4>${i18n.t('analysis.physics.constraintDetails.physicsConstraints.title')}</h4>
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>${i18n.t('analysis.physics.constraintDetails.physicsConstraints.tableHeaders.name')}</th>
            <th>${i18n.t('analysis.physics.constraintDetails.physicsConstraints.tableHeaders.bone')}</th>
            <th>${i18n.t('analysis.physics.constraintDetails.physicsConstraints.tableHeaders.properties')}</th>
            <th>${i18n.t('analysis.physics.constraintDetails.physicsConstraints.tableHeaders.parameters')}</th>
            <th>${i18n.t('analysis.physics.constraintDetails.physicsConstraints.tableHeaders.status')}</th>
          </tr>
        </thead>
        <tbody>
          ${physicsData.map(p => {
            // List affected properties
            const props = [];
            if (p.affectsX) props.push(i18n.t('analysis.physics.properties.x'));
            if (p.affectsY) props.push(i18n.t('analysis.physics.properties.y'));
            if (p.affectsRotation) props.push(i18n.t('analysis.physics.properties.rotation'));
            if (p.affectsScale) props.push(i18n.t('analysis.physics.properties.scale'));
            if (p.affectsShear) props.push(i18n.t('analysis.physics.properties.shear'));
            
            // Properties that affect simulation
            const params = [
              `${i18n.t('analysis.physics.parameters.inertia')}: ${p.inertia.toFixed(2)}`,
              `${i18n.t('analysis.physics.parameters.strength')}: ${p.strength.toFixed(2)}`,
              `${i18n.t('analysis.physics.parameters.damping')}: ${p.damping.toFixed(2)}`
            ];
            
            if (p.wind !== 0) params.push(`${i18n.t('analysis.physics.parameters.wind')}: ${p.wind.toFixed(2)}`);
            if (p.gravity !== 0) params.push(`${i18n.t('analysis.physics.parameters.gravity')}: ${p.gravity.toFixed(2)}`);
            
            const complexityClass = props.length > 2 ? 'row-warning' : '';
            
            return `
              <tr class="${complexityClass}">
                <td>${p.name}</td>
                <td>${p.bone}</td>
                <td>${props.join(', ')}</td>
                <td>${params.join(', ')}</td>
                <td>${p.isActive ? i18n.t('analysis.physics.status.active') : i18n.t('analysis.physics.status.inactive')}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}