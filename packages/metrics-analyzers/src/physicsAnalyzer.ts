import { Animation, Spine } from "@esotericsoftware/spine-pixi-v8";
import { PERFORMANCE_FACTORS } from "@spine-benchmark/metrics-factors";
import type { ActiveComponents } from "@spine-benchmark/metrics-sampling";

export interface ConstraintMetrics {
  activeIkCount: number;
  activeTransformCount: number;
  activePathCount: number;
  activePhysicsCount: number;
  totalActiveConstraints: number;
  ikImpact: number;
  transformImpact: number;
  pathImpact: number;
  physicsImpact: number;
}

export interface IkConstraintInfo {
  name: string;
  target: string;
  bones: string[];
  mix: number;
  softness?: number;
  bendDirection?: number;
  compress?: boolean;
  stretch?: boolean;
  isActive: boolean;
}

export interface TransformConstraintInfo {
  name: string;
  target: string;
  bones: string[];
  mixRotate: number;
  mixX: number;
  mixY: number;
  mixScaleX: number;
  mixScaleY: number;
  mixShearY: number;
  isActive: boolean;
  isLocal: boolean;
  isRelative: boolean;
}

export interface PathConstraintInfo {
  name: string;
  target: string;
  bones: string[];
  mixRotate: number;
  mixX: number;
  mixY: number;
  position: number;
  spacing: number;
  positionMode: number;
  spacingMode: number;
  rotateMode: number;
  offsetRotation: number;
  isActive: boolean;
  worldPositionsCount: number;
  hasSegments: boolean;
  hasLengths: boolean;
}

export interface PhysicsConstraintInfo {
  name: string;
  bone: string;
  inertia: number;
  strength: number;
  damping: number;
  massInverse: number;
  wind: number;
  gravity: number;
  mix: number;
  affectsX: boolean;
  affectsY: boolean;
  affectsRotation: boolean;
  affectsScale: boolean;
  affectsShear: boolean;
  isActive: boolean;
}

export interface GlobalPhysicsAnalysis {
  ikConstraints: IkConstraintInfo[];
  transformConstraints: TransformConstraintInfo[];
  pathConstraints: PathConstraintInfo[];
  physicsConstraints: PhysicsConstraintInfo[];
  metrics: ConstraintMetrics & {
    ikCount: number;
    transformCount: number;
    pathCount: number;
    physicsCount: number;
    totalConstraints: number;
  };
}

/**
 * Analyzes constraints for a specific animation
 * @param spineInstance The Spine instance to analyze
 * @param animation The animation to analyze
 * @param activeComponents Components active in this animation
 * @returns Metrics for constraint analysis
 */
