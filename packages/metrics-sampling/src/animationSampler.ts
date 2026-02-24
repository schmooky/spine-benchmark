import { 
  Animation,
  Spine,
  Physics
} from "@esotericsoftware/spine-pixi-v8";

/**
 * AnimationSampler - Utility class for sampling Spine animations
 * 
 * This class encapsulates animation sampling logic to improve reusability
 * and reduce complexity in animation analysis.
 */

export interface SamplingOptions {
  sampleRate?: number; // Frames per second to sample (default: 30)
  preserveState?: boolean; // Whether to preserve the original animation state (default: true)
}

export interface AnimationState {
  trackTime: number;
  animationName: string | null;
  loop: boolean;
}

/**
 * AnimationSampler class
 * Provides utilities for sampling Spine animations at different time points
 */
export class AnimationSampler {
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
    
    // Store current state if we need to preserve it
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
      // Clear and set the animation we want to analyze
      state.clearTrack(0);
      state.setAnimation(0, animation.name, false);
      
      // Sample the animation at multiple points
      const duration = animation.duration;
      const samples = Math.max(1, Math.ceil(duration * sampleRate));
      
      console.log(`Sampling animation "${animation.name}" - duration: ${duration}s, samples: ${samples + 1}`);
      
      for (let i = 0; i <= samples; i++) {
        const time = (i / samples) * duration;
        
        // Set track time and apply
        const track = state.getCurrent(0);
        if (track) {
          track.trackTime = time;
          track.animationLast = time;
          track.animationEnd = duration;
        }
        
        // Apply the animation state
        state.update(0);
        state.apply(skeleton);
        skeleton.updateWorldTransform(Physics.update);
        
        // Call the callback with the current time and skeleton state
        callback(time, skeleton);
      }
    } finally {
      // Restore original animation state if needed
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