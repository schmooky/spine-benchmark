import { 
  Animation,
  Physics,
  Spine,
  MeshAttachment,
  ClippingAttachment,
  RegionAttachment,
  DeformTimeline,
  IkConstraintTimeline,
  TransformConstraintTimeline,
  PathConstraintMixTimeline,
  PathConstraintPositionTimeline,
  PathConstraintSpacingTimeline,
  PhysicsConstraintTimeline,
  BlendMode
} from "@esotericsoftware/spine-pixi-v8";
import { 
  PerformanceMetrics,
  AnimationPerformanceAnalysis,
  SpinePerformanceAnalysisResult
} from "../SpinePerformanceAnalyzer";
import { 
  calculateComputationImpact,
  calculateRenderingImpact,
  calculatePerformanceScore
} from "../utils/performanceCalculator";
import { AnimationSampler } from "../utils/animationSampler";

interface FrameData {
  bones: { count: number; depths: number[] };
  constraints: {
    ikChains: number[];
    transformCount: number;
    pathBonesAffected: number[];
    pathSampleSteps: number[];
    physicsCount: number;
  };
  animation: {
    activeTracksMinusBase: number;
    appliedTimelines: number;
  };
  meshes: {
    vertexCount: number;
    skinnedWeights: number;
    deformTimelines: number;
  };
  clipping: {
    attachmentTris: number;
    polyTris: number;
    transitions: number;
  };
  rendering: {
    estimatedDrawCalls: number;
    renderedTriangles: number;
    nonNormalBlendSlots: number;
  };
}

/**
 * Analyzes skeleton structure
 */
export function analyzeSkeletonStructure(spineInstance: Spine) {
  const skeleton = spineInstance.skeleton;
  const bones = skeleton.bones;
  
  const depths: number[] = [];
  bones.forEach(bone => {
    let depth = 0;
    let parent = bone.parent;
    while (parent) {
      depth++;
      parent = parent.parent;
    }
    depths.push(depth);
  });
  
  return {
    boneCount: bones.length,
    depths
  };
}

/**
 * Analyzes global data across all animations
 */
export function analyzeGlobalData(spineInstance: Spine) {
  // This can be expanded to include global metrics if needed
  return {};
}

/**
 * Extract frame data at current skeleton state
 */