export function analyzePhysicsForAnimation(
  spineInstance: Spine,
  animation: Animation,
  activeComponents: ActiveComponents
): ConstraintMetrics {
  const skeleton = spineInstance.skeleton;
  
  // Count active constraints in this animation
  const activeIkCount = activeComponents.activeConstraints.ik.size;
  const activeTransformCount = activeComponents.activeConstraints.transform.size;
  const activePathCount = activeComponents.activeConstraints.path.size;
  const activePhysicsCount = activeComponents.activeConstraints.physics.size;
  
  console.log(`Active constraints in ${animation.name}:`, {
    ik: activeIkCount,
    transform: activeTransformCount,
    path: activePathCount,
    physics: activePhysicsCount
  });
  
  // Get detailed constraint data for active constraints
  const ikData: any[] = [];
  const transformData: any[] = [];
  const pathData: any[] = [];
  const physicsData: any[] = [];
  
  // Collect IK constraint data
  skeleton.ikConstraints.forEach((constraint: any) => {
    if (activeComponents.activeConstraints.ik.has(constraint.data.name)) {
      ikData.push({
        name: constraint.data.name,
        bones: constraint.bones.map((bone: any) => bone.data.name),
        mix: constraint.mix || constraint.data.mix || 1
      });
    }
  });
  
  // Collect Transform constraint data
  skeleton.transformConstraints.forEach((constraint: any) => {
    if (activeComponents.activeConstraints.transform.has(constraint.data.name)) {
      const affectedProps = [];
      const mixRotate = constraint.mixRotate ?? constraint.data.mixRotate ?? 0;
      const mixX = constraint.mixX ?? constraint.data.mixX ?? 0;
      const mixY = constraint.mixY ?? constraint.data.mixY ?? 0;
      const mixScaleX = constraint.mixScaleX ?? constraint.data.mixScaleX ?? 0;
      const mixScaleY = constraint.mixScaleY ?? constraint.data.mixScaleY ?? 0;
      const mixShearY = constraint.mixShearY ?? constraint.data.mixShearY ?? 0;
      
      if (mixRotate > 0) affectedProps.push('rotate');
      if (mixX > 0) affectedProps.push('x');
      if (mixY > 0) affectedProps.push('y');
      if (mixScaleX > 0) affectedProps.push('scaleX');
      if (mixScaleY > 0) affectedProps.push('scaleY');
      if (mixShearY > 0) affectedProps.push('shearY');
      
      transformData.push({
        name: constraint.data.name,
        bones: constraint.bones.map((bone: any) => bone.data.name),
        affectedProps: affectedProps.length
      });
    }
  });
  
  // Collect Path constraint data
  skeleton.pathConstraints.forEach((constraint: any) => {
    if (activeComponents.activeConstraints.path.has(constraint.data.name)) {
      pathData.push({
        name: constraint.data.name,
        bones: constraint.bones.map((bone: any) => bone.data.name),
        rotateMode: constraint.data.rotateMode || 0,
        spacingMode: constraint.data.spacingMode || 0
      });
    }
  });
  
  // Collect Physics constraint data
  if (skeleton.physicsConstraints) {
    skeleton.physicsConstraints.forEach((constraint: any) => {
      if (activeComponents.activeConstraints.physics.has(constraint.data.name)) {
        const affectedProps = [];
        if (constraint.data.x > 0) affectedProps.push('x');
        if (constraint.data.y > 0) affectedProps.push('y');
        if (constraint.data.rotate > 0) affectedProps.push('rotate');
        if (constraint.data.scaleX > 0) affectedProps.push('scale');
        if (constraint.data.shearX > 0) affectedProps.push('shear');
        
        physicsData.push({
          name: constraint.data.name,
          bone: constraint.bone.data.name,
          affectedProps: affectedProps.length,
          strength: constraint.strength || constraint.data.strength || 100,
          damping: constraint.damping || constraint.data.damping || 1
        });
      }
    });
  }
  
  // Calculate constraint performance impact scores
  const ikImpact = calculateIkImpact(ikData);
  const transformImpact = calculateTransformImpact(transformData);
  const pathImpact = calculatePathImpact(pathData);
  const physicsImpact = calculatePhysicsImpact(physicsData);
  
  // Total active constraints
  const totalActiveConstraints = activeIkCount + activeTransformCount + 
                                activePathCount + activePhysicsCount;
  
  return {
    activeIkCount,
    activeTransformCount,
    activePathCount,
    activePhysicsCount,
    totalActiveConstraints,
    ikImpact,
    transformImpact,
    pathImpact,
    physicsImpact
  };
}

/**
 * Analyzes global physics/constraints across the entire skeleton
 * @param spineInstance The Spine instance to analyze
 * @returns Global physics analysis data
 */
export function analyzeGlobalPhysics(spineInstance: Spine): GlobalPhysicsAnalysis {
  const skeleton = spineInstance.skeleton;
  
  // Get all constraints
  const ikConstraints = skeleton.ikConstraints;
  const transformConstraints = skeleton.transformConstraints;
  const pathConstraints = skeleton.pathConstraints;
  const physicsConstraints = skeleton.physicsConstraints || [];
  
  // Analyze IK Constraints
  const ikData: IkConstraintInfo[] = ikConstraints.map(constraint => ({
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
  const transformData: TransformConstraintInfo[] = transformConstraints.map(constraint => ({
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
  const pathData: PathConstraintInfo[] = pathConstraints.map(constraint => ({
    name: constraint.data.name,
    target: constraint.target.data.name,
    bones: constraint.bones.map(bone => bone.data.name),
    mixRotate: constraint.mixRotate,
    mixX: constraint.mixX,
    mixY: constraint.mixY,
    position: constraint.position,
    spacing: constraint.spacing,
    positionMode: constraint.data.positionMode,
    spacingMode: constraint.data.spacingMode,
    rotateMode: constraint.data.rotateMode,
    offsetRotation: constraint.data.offsetRotation,
    isActive: constraint.isActive(),
    worldPositionsCount: constraint.world ? constraint.world.length / 3 : 0,
    hasSegments: constraint.segments && constraint.segments.length > 0,
    hasLengths: constraint.lengths && constraint.lengths.length > 0
  }));
  
  // Analyze Physics Constraints
  const physicsData: PhysicsConstraintInfo[] = physicsConstraints.map(constraint => ({
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
  
  const metrics = {
    activeIkCount: ikData.length,
    activeTransformCount: transformData.length,
    activePathCount: pathData.length,
    activePhysicsCount: physicsData.length,
    totalActiveConstraints: totalConstraints,
    ikImpact,
    transformImpact,
    pathImpact,
    physicsImpact,
    // Additional fields for compatibility
    ikCount: ikConstraints.length,
    transformCount: transformConstraints.length,
    pathCount: pathConstraints.length,
    physicsCount: physicsConstraints.length,
    totalConstraints
  };
  
  return {
    ikConstraints: ikData,
    transformConstraints: transformData,
    pathConstraints: pathData,
    physicsConstraints: physicsData,
    metrics
  };
}

// Helper functions (unchanged from original)
function calculateIkImpact(ikData: any[]): number {
  if (ikData.length === 0) return 0;
  
  let impact = Math.log2(ikData.length + 1) * 20;
  
  let totalBones = 0;
  let maxChainLength = 0;
  
  ikData.forEach(ik => {
    totalBones += ik.bones.length;
    maxChainLength = Math.max(maxChainLength, ik.bones.length);
  });
  
  impact += Math.log2(totalBones + 1) * 10;
  
  if (maxChainLength > 2) {
    impact += Math.pow(maxChainLength, PERFORMANCE_FACTORS.IK_CHAIN_LENGTH_FACTOR) * 2;
  }
  
  return Math.min(100, impact);
}

function calculateTransformImpact(transformData: any[]): number {
  if (transformData.length === 0) return 0;
  
  let impact = Math.log2(transformData.length + 1) * 15;
  
  let totalBones = 0;
  transformData.forEach(t => {
    totalBones += t.bones.length;
  });
  
  impact += Math.log2(totalBones + 1) * 8;
  
  let propertyComplexity = 0;
  transformData.forEach(t => {
    propertyComplexity += t.affectedProps;
  });
  
  impact += propertyComplexity * 5;
  
  return Math.min(100, impact);
}

function calculatePathImpact(pathData: any[]): number {
  if (pathData.length === 0) return 0;
  
  let impact = Math.log2(pathData.length + 1) * 20;
  
  let totalBones = 0;
  pathData.forEach(p => {
    totalBones += p.bones.length;
  });
  
  impact += Math.log2(totalBones + 1) * 10;
  
  let modeComplexity = 0;
  pathData.forEach(p => {
    if (p.rotateMode === 2) modeComplexity += 3; // ChainScale
    else if (p.rotateMode === 1) modeComplexity += 2; // Chain
    else modeComplexity += 1; // Tangent
    
    if (p.spacingMode === 3) modeComplexity += 2; // Proportional
    else modeComplexity += 1; // Other modes
  });
  
  impact += modeComplexity * 7;
  
  return Math.min(100, impact);
}

function calculatePhysicsImpact(physicsData: any[]): number {
  if (physicsData.length === 0) return 0;
  
  let impact = Math.log2(physicsData.length + 1) * 30;
  
  let propertiesComplexity = 0;
  physicsData.forEach(p => {
    const iterationFactor = Math.max(1, 3 - p.damping) * p.strength / 50;
    propertiesComplexity += p.affectedProps * (1 + iterationFactor);
  });
  
  impact += propertiesComplexity * 5;
  
  return Math.min(100, impact);
}
