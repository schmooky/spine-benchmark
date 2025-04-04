import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { PERFORMANCE_FACTORS } from "../constants/performanceFactors";
import { getScoreColor } from "../utils/scoreCalculator";

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
    affectsScale: constraint.data.scaleX > 0 || constraint.data.scaleY > 0,
    affectsShear: constraint.data.shearX > 0 || constraint.data.shearY > 0,
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
      <h3>Constraints Analysis</h3>
      <p>Total constraints: ${totalConstraints}</p>
      
      <div class="performance-score">
        <h4>Constraint Performance Score: ${constraintScore.toFixed(1)}/100</h4>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${constraintScore}%; background-color: ${getScoreColor(constraintScore)};"></div>
        </div>
      </div>
      
      <div class="analysis-metrics">
        <p><strong>Performance Impact Formula:</strong></p>
        <code>constraintScore = 100 - (constraintImpact * 0.5)</code>
        <p>Where constraintImpact is a weighted sum of IK, transform, path, and physics constraint impacts</p>
      </div>
      
      <div class="constraint-summary">
        <h4>Impact Breakdown:</h4>
        <table class="benchmark-table">
          <thead>
            <tr>
              <th>Constraint Type</th>
              <th>Count</th>
              <th>Impact Level</th>
              <th>Weighted Impact</th>
            </tr>
          </thead>
          <tbody>
            <tr class="${ikImpact > 50 ? 'row-warning' : ''}">
              <td>IK Constraints</td>
              <td>${ikConstraints.length}</td>
              <td>${ikImpact.toFixed(1)}%</td>
              <td>${(ikImpact * PERFORMANCE_FACTORS.IK_WEIGHT).toFixed(1)}%</td>
            </tr>
            <tr class="${transformImpact > 50 ? 'row-warning' : ''}">
              <td>Transform Constraints</td>
              <td>${transformConstraints.length}</td>
              <td>${transformImpact.toFixed(1)}%</td>
              <td>${(transformImpact * PERFORMANCE_FACTORS.TRANSFORM_WEIGHT).toFixed(1)}%</td>
            </tr>
            <tr class="${pathImpact > 50 ? 'row-warning' : ''}">
              <td>Path Constraints</td>
              <td>${pathConstraints.length}</td>
              <td>${pathImpact.toFixed(1)}%</td>
              <td>${(pathImpact * PERFORMANCE_FACTORS.PATH_WEIGHT).toFixed(1)}%</td>
            </tr>
            <tr class="${physicsImpact > 50 ? 'row-warning' : ''}">
              <td>Physics Constraints</td>
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
        <h4>Notes on Constraints:</h4>
        <ul>
          <li><strong>IK Constraints:</strong> Cost increases with bone chain length and iteration count</li>
          <li><strong>Physics Constraints:</strong> Highest performance impact, especially with multiple affected properties</li>
          <li><strong>Path Constraints:</strong> Complex path curves and ChainScale rotate mode are more expensive</li>
          <li><strong>Transform Constraints:</strong> Each affected property (position, rotation, scale) adds calculation overhead</li>
          <li><strong>Recommendation:</strong> Use constraints sparingly and with minimal bone chains when possible</li>
        </ul>
      </div>
    `;
  } else {
    html += `<p>No constraints found in this skeleton.</p>`;
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
      <h4>IK Constraints</h4>
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Target</th>
            <th>Bones</th>
            <th>Mix</th>
            <th>Status</th>
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
                <td>${ik.isActive ? 'Active' : 'Inactive'}</td>
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
      <h4>Transform Constraints</h4>
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Target</th>
            <th>Bones</th>
            <th>Properties</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${transformData.map(t => {
            // List affected properties
            const props = [];
            if (t.mixRotate > 0) props.push(`Rotate: ${t.mixRotate.toFixed(2)}`);
            if (t.mixX > 0) props.push(`X: ${t.mixX.toFixed(2)}`);
            if (t.mixY > 0) props.push(`Y: ${t.mixY.toFixed(2)}`);
            if (t.mixScaleX > 0) props.push(`ScaleX: ${t.mixScaleX.toFixed(2)}`);
            if (t.mixScaleY > 0) props.push(`ScaleY: ${t.mixScaleY.toFixed(2)}`);
            if (t.mixShearY > 0) props.push(`ShearY: ${t.mixShearY.toFixed(2)}`);
            
            const complexityClass = props.length > 3 ? 'row-warning' : '';
            
            return `
              <tr class="${complexityClass}">
                <td>${t.name}</td>
                <td>${t.target}</td>
                <td>${t.bones.join(', ')}</td>
                <td>${props.join(', ')}</td>
                <td>${t.isActive ? 'Active' : 'Inactive'}</td>
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
      case 0: return 'Tangent';
      case 1: return 'Chain';
      case 2: return 'ChainScale';
      default: return `Unknown (${mode})`;
    }
  };
  
  const getSpacingModeName = (mode: number): string => {
    switch(mode) {
      case 0: return 'Length';
      case 1: return 'Fixed';
      case 2: return 'Percent';
      case 3: return 'Proportional';
      default: return `Unknown (${mode})`;
    }
  };
  
  return `
    <div class="constraint-details">
      <h4>Path Constraints</h4>
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Target</th>
            <th>Bones</th>
            <th>Modes</th>
            <th>Status</th>
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
                <td>Rotate: ${getRotateModeName(p.rotateMode)}, Spacing: ${getSpacingModeName(p.spacingMode)}</td>
                <td>${p.isActive ? 'Active' : 'Inactive'}</td>
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
      <h4>Physics Constraints</h4>
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Bone</th>
            <th>Properties</th>
            <th>Parameters</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${physicsData.map(p => {
            // List affected properties
            const props = [];
            if (p.affectsX) props.push('X');
            if (p.affectsY) props.push('Y');
            if (p.affectsRotation) props.push('Rotation');
            if (p.affectsScale) props.push('Scale');
            if (p.affectsShear) props.push('Shear');
            
            // Properties that affect simulation
            const params = [
              `Inertia: ${p.inertia.toFixed(2)}`,
              `Strength: ${p.strength.toFixed(2)}`,
              `Damping: ${p.damping.toFixed(2)}`
            ];
            
            if (p.wind !== 0) params.push(`Wind: ${p.wind.toFixed(2)}`);
            if (p.gravity !== 0) params.push(`Gravity: ${p.gravity.toFixed(2)}`);
            
            const complexityClass = props.length > 2 ? 'row-warning' : '';
            
            return `
              <tr class="${complexityClass}">
                <td>${p.name}</td>
                <td>${p.bone}</td>
                <td>${props.join(', ')}</td>
                <td>${params.join(', ')}</td>
                <td>${p.isActive ? 'Active' : 'Inactive'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}