import { Animation, BlendMode, Physics, Spine } from "@esotericsoftware/spine-pixi-v8";
import type { ActiveComponents } from "@spine-benchmark/metrics-sampling";

export interface BlendModeMetrics {
  activeNonNormalCount: number;
  activeAdditiveCount: number;
  activeMultiplyCount: number;
  nonNormalBlendModeCount: number; // For compatibility
  additiveCount: number; // For compatibility
  multiplyCount: number; // For compatibility
}

export interface GlobalBlendModeAnalysis {
  blendModeCounts: Map<BlendMode, number>;
  slotsWithNonNormalBlendMode: Map<string, BlendMode>;
  metrics: BlendModeMetrics;
}

/**
 * Analyzes blend modes for a specific animation frame by frame
 * @param spineInstance The Spine instance to analyze
 * @param animation The animation to analyze
 * @param activeComponents Components active in this animation
 * @returns Metrics for blend mode analysis
 */
export function analyzeBlendModesForAnimation(
  spineInstance: Spine,
  animation: Animation,
  activeComponents: ActiveComponents
): BlendModeMetrics {
  const skeleton = spineInstance.skeleton;
  const animationState = spineInstance.state;
  
  // Store current animation state to restore later
  const currentTracks = [];
  for (let i = 0; i < animationState.tracks.length; i++) {
    const track = animationState.tracks[i];
    if (track) {
      currentTracks.push({
        index: i,
        animation: track.animation,
        time: track.trackTime,
        loop: track.loop
      });
    }
  }
  
  // Clear animation state and set our target animation
  animationState.clearTracks();
  animationState.setAnimation(0, animation.name, false);
  
  // Sample rate: check every 1/30th of a second (30 FPS)
  const sampleRate = 1 / 60;
  const duration = animation.duration;
  let maxNonNormalCount = 0;
  let maxAdditiveCount = 0;
  let maxMultiplyCount = 0;
  
  console.log(`Analyzing blend modes frame by frame for ${animation.name}, duration: ${duration}s`);
  
  // Step through the animation frame by frame
  for (let time = 0; time <= duration; time += sampleRate) {
    // Update animation to current time
    animationState.update(0);
    animationState.tracks[0]!.trackTime = time;
    animationState.apply(skeleton);
    skeleton.update(0);
    skeleton.updateWorldTransform(Physics.update);
    
    // Count visible blend modes at this frame
    let frameNonNormalCount = 0;
    let frameAdditiveCount = 0;
    let frameMultiplyCount = 0;
    
    activeComponents.slots.forEach(slotName => {
      const slot = skeleton.slots.find((s: any) => s.data.name === slotName);
      
      if (slot && slot.color.a > 0 && slot.attachment) { // Only count visible slots
        const blendMode = slot.data.blendMode;
        
        if (blendMode !== BlendMode.Normal) {
          frameNonNormalCount++;
          
          if (blendMode === BlendMode.Additive) {
            frameAdditiveCount++;
          } else if (blendMode === BlendMode.Multiply) {
            frameMultiplyCount++;
          }
        }
      }
    });
    
    // Update maximums
    maxNonNormalCount = Math.max(maxNonNormalCount, frameNonNormalCount);
    maxAdditiveCount = Math.max(maxAdditiveCount, frameAdditiveCount);
    maxMultiplyCount = Math.max(maxMultiplyCount, frameMultiplyCount);
  }
  
  console.log(`Max concurrent blend modes - Non-normal: ${maxNonNormalCount}, Additive: ${maxAdditiveCount}, Multiply: ${maxMultiplyCount}`);
  
  // Restore original animation state
  animationState.clearTracks();
  currentTracks.forEach(track => {
    const newTrack = animationState.setAnimation(track.index, track.animation!.name, track.loop);
    newTrack.trackTime = track.time;
  });
  animationState.apply(skeleton);
  
  return {
    activeNonNormalCount: maxNonNormalCount,
    nonNormalBlendModeCount: maxNonNormalCount, // For compatibility
    activeAdditiveCount: maxAdditiveCount,
    additiveCount: maxAdditiveCount, // For compatibility
    activeMultiplyCount: maxMultiplyCount,
    multiplyCount: maxMultiplyCount // For compatibility
  };
}

/**
 * Analyzes global blend modes across the entire skeleton
 * @param spineInstance The Spine instance to analyze
 * @returns Global blend mode analysis data
 */
export function analyzeGlobalBlendModes(spineInstance: Spine): GlobalBlendModeAnalysis {
  const blendModeCount = new Map<BlendMode, number>();
  const slotsWithNonNormalBlendMode = new Map<string, BlendMode>();
  
  // Initialize blend mode counts
  Object.values(BlendMode).forEach(mode => {
    if (typeof mode === 'number') {
      blendModeCount.set(mode as BlendMode, 0);
    }
  });
  
  // Count blend modes
  spineInstance.skeleton.slots.forEach(slot => {
    const blendMode = slot.data.blendMode;
    blendModeCount.set(blendMode, (blendModeCount.get(blendMode) || 0) + 1);
    
    if (blendMode !== BlendMode.Normal) {
      slotsWithNonNormalBlendMode.set(slot.data.name, blendMode);
    }
  });
  
  // Count specific blend mode types
  const additiveCount = Array.from(slotsWithNonNormalBlendMode.values())
    .filter(mode => mode === BlendMode.Additive).length;
  
  const multiplyCount = Array.from(slotsWithNonNormalBlendMode.values())
    .filter(mode => mode === BlendMode.Multiply).length;
  
  const metrics: BlendModeMetrics = {
    activeNonNormalCount: slotsWithNonNormalBlendMode.size,
    nonNormalBlendModeCount: slotsWithNonNormalBlendMode.size,
    activeAdditiveCount: additiveCount,
    additiveCount,
    activeMultiplyCount: multiplyCount,
    multiplyCount
  };
  
  return {
    blendModeCounts: blendModeCount,
    slotsWithNonNormalBlendMode,
    metrics
  };
}