function extractFrameData(skeleton: any, animation: Animation): FrameData {
  const frameData: FrameData = {
    bones: {
      count: skeleton.bones.length,
      depths: []
    },
    constraints: {
      ikChains: [],
      transformCount: 0,
      pathBonesAffected: [],
      pathSampleSteps: [],
      physicsCount: 0
    },
    animation: {
      activeTracksMinusBase: 0, // Will be set by caller
      appliedTimelines: animation.timelines.length
    },
    meshes: {
      vertexCount: 0,
      skinnedWeights: 0,
      deformTimelines: 0
    },
    clipping: {
      attachmentTris: 0,
      polyTris: 0,
      transitions: 0
    },
    rendering: {
      estimatedDrawCalls: 1,
      renderedTriangles: 0,
      nonNormalBlendSlots: 0
    }
  };

  // Extract bone depths
  skeleton.bones.forEach((bone: any) => {
    let depth = 0;
    let parent = bone.parent;
    while (parent) {
      depth++;
      parent = parent.parent;
    }
    frameData.bones.depths.push(depth);
  });

  // Extract active constraint data
  skeleton.ikConstraints.forEach((constraint: any) => {
    if (constraint.isActive() && constraint.mix > 0) {
      frameData.constraints.ikChains.push(constraint.bones.length);
    }
  });

  skeleton.transformConstraints.forEach((constraint: any) => {
    if (constraint.isActive()) {
      const hasEffect = constraint.mixRotate > 0 || constraint.mixX > 0 || 
                       constraint.mixY > 0 || constraint.mixScaleX > 0 || 
                       constraint.mixScaleY > 0 || constraint.mixShearY > 0;
      if (hasEffect) {
        frameData.constraints.transformCount++;
      }
    }
  });

  skeleton.pathConstraints.forEach((constraint: any) => {
    if (constraint.isActive()) {
      frameData.constraints.pathBonesAffected.push(constraint.bones.length);
      // Estimate sample steps based on path length
      const pathLength = constraint.lengths ? constraint.lengths.reduce((a: number, b: number) => a + b, 0) : 100;
      const sampleSteps = Math.ceil(pathLength / 10); // Sample every 10 units
      frameData.constraints.pathSampleSteps.push(sampleSteps);
    }
  });

  if (skeleton.physicsConstraints) {
    skeleton.physicsConstraints.forEach((constraint: any) => {
      if (constraint.isActive() && constraint.mix > 0) {
        frameData.constraints.physicsCount++;
      }
    });
  }

  // Count deform timelines in the animation
  animation.timelines.forEach(timeline => {
    if (timeline instanceof DeformTimeline) {
      frameData.meshes.deformTimelines++;
    }
  });

  // Analyze visible attachments and rendering data
  const visibleAttachments: any[] = [];
  let currentClipDepth = 0;
  let lastClipDepth = 0;
  
  skeleton.slots.forEach((slot: any) => {
    if (slot.color.a === 0) return;
    
    const attachment = slot.getAttachment();
    if (!attachment) return;
    
    visibleAttachments.push({ slot, attachment });
    
    // Count blend modes
    if (slot.data.blendMode !== BlendMode.Normal) {
      frameData.rendering.nonNormalBlendSlots++;
    }
    
    // Process attachment types
    if (attachment instanceof MeshAttachment) {
      const vertexCount = attachment.worldVerticesLength / 2;
      frameData.meshes.vertexCount += vertexCount;
      
      // Count skinned weights
      if (attachment.bones && attachment.bones.length > 0) {
        const bonesPerVertex = attachment.bones.length / vertexCount;
        frameData.meshes.skinnedWeights += (bonesPerVertex - 1) * vertexCount;
      }
      
      // Count triangles
      const triangleCount = attachment.triangles ? attachment.triangles.length / 3 : 0;
      frameData.rendering.renderedTriangles += triangleCount;
      
      // Track for clipping
      if (currentClipDepth > 0) {
        frameData.clipping.attachmentTris += triangleCount;
      }
    } else if (attachment instanceof RegionAttachment) {
      // Regions are rendered as 2 triangles
      frameData.rendering.renderedTriangles += 2;
      
      if (currentClipDepth > 0) {
        frameData.clipping.attachmentTris += 2;
      }
    } else if (attachment instanceof ClippingAttachment) {
      currentClipDepth++;
      if (currentClipDepth !== lastClipDepth) {
        frameData.clipping.transitions++;
        lastClipDepth = currentClipDepth;
      }
      
      // Count clipping polygon triangles
      const clipVertices = attachment.worldVerticesLength / 2;
      if (clipVertices >= 3) {
        frameData.clipping.polyTris += clipVertices - 2;
      }
    }
  });
  
  // Reset clip depth if changed
  if (currentClipDepth !== lastClipDepth) {
    frameData.clipping.transitions++;
  }
  
  // Estimate draw calls based on state changes
  frameData.rendering.estimatedDrawCalls = estimateDrawCalls(visibleAttachments);
  
  return frameData;
}

/**
 * Estimate draw calls based on attachment state changes
 */
function estimateDrawCalls(visibleAttachments: any[]): number {
  if (visibleAttachments.length === 0) return 0;
  
  let drawCalls = 1;
  let lastBlendMode = visibleAttachments[0].slot.data.blendMode;
  let lastIsClipping = false;
  let lastIsMesh = visibleAttachments[0].attachment instanceof MeshAttachment;
  
  for (let i = 1; i < visibleAttachments.length; i++) {
    const { slot, attachment } = visibleAttachments[i];
    const blendMode = slot.data.blendMode;
    const isClipping = attachment instanceof ClippingAttachment;
    const isMesh = attachment instanceof MeshAttachment;
    
    // Count state changes that trigger new draw calls
    if (blendMode !== lastBlendMode) {
      drawCalls++;
      lastBlendMode = blendMode;
    }
    
    if (isClipping !== lastIsClipping) {
      drawCalls++;
      lastIsClipping = isClipping;
    }
    
    // Mesh/Region splits (simplified - in reality depends on batching)
    if (isMesh !== lastIsMesh) {
      drawCalls++;
      lastIsMesh = isMesh;
    }
  }
  
  return drawCalls;
}

/**
 * Analyze a single animation
 */
export function analyzeSingleAnimation(
  spineInstance: Spine, 
  animation: Animation
): AnimationPerformanceAnalysis {
  const skeleton = spineInstance.skeleton;
  const state = spineInstance.state;
  
  // Sample animation at multiple points and collect max values
  const maxFrameData: FrameData = {
    bones: { count: skeleton.bones.length, depths: [] },
    constraints: { ikChains: [], transformCount: 0, pathBonesAffected: [], pathSampleSteps: [], physicsCount: 0 },
    animation: { activeTracksMinusBase: 0, appliedTimelines: animation.timelines.length },
    meshes: { vertexCount: 0, skinnedWeights: 0, deformTimelines: 0 },
    clipping: { attachmentTris: 0, polyTris: 0, transitions: 0 },
    rendering: { estimatedDrawCalls: 0, renderedTriangles: 0, nonNormalBlendSlots: 0 }
  };

  // Sample animation
  AnimationSampler.sampleAnimation(
    spineInstance,
    animation,
    (time, sampledSkeleton) => {
      const frameData = extractFrameData(sampledSkeleton, animation);
      
      // Keep maximum values across all frames
      maxFrameData.bones.depths = frameData.bones.depths; // Same for all frames
      
      // Constraints - keep all unique chains/counts
      frameData.constraints.ikChains.forEach(chain => {
        if (!maxFrameData.constraints.ikChains.includes(chain)) {
          maxFrameData.constraints.ikChains.push(chain);
        }
      });
      maxFrameData.constraints.transformCount = Math.max(
        maxFrameData.constraints.transformCount, 
        frameData.constraints.transformCount
      );
      maxFrameData.constraints.pathBonesAffected = [
        ...maxFrameData.constraints.pathBonesAffected,
        ...frameData.constraints.pathBonesAffected
      ];
      maxFrameData.constraints.pathSampleSteps = [
        ...maxFrameData.constraints.pathSampleSteps,
        ...frameData.constraints.pathSampleSteps
      ];
      maxFrameData.constraints.physicsCount = Math.max(
        maxFrameData.constraints.physicsCount,
        frameData.constraints.physicsCount
      );
      
      // Meshes
      maxFrameData.meshes.vertexCount = Math.max(
        maxFrameData.meshes.vertexCount,
        frameData.meshes.vertexCount
      );
      maxFrameData.meshes.skinnedWeights = Math.max(
        maxFrameData.meshes.skinnedWeights,
        frameData.meshes.skinnedWeights
      );
      maxFrameData.meshes.deformTimelines = frameData.meshes.deformTimelines; // Same for all frames
      
      // Clipping
      maxFrameData.clipping.attachmentTris = Math.max(
        maxFrameData.clipping.attachmentTris,
        frameData.clipping.attachmentTris
      );
      maxFrameData.clipping.polyTris = Math.max(
        maxFrameData.clipping.polyTris,
        frameData.clipping.polyTris
      );
      maxFrameData.clipping.transitions = Math.max(
        maxFrameData.clipping.transitions,
        frameData.clipping.transitions
      );
      
      // Rendering
      maxFrameData.rendering.estimatedDrawCalls = Math.max(
        maxFrameData.rendering.estimatedDrawCalls,
        frameData.rendering.estimatedDrawCalls
      );
      maxFrameData.rendering.renderedTriangles = Math.max(
        maxFrameData.rendering.renderedTriangles,
        frameData.rendering.renderedTriangles
      );
      maxFrameData.rendering.nonNormalBlendSlots = Math.max(
        maxFrameData.rendering.nonNormalBlendSlots,
        frameData.rendering.nonNormalBlendSlots
      );
    },
    { sampleRate: 60 } // 60 FPS sampling
  );
  
  // Set active tracks
  maxFrameData.animation.activeTracksMinusBase = Math.max(0, state.tracks.filter(t => t != null).length - 1);
  
  // Calculate metrics
  const computationImpact = calculateComputationImpact(maxFrameData);
  const renderingImpact = calculateRenderingImpact(maxFrameData);
  const totalImpact = computationImpact + renderingImpact;
  const performanceScore = calculatePerformanceScore(totalImpact);
  
  return {
    name: animation.name,
    duration: animation.duration,
    metrics: {
      computationImpact,
      renderingImpact,
      totalImpact,
      performanceScore
    },
    frameMetrics: maxFrameData
  };
}

/**
 * Analyze all animations in the Spine instance
 */
export function analyzeAnimations(spineInstance: Spine): AnimationPerformanceAnalysis[] {
  const animations = spineInstance.skeleton.data.animations;
  return animations.map(animation => analyzeSingleAnimation(spineInstance, animation));
}

/**
 * Calculate statistics from animation analyses
 */
export function calculateStatistics(animationAnalyses: AnimationPerformanceAnalysis[]): any {
  return {
    animationsWithHighCI: animationAnalyses.filter(a => a.metrics.computationImpact > 100).length,
    animationsWithHighRI: animationAnalyses.filter(a => a.metrics.renderingImpact > 50).length,
    animationsWithPoorScore: animationAnalyses.filter(a => a.metrics.performanceScore < 50).length
  };
}

/**
 * Sort animation analyses by score
 */
export function sortAnalyses(animationAnalyses: AnimationPerformanceAnalysis[]): any {
  const scores = animationAnalyses.map(a => a.metrics.performanceScore);
  scores.sort((a, b) => a - b);
  const medianScore = scores.length > 0 ? scores[Math.floor(scores.length / 2)] : 100;

  const sortedAnalyses = [...animationAnalyses].sort((a, b) => 
    b.metrics.performanceScore - a.metrics.performanceScore
  );
  
  return {
    sorted: sortedAnalyses,
    best: sortedAnalyses.length > 0 ? sortedAnalyses[0] : null,
    worst: sortedAnalyses.length > 0 ? sortedAnalyses[sortedAnalyses.length - 1] : null,
    medianScore
  };
}

/**
 * Aggregate all analysis results
 */
export function aggregateResults(
  spineInstance: Spine,
  skeletonData: any,
  globalData: any,
  animationData: AnimationPerformanceAnalysis[],
  statistics: any,
  sortedData: any
): SpinePerformanceAnalysisResult {
  // Calculate global metrics as worst-case across all animations
  let maxCI = 0, maxRI = 0;
  animationData.forEach(a => {
    maxCI = Math.max(maxCI, a.metrics.computationImpact);
    maxRI = Math.max(maxRI, a.metrics.renderingImpact);
  });
  
  const globalTotalImpact = maxCI + maxRI;
  const globalScore = calculatePerformanceScore(globalTotalImpact);
  
  return {
    skeletonName: spineInstance.skeleton.data.name || 'Unnamed',
    totalAnimations: spineInstance.skeleton.data.animations.length,
    animations: animationData,
    globalMetrics: {
      computationImpact: maxCI,
      renderingImpact: maxRI,
      totalImpact: globalTotalImpact,
      performanceScore: globalScore
    },
    medianScore: sortedData.medianScore,
    bestAnimation: sortedData.best,
    worstAnimation: sortedData.worst,
    stats: statistics
  };
}