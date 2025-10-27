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
      activeTracksMinusBase: 0,
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

  skeleton.bones.forEach((bone: any) => {
    let depth = 0;
    let parent = bone.parent;
    while (parent) {
      depth++;
      parent = parent.parent;
    }
    frameData.bones.depths.push(depth);
  });

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
      const pathLength = constraint.lengths ? constraint.lengths.reduce((a: number, b: number) => a + b, 0) : 100;
      const sampleSteps = Math.ceil(pathLength / 10);
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

  animation.timelines.forEach(timeline => {
    if (timeline instanceof DeformTimeline) {
      frameData.meshes.deformTimelines++;
    }
  });

  const visibleAttachments: any[] = [];
  let currentClipDepth = 0;
  let lastClipDepth = 0;
  
  skeleton.slots.forEach((slot: any) => {
    if (slot.color.a === 0) return;
    
    const attachment = slot.getAttachment();
    if (!attachment) return;
    
    visibleAttachments.push({ slot, attachment });
    
    if (slot.data.blendMode !== BlendMode.Normal) {
      frameData.rendering.nonNormalBlendSlots++;
    }
    
    if (attachment instanceof MeshAttachment) {
      const vertexCount = attachment.worldVerticesLength / 2;
      frameData.meshes.vertexCount += vertexCount;
      
      if (attachment.bones && attachment.bones.length > 0) {
        const bonesPerVertex = attachment.bones.length / vertexCount;
        frameData.meshes.skinnedWeights += (bonesPerVertex - 1) * vertexCount;
      }
      
      const triangleCount = attachment.triangles ? attachment.triangles.length / 3 : 0;
      frameData.rendering.renderedTriangles += triangleCount;
      
      if (currentClipDepth > 0) {
        frameData.clipping.attachmentTris += triangleCount;
      }
    } else if (attachment instanceof RegionAttachment) {
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
      
      const clipVertices = attachment.worldVerticesLength / 2;
      if (clipVertices >= 3) {
        frameData.clipping.polyTris += clipVertices - 2;
      }
    }
  });
  
  if (currentClipDepth !== lastClipDepth) {
    frameData.clipping.transitions++;
  }
  
  frameData.rendering.estimatedDrawCalls = estimateDrawCalls(visibleAttachments);
  
  return frameData;
}

/**
 * Estimate draw calls based on attachment state changes
 * Enhanced to provide more accurate batching analysis
 */
function estimateDrawCalls(visibleAttachments: any[]): number {
  if (visibleAttachments.length === 0) return 0;
  
  let drawCalls = 1;
  let lastBlendMode = visibleAttachments[0].slot.data.blendMode;
  let lastIsClipping = false;
  let lastIsMesh = visibleAttachments[0].attachment instanceof MeshAttachment;
  let lastTextureAtlas = getTextureAtlasId(visibleAttachments[0].attachment);
  let lastShaderProgram = getShaderProgramId(visibleAttachments[0].slot, visibleAttachments[0].attachment);
  
  for (let i = 1; i < visibleAttachments.length; i++) {
    const { slot, attachment } = visibleAttachments[i];
    const blendMode = slot.data.blendMode;
    const isClipping = attachment instanceof ClippingAttachment;
    const isMesh = attachment instanceof MeshAttachment;
    const textureAtlas = getTextureAtlasId(attachment);
    const shaderProgram = getShaderProgramId(slot, attachment);
    
    let batchBreak = false;
    
    if (blendMode !== lastBlendMode) {
      drawCalls++;
      batchBreak = true;
      lastBlendMode = blendMode;
    }
    
    if (isClipping !== lastIsClipping) {
      drawCalls++;
      batchBreak = true;
      lastIsClipping = isClipping;
    }
    
    if (!batchBreak && textureAtlas !== lastTextureAtlas) {
      drawCalls++;
      batchBreak = true;
      lastTextureAtlas = textureAtlas;
    }
    
    if (!batchBreak && shaderProgram !== lastShaderProgram) {
      drawCalls++;
      batchBreak = true;
      lastShaderProgram = shaderProgram;
    }
    
    if (!batchBreak && isMesh !== lastIsMesh) {
      drawCalls++;
      lastIsMesh = isMesh;
    }
  }
  
  return drawCalls;
}

/**
 * Get texture atlas identifier for batching analysis
 */
function getTextureAtlasId(attachment: any): string {
  if (!attachment) return 'none';
  
  if (attachment.region) {
    return attachment.region.texture?.baseTexture?.resource?.src || 'default';
  }
  
  if (attachment.textureRegion) {
    return attachment.textureRegion.texture?.baseTexture?.resource?.src || 'default';
  }
  
  return 'default';
}

/**
 * Get shader program identifier for batching analysis
 */
function getShaderProgramId(slot: any, attachment: any): string {
  const parts = [];
  
  if (attachment instanceof MeshAttachment) {
    parts.push('mesh');
  } else if (attachment instanceof RegionAttachment) {
    parts.push('region');
  } else if (attachment instanceof ClippingAttachment) {
    parts.push('clip');
  } else {
    parts.push('other');
  }
  
  if (slot.data.blendMode !== BlendMode.Normal) {
    parts.push(slot.data.blendMode.toString());
  }
  
  if (slot.darkColor && (slot.darkColor.r !== 0 || slot.darkColor.g !== 0 || slot.darkColor.b !== 0)) {
    parts.push('dark-tint');
  }
  
  if (attachment instanceof MeshAttachment && attachment.bones && attachment.bones.length > 0) {
    parts.push('skinned');
  }
  
  return parts.join('-');
}

/**
 * Analyze a single animation
 */
function analyzeSingleAnimation(
  spineInstance: Spine, 
  animation: Animation
): AnimationPerformanceAnalysis {
  const skeleton = spineInstance.skeleton;
  const state = spineInstance.state;
  
  const maxFrameData: FrameData = {
    bones: { count: skeleton.bones.length, depths: [] },
    constraints: { ikChains: [], transformCount: 0, pathBonesAffected: [], pathSampleSteps: [], physicsCount: 0 },
    animation: { activeTracksMinusBase: 0, appliedTimelines: animation.timelines.length },
    meshes: { vertexCount: 0, skinnedWeights: 0, deformTimelines: 0 },
    clipping: { attachmentTris: 0, polyTris: 0, transitions: 0 },
    rendering: { estimatedDrawCalls: 0, renderedTriangles: 0, nonNormalBlendSlots: 0 }
  };

  AnimationSampler.sampleAnimation(
    spineInstance,
    animation,
    (time, sampledSkeleton) => {
      const frameData = extractFrameData(sampledSkeleton, animation);
      
      maxFrameData.bones.depths = frameData.bones.depths;
      
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
      
      maxFrameData.meshes.vertexCount = Math.max(
        maxFrameData.meshes.vertexCount,
        frameData.meshes.vertexCount
      );
      maxFrameData.meshes.skinnedWeights = Math.max(
        maxFrameData.meshes.skinnedWeights,
        frameData.meshes.skinnedWeights
      );
      maxFrameData.meshes.deformTimelines = frameData.meshes.deformTimelines;
      
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
    { sampleRate: 60 }
  );
  
  maxFrameData.animation.activeTracksMinusBase = Math.max(0, state.tracks.filter(t => t != null).length - 1);
  
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