import { 
  Animation,
  DeformTimeline,
  IkConstraintTimeline,
  PathConstraintMixTimeline,
  PathConstraintPositionTimeline,
  PathConstraintSpacingTimeline,
  PhysicsConstraintTimeline,
  Spine,
  TransformConstraintTimeline,
  MeshAttachment,
  ClippingAttachment,
  Physics
} from "@esotericsoftware/spine-pixi-v8";
import { 
  analyzeMeshesForAnimation, 
  analyzeGlobalMeshes,
  MeshMetrics,
  GlobalMeshAnalysis 
} from "../analyzers/meshAnalyzer";
import { 
  analyzeClippingForAnimation,
  analyzeGlobalClipping,
  ClippingMetrics,
  GlobalClippingAnalysis
} from "../analyzers/clippingAnalyzer";
import { 
  analyzeBlendModesForAnimation,
  analyzeGlobalBlendModes,
  BlendModeMetrics,
  GlobalBlendModeAnalysis
} from "../analyzers/blendModeAnalyzer";
import { 
  analyzeSkeletonStructure,
  SkeletonAnalysis,
  SkeletonMetrics
} from "../analyzers/skeletonAnalyzer";
import { 
  analyzePhysicsForAnimation,
  analyzeGlobalPhysics,
  ConstraintMetrics,
  GlobalPhysicsAnalysis
} from "../analyzers/physicsAnalyzer";
import { calculateOverallScore } from "../utils/scoreCalculator";
import { AnimationAnalysis, SpineAnalysisResult } from "../SpineAnalyzer";

interface ActiveComponents {
  slots: Set<string>;
  meshes: Set<string>;
  bones: Set<string>;
  hasClipping: boolean;
  hasBlendModes: boolean;
  hasPhysics: boolean;
  hasIK: boolean;
  hasTransform: boolean;
  hasPath: boolean;
  activeConstraints: {
    physics: Set<string>;
    ik: Set<string>;
    transform: Set<string>;
    path: Set<string>;
  };
}

interface SamplingOptions {
  sampleRate?: number;
  preserveState?: boolean;
}

interface AnimationState {
  trackTime: number;
  animationName: string | null;
  loop: boolean;
}

/**
 * AnimationSampler class
 * Provides utilities for sampling Spine animations at different time points
 */
class AnimationSampler {
  /**
   * Sample an animation at multiple time points
   * @param spineInstance - The Spine instance
   * @param animation - The animation to sample
   * @param callback - Function to call at each sample point
   * @param options - Sampling options
   */
  static sampleAnimation(
    spineInstance: Spine, 
    animation: Animation,
    callback: (time: number, skeleton: any) => void,
    options: SamplingOptions = {}
  ): void {
    const skeleton = spineInstance.skeleton;
    const state = spineInstance.state;
    const sampleRate = options.sampleRate ?? 30;
    const preserveState = options.preserveState ?? true;
    
    let originalState: AnimationState | null = null;
    if (preserveState) {
      const currentAnimationTrack0 = state.getCurrent(0);
      originalState = {
        trackTime: currentAnimationTrack0 ? currentAnimationTrack0.trackTime : 0,
        animationName: currentAnimationTrack0 && currentAnimationTrack0.animation ? currentAnimationTrack0.animation.name : null,
        loop: currentAnimationTrack0 ? currentAnimationTrack0.loop : false
      };
    }
    
    try {
      state.clearTrack(0);
      state.setAnimation(0, animation.name, false);
      
      const duration = animation.duration;
      const samples = Math.max(1, Math.ceil(duration * sampleRate));
      
      for (let i = 0; i <= samples; i++) {
        const time = (i / samples) * duration;
        
        const track = state.getCurrent(0);
        if (track) {
          track.trackTime = time;
          track.animationLast = time;
          track.animationEnd = duration;
        }
        
        state.update(0);
        state.apply(skeleton);
        skeleton.updateWorldTransform(Physics.update);
        
        callback(time, skeleton);
      }
    } finally {
      if (preserveState && originalState) {
        state.clearTrack(0);
        if (originalState.animationName) {
          state.setAnimation(0, originalState.animationName, originalState.loop);
          const restoredTrack = state.getCurrent(0);
          if (restoredTrack) {
            restoredTrack.trackTime = originalState.trackTime;
            restoredTrack.animationLast = originalState.trackTime;
            state.update(0);
            state.apply(skeleton);
          }
        }
      }
    }
  }
  
  /**
   * Get the current animation state
   * @param spineInstance - The Spine instance
   * @returns Current animation state
   */
  static getCurrentState(spineInstance: Spine): AnimationState {
    const state = spineInstance.state;
    const currentAnimationTrack0 = state.getCurrent(0);
    
    return {
      trackTime: currentAnimationTrack0 ? currentAnimationTrack0.trackTime : 0,
      animationName: currentAnimationTrack0 && currentAnimationTrack0.animation ? currentAnimationTrack0.animation.name : null,
      loop: currentAnimationTrack0 ? currentAnimationTrack0.loop : false
    };
  }
  
  /**
   * Restore animation state
   * @param spineInstance - The Spine instance
   * @param state - The state to restore
   */
  static restoreState(spineInstance: Spine, state: AnimationState): void {
    const skeleton = spineInstance.skeleton;
    const animationState = spineInstance.state;
    
    animationState.clearTrack(0);
    if (state.animationName) {
      animationState.setAnimation(0, state.animationName, state.loop);
      const restoredTrack = animationState.getCurrent(0);
      if (restoredTrack) {
        restoredTrack.trackTime = state.trackTime;
        restoredTrack.animationLast = state.trackTime;
        animationState.update(0);
        animationState.apply(skeleton);
      }
    }
  }
  
  /**
   * Sample all animations in a Spine instance
   * @param spineInstance - The Spine instance
   * @param callback - Function to call for each animation sample
   * @param options - Sampling options
   */
  static sampleAllAnimations(
    spineInstance: Spine,
    callback: (animation: Animation, time: number, skeleton: any) => void,
    options: SamplingOptions = {}
  ): void {
    const animations = spineInstance.skeleton.data.animations;
    
    animations.forEach(animation => {
      this.sampleAnimation(spineInstance, animation, (time, skeleton) => {
        callback(animation, time, skeleton);
      }, options);
    });
  }
}

/**
 * Determines which components are active/used in a specific animation by sampling frames
 */
function getActiveComponentsForAnimation(
  spineInstance: Spine, 
  animation: Animation
): ActiveComponents {
  const skeleton = spineInstance.skeleton;
  
  const activeComponents: ActiveComponents = {
    slots: new Set<string>(),
    meshes: new Set<string>(),
    bones: new Set<string>(),
    hasClipping: false,
    hasBlendModes: false,
    hasPhysics: false,
    hasIK: false,
    hasTransform: false,
    hasPath: false,
    activeConstraints: {
      physics: new Set<string>(),
      ik: new Set<string>(),
      transform: new Set<string>(),
      path: new Set<string>()
    }
  };

  AnimationSampler.sampleAnimation(
    spineInstance, 
    animation, 
    (time, sampledSkeleton) => {
      analyzeFrameState(sampledSkeleton, activeComponents);
    }
  );
  
  analyzeAnimationTimelines(animation, skeleton, activeComponents);
  
  return activeComponents;
}

/**
 * Analyzes the current frame state to detect active components
 */
function analyzeFrameState(skeleton: any, activeComponents: ActiveComponents): void {
  skeleton.slots.forEach((slot: any) => {
    if (slot.color.a === 0) return;
    
    const attachment = slot.getAttachment();
    if (!attachment) return;
    
    activeComponents.slots.add(slot.data.name);
    
    if (attachment instanceof MeshAttachment) {
      activeComponents.meshes.add(`${slot.data.name}:${attachment.name}`);
    } else if (attachment instanceof ClippingAttachment) {
      activeComponents.hasClipping = true;
    }
    
    if (slot.data.blendMode !== 0) {
      activeComponents.hasBlendModes = true;
    }
    
    let bone = slot.bone;
    while (bone) {
      activeComponents.bones.add(bone.data.name);
      bone = bone.parent;
    }
  });
  
  
  skeleton.ikConstraints.forEach((constraint: any) => {
    if (constraint.isActive() && constraint.mix > 0) {
      activeComponents.hasIK = true;
      activeComponents.activeConstraints.ik.add(constraint.data.name);
      
      constraint.bones.forEach((bone: any) => {
        activeComponents.bones.add(bone.data.name);
      });
    }
  });
  
  skeleton.transformConstraints.forEach((constraint: any) => {
    if (constraint.isActive()) {
      const hasEffect = constraint.mixRotate > 0 || 
                       constraint.mixX > 0 || 
                       constraint.mixY > 0 || 
                       constraint.mixScaleX > 0 || 
                       constraint.mixScaleY > 0 || 
                       constraint.mixShearY > 0;
      
      if (hasEffect) {
        activeComponents.hasTransform = true;
        activeComponents.activeConstraints.transform.add(constraint.data.name);
        
        constraint.bones.forEach((bone: any) => {
          activeComponents.bones.add(bone.data.name);
        });
      }
    }
  });
  
  skeleton.pathConstraints.forEach((constraint: any) => {
    if (constraint.isActive() && (constraint.mixRotate > 0 || constraint.mixX > 0 || constraint.mixY > 0)) {
      activeComponents.hasPath = true;
      activeComponents.activeConstraints.path.add(constraint.data.name);
      
      constraint.bones.forEach((bone: any) => {
        activeComponents.bones.add(bone.data.name);
      });
    }
  });
  
  if (skeleton.physicsConstraints) {
    skeleton.physicsConstraints.forEach((constraint: any) => {
      if (constraint.isActive() && constraint.mix > 0) {
        activeComponents.hasPhysics = true;
        activeComponents.activeConstraints.physics.add(constraint.data.name);
        
        if (constraint.bone) {
          activeComponents.bones.add(constraint.bone.data.name);
        }
      }
    });
  }
}

/**
 * Analyzes animation timelines to ensure we catch all potentially active constraints
 */
function analyzeAnimationTimelines(
  animation: Animation,
  skeleton: any,
  activeComponents: ActiveComponents
): void {
  animation.timelines.forEach(timeline => {
    if (timeline instanceof IkConstraintTimeline) {
      const constraintIndex = (timeline as any).ikConstraintIndex;
      const constraint = skeleton.ikConstraints[constraintIndex];
      if (constraint) {
        activeComponents.hasIK = true;
        activeComponents.activeConstraints.ik.add(constraint.data.name);
      }
    } else if (timeline instanceof TransformConstraintTimeline) {
      const constraintIndex = (timeline as any).transformConstraintIndex;
      const constraint = skeleton.transformConstraints[constraintIndex];
      if (constraint) {
        activeComponents.hasTransform = true;
        activeComponents.activeConstraints.transform.add(constraint.data.name);
      }
    } else if (timeline instanceof PathConstraintMixTimeline ||
               timeline instanceof PathConstraintPositionTimeline ||
               timeline instanceof PathConstraintSpacingTimeline) {
      const constraintIndex = (timeline as any).pathConstraintIndex;
      const constraint = skeleton.pathConstraints[constraintIndex];
      if (constraint) {
        activeComponents.hasPath = true;
        activeComponents.activeConstraints.path.add(constraint.data.name);
      }
    } else if (timeline instanceof PhysicsConstraintTimeline) {
      const constraintIndex = (timeline as any).physicsConstraintIndex;
      const constraint = skeleton.physicsConstraints?.[constraintIndex];
      if (constraint) {
        activeComponents.hasPhysics = true;
        activeComponents.activeConstraints.physics.add(constraint.data.name);
      }
    }
    
    else if (timeline instanceof DeformTimeline) {
      const slotIndex = (timeline as any).slotIndex;
      const slot = skeleton.slots[slotIndex];
      const attachment = (timeline as any).attachment;
      
      if (slot && attachment) {
        activeComponents.slots.add(slot.data.name);
        if (attachment instanceof MeshAttachment) {
          activeComponents.meshes.add(`${slot.data.name}:${attachment.name}`);
        }
      }
    }
  });
}

/**
 * Analyze skeleton structure (common for all animations)
 * @param spineInstance - The Spine instance to analyze
 * @returns SkeletonAnalysis - Analysis of the skeleton structure
 */
export function analyzeSkeleton(spineInstance: Spine): SkeletonAnalysis {
  return analyzeSkeletonStructure(spineInstance);
}

/**
 * Analyze global data across all animations
 * @param spineInstance - The Spine instance to analyze
 * @returns Object containing all global analyses
 */
export function analyzeGlobalData(spineInstance: Spine): {
  globalMesh: GlobalMeshAnalysis;
  globalClipping: GlobalClippingAnalysis;
  globalBlendMode: GlobalBlendModeAnalysis;
  globalPhysics: GlobalPhysicsAnalysis;
} {
  return {
    globalMesh: analyzeGlobalMeshes(spineInstance),
    globalClipping: analyzeGlobalClipping(spineInstance),
    globalBlendMode: analyzeGlobalBlendModes(spineInstance),
    globalPhysics: analyzeGlobalPhysics(spineInstance)
  };
}

/**
 * Analyze a single animation
 * @param spineInstance - The Spine instance to analyze
 * @param animation - The animation to analyze
 * @returns AnimationAnalysis - Analysis of the single animation
 */
function analyzeSingleAnimation(
  spineInstance: Spine, 
  animation: any
): AnimationAnalysis {
  const activeComponents = getActiveComponentsForAnimation(spineInstance, animation);

  const meshMetrics = analyzeMeshesForAnimation(spineInstance, animation, activeComponents);

  const clippingMetrics = analyzeClippingForAnimation(spineInstance, animation, activeComponents);

  const blendModeMetrics = analyzeBlendModesForAnimation(spineInstance, animation, activeComponents);

  const constraintMetrics = analyzePhysicsForAnimation(spineInstance, animation, activeComponents);

  const componentScores = {
    boneScore: analyzeSkeleton(spineInstance).metrics.score,
    meshScore: meshMetrics.score,
    clippingScore: clippingMetrics.score,
    blendModeScore: blendModeMetrics.score,
    constraintScore: constraintMetrics.score
  };

  const overallScore = calculateOverallScore(componentScores);

  return {
    name: animation.name,
    duration: animation.duration,
    overallScore,
    meshMetrics,
    clippingMetrics,
    blendModeMetrics,
    constraintMetrics,
    activeComponents
  };
}

/**
 * Analyze all animations in the Spine instance
 * @param spineInstance - The Spine instance to analyze
 * @returns Array of AnimationAnalysis objects
 */
export function analyzeAnimations(spineInstance: Spine): AnimationAnalysis[] {
  const animations = spineInstance.skeleton.data.animations;
  const animationAnalyses: AnimationAnalysis[] = [];

  animations.forEach((animation) => {
    animationAnalyses.push(analyzeSingleAnimation(spineInstance, animation));
  });

  return animationAnalyses;
}

/**
 * Calculate statistics from animation analyses
 * @param animationAnalyses - Array of AnimationAnalysis objects
 * @returns Statistics object
 */
export function calculateStatistics(animationAnalyses: AnimationAnalysis[]): any {
  return {
    animationsWithPhysics: animationAnalyses.filter(a => a.activeComponents.hasPhysics).length,
    animationsWithClipping: animationAnalyses.filter(a => a.activeComponents.hasClipping).length,
    animationsWithBlendModes: animationAnalyses.filter(a => a.activeComponents.hasBlendModes).length,
    animationsWithIK: animationAnalyses.filter(a => a.activeComponents.hasIK).length,
    animationsWithTransform: animationAnalyses.filter(a => a.activeComponents.hasTransform).length,
    animationsWithPath: animationAnalyses.filter(a => a.activeComponents.hasPath).length,
    highVertexAnimations: animationAnalyses.filter(a => a.meshMetrics.totalVertices > 500).length,
    poorPerformingAnimations: animationAnalyses.filter(a => a.overallScore < 55).length
  };
}

/**
 * Sort animation analyses by score
 * @param animationAnalyses - Array of AnimationAnalysis objects
 * @returns Sorted array with best and worst animations
 */
export function sortAnalyses(animationAnalyses: AnimationAnalysis[]): {
  sorted: AnimationAnalysis[];
  best: AnimationAnalysis | null;
  worst: AnimationAnalysis | null;
  medianScore: number;
} {
  const scores = animationAnalyses.map(a => a.overallScore);
  scores.sort((a, b) => a - b);
  const medianScore = scores.length > 0 
    ? scores[Math.floor(scores.length / 2)]
    : 100;

  const sortedAnalyses = [...animationAnalyses].sort((a, b) => b.overallScore - a.overallScore);
  const bestAnimation = sortedAnalyses.length > 0 ? sortedAnalyses[0] : null;
  const worstAnimation = sortedAnalyses.length > 0 ? sortedAnalyses[sortedAnalyses.length - 1] : null;

  return {
    sorted: sortedAnalyses,
    best: bestAnimation,
    worst: worstAnimation,
    medianScore
  };
}

/**
 * Aggregate all analysis results into a single SpineAnalysisResult
 * @param spineInstance - The Spine instance that was analyzed
 * @param skeletonData - Skeleton analysis data
 * @param globalData - Global analysis data
 * @param animationData - Animation analysis data
 * @param statistics - Calculated statistics
 * @param sortedData - Sorted animation data
 * @returns Complete SpineAnalysisResult
 */
export function aggregateResults(
  spineInstance: Spine,
  skeletonData: SkeletonAnalysis,
  globalData: {
    globalMesh: GlobalMeshAnalysis;
    globalClipping: GlobalClippingAnalysis;
    globalBlendMode: GlobalBlendModeAnalysis;
    globalPhysics: GlobalPhysicsAnalysis;
  },
  animationData: AnimationAnalysis[],
  statistics: any,
  sortedData: {
    sorted: AnimationAnalysis[];
    best: AnimationAnalysis | null;
    worst: AnimationAnalysis | null;
    medianScore: number;
  }
): SpineAnalysisResult {
  return {
    skeletonName: spineInstance.skeleton.data.name || 'Unnamed',
    totalAnimations: spineInstance.skeleton.data.animations.length,
    totalSkins: spineInstance.skeleton.data.skins.length,
    skeleton: skeletonData,
    animations: animationData,
    globalMesh: globalData.globalMesh,
    globalClipping: globalData.globalClipping,
    globalBlendMode: globalData.globalBlendMode,
    globalPhysics: globalData.globalPhysics,
    medianScore: sortedData.medianScore,
    bestAnimation: sortedData.best,
    worstAnimation: sortedData.worst,
    stats: statistics
  };
}