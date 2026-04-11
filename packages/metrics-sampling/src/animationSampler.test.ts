/**
 * Unit tests for AnimationSampler - the loop that walks an animation
 * timeline at a fixed sampleRate and invokes a callback on each frame.
 *
 * Uses duck-typed mocks for the Spine instance so the test runs in a
 * plain Node environment without needing a PixiJS app. The mocks only
 * implement the methods AnimationSampler actually calls.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimationSampler } from './animationSampler.js';
import type { Animation, Spine } from '@esotericsoftware/spine-pixi-v8';

// ────────────────────────────────────────────────────────────────
// Mock builders
// ────────────────────────────────────────────────────────────────

interface MockTrack {
  trackTime: number;
  animationLast: number;
  animationEnd: number;
  loop: boolean;
  animation: { name: string } | null;
}

function makeMockSpine(opts: {
  initialTrack?: MockTrack | null;
} = {}): { spine: Spine; calls: { update: number; apply: number; updateWorldTransform: number; clearTrack: number; setAnimation: Array<{ trackIndex: number; name: string; loop: boolean }>; setToSetupPose: number } } {
  const calls = {
    update: 0,
    apply: 0,
    updateWorldTransform: 0,
    clearTrack: 0,
    setAnimation: [] as Array<{ trackIndex: number; name: string; loop: boolean }>,
    setToSetupPose: 0,
  };

  let track: MockTrack | null = opts.initialTrack ?? null;

  const state = {
    getCurrent: (_trackIndex: number) => track,
    clearTrack: (_trackIndex: number) => {
      calls.clearTrack++;
      track = null;
    },
    setAnimation: (trackIndex: number, name: string, loop: boolean) => {
      calls.setAnimation.push({ trackIndex, name, loop });
      track = {
        trackTime: 0,
        animationLast: 0,
        animationEnd: 0,
        loop,
        animation: { name },
      };
      return track;
    },
    update: (_dt: number) => {
      calls.update++;
    },
    apply: (_skeleton: unknown) => {
      calls.apply++;
    },
  };

  const skeleton = {
    updateWorldTransform: (_physics: unknown) => {
      calls.updateWorldTransform++;
    },
    setToSetupPose: () => {
      calls.setToSetupPose++;
    },
  };

  return {
    spine: { skeleton, state } as unknown as Spine,
    calls,
  };
}

function makeAnimation(name: string, duration: number): Animation {
  return { name, duration } as unknown as Animation;
}

// ────────────────────────────────────────────────────────────────
// sampleAnimation
// ────────────────────────────────────────────────────────────────

describe('AnimationSampler.sampleAnimation', () => {
  beforeEach(() => {
    // Silence the console.log inside the sampler during tests. The
    // sampler logs a "sampling X - duration: Y, samples: Z" line per
    // invocation which we don't want in the Vitest output.
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('invokes the callback exactly ceil(duration * sampleRate) + 1 times', () => {
    const { spine } = makeMockSpine();
    const animation = makeAnimation('idle', 2); // 2-second animation
    const callback = vi.fn();

    AnimationSampler.sampleAnimation(spine, animation, callback, { sampleRate: 30 });

    // ceil(2 * 30) = 60 samples, loop runs from 0..=60 -> 61 callbacks
    expect(callback).toHaveBeenCalledTimes(61);
  });

  it('calls the callback at evenly spaced time points across the duration', () => {
    const { spine } = makeMockSpine();
    const animation = makeAnimation('walk', 1); // 1-second animation
    const times: number[] = [];

    AnimationSampler.sampleAnimation(
      spine,
      animation,
      t => times.push(t),
      { sampleRate: 10 },
    );

    // Expect 11 samples from t=0 to t=1 at 0.1 intervals.
    expect(times.length).toBe(11);
    expect(times[0]).toBe(0);
    expect(times[times.length - 1]).toBeCloseTo(1, 5);
    // Spacing is uniform (within float tolerance).
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeCloseTo(0.1, 5);
    }
  });

  it('respects a custom sampleRate - lower rate produces fewer samples', () => {
    const { spine } = makeMockSpine();
    const animation = makeAnimation('long', 4);

    const dense = vi.fn();
    const sparse = vi.fn();
    AnimationSampler.sampleAnimation(spine, animation, dense, { sampleRate: 60 });
    AnimationSampler.sampleAnimation(spine, animation, sparse, { sampleRate: 15 });

    expect(dense.mock.calls.length).toBeGreaterThan(sparse.mock.calls.length);
    // ceil(4 * 60) + 1 = 241; ceil(4 * 15) + 1 = 61
    expect(dense.mock.calls.length).toBe(241);
    expect(sparse.mock.calls.length).toBe(61);
  });

  it('defaults sampleRate to 30 fps', () => {
    const { spine } = makeMockSpine();
    const animation = makeAnimation('default', 1);
    const callback = vi.fn();

    AnimationSampler.sampleAnimation(spine, animation, callback);
    // ceil(1 * 30) + 1 = 31
    expect(callback).toHaveBeenCalledTimes(31);
  });

  it('guarantees at least one sample even for a zero-duration animation', () => {
    const { spine } = makeMockSpine();
    const animation = makeAnimation('empty', 0);
    const callback = vi.fn();

    AnimationSampler.sampleAnimation(spine, animation, callback);
    // Math.max(1, ceil(0)) = 1 sample, loop 0..=1 -> 2 callbacks
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback.mock.calls[0][0]).toBe(0);
  });

  it('applies skeleton updates each sample iteration', () => {
    const { spine, calls } = makeMockSpine();
    const animation = makeAnimation('idle', 1);

    AnimationSampler.sampleAnimation(spine, animation, () => {}, { sampleRate: 10 });

    // 11 samples -> update/apply/updateWorldTransform once per sample.
    // The sampler also restores to setup pose in the finally block,
    // calling updateWorldTransform one more time.
    expect(calls.update).toBe(11);
    expect(calls.apply).toBe(11);
    expect(calls.updateWorldTransform).toBeGreaterThanOrEqual(11);
  });
});

// ────────────────────────────────────────────────────────────────
// State preservation
// ────────────────────────────────────────────────────────────────

describe('AnimationSampler state preservation', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('resets to setup pose and restores the previously playing animation when preserveState is true', () => {
    // Simulate a spine instance that was mid-playback on a track.
    const initialTrack: MockTrack = {
      trackTime: 1.5,
      animationLast: 1.5,
      animationEnd: 3,
      loop: true,
      animation: { name: 'walk' },
    };
    const { spine, calls } = makeMockSpine({ initialTrack });
    const animation = makeAnimation('analysis-target', 1);

    AnimationSampler.sampleAnimation(spine, animation, () => {}, { sampleRate: 10 });

    // First setAnimation: the sampler sets its target. Second: the
    // finally block restores the original "walk" animation.
    const names = calls.setAnimation.map(c => c.name);
    expect(names).toContain('analysis-target');
    expect(names).toContain('walk');
    // Setup pose reset happens once in the finally block.
    expect(calls.setToSetupPose).toBeGreaterThanOrEqual(1);
  });

  it('does not attempt to restore when preserveState is false', () => {
    const initialTrack: MockTrack = {
      trackTime: 1.5,
      animationLast: 1.5,
      animationEnd: 3,
      loop: true,
      animation: { name: 'walk' },
    };
    const { spine, calls } = makeMockSpine({ initialTrack });
    const animation = makeAnimation('idle', 1);

    AnimationSampler.sampleAnimation(
      spine,
      animation,
      () => {},
      { sampleRate: 10, preserveState: false },
    );

    // Only the initial target animation is set. The original walk
    // animation is NOT restored because preserveState is off.
    const restoreCalls = calls.setAnimation.filter(c => c.name === 'walk');
    expect(restoreCalls.length).toBe(0);
    // Setup pose is also not reset in the finally block.
    expect(calls.setToSetupPose).toBe(0);
  });

  it('restores to nothing when there was no previous animation to restore', () => {
    const { spine, calls } = makeMockSpine({ initialTrack: null });
    const animation = makeAnimation('first', 1);

    AnimationSampler.sampleAnimation(spine, animation, () => {}, { sampleRate: 10 });

    // Only one setAnimation call for the target; no restoration.
    expect(calls.setAnimation.map(c => c.name)).toEqual(['first']);
    // But setup pose is still reset in the finally block.
    expect(calls.setToSetupPose).toBe(1);
  });

  it('still restores state when the callback throws', () => {
    const initialTrack: MockTrack = {
      trackTime: 0.5,
      animationLast: 0.5,
      animationEnd: 2,
      loop: false,
      animation: { name: 'idle' },
    };
    const { spine, calls } = makeMockSpine({ initialTrack });
    const animation = makeAnimation('broken', 1);

    expect(() =>
      AnimationSampler.sampleAnimation(spine, animation, () => {
        throw new Error('analyzer blew up mid-frame');
      }),
    ).toThrow('analyzer blew up mid-frame');

    // The finally block should still have restored the original state.
    expect(calls.setToSetupPose).toBe(1);
    expect(calls.setAnimation.map(c => c.name)).toContain('idle');
  });
});

// ────────────────────────────────────────────────────────────────
// getCurrentState / restoreState
// ────────────────────────────────────────────────────────────────

describe('AnimationSampler.getCurrentState', () => {
  it('extracts track time, name, and loop from a live track', () => {
    const track: MockTrack = {
      trackTime: 2.5,
      animationLast: 2.5,
      animationEnd: 4,
      loop: true,
      animation: { name: 'run' },
    };
    const { spine } = makeMockSpine({ initialTrack: track });

    const state = AnimationSampler.getCurrentState(spine);
    expect(state).toEqual({ trackTime: 2.5, animationName: 'run', loop: true });
  });

  it('returns zero/null defaults when no track is active', () => {
    const { spine } = makeMockSpine({ initialTrack: null });
    const state = AnimationSampler.getCurrentState(spine);
    expect(state).toEqual({ trackTime: 0, animationName: null, loop: false });
  });

  it('returns null animationName when the track exists but has no animation', () => {
    const track = {
      trackTime: 1,
      animationLast: 1,
      animationEnd: 2,
      loop: false,
      animation: null,
    };
    const { spine } = makeMockSpine({ initialTrack: track as unknown as MockTrack });
    const state = AnimationSampler.getCurrentState(spine);
    expect(state.animationName).toBeNull();
  });
});

describe('AnimationSampler.restoreState', () => {
  it('applies a saved state to a fresh spine instance', () => {
    const { spine, calls } = makeMockSpine({ initialTrack: null });

    AnimationSampler.restoreState(spine, {
      trackTime: 1.23,
      animationName: 'jump',
      loop: true,
    });

    expect(calls.setAnimation).toEqual([
      { trackIndex: 0, name: 'jump', loop: true },
    ]);
    expect(calls.apply).toBeGreaterThanOrEqual(1);
  });

  it('does nothing when state.animationName is null', () => {
    const { spine, calls } = makeMockSpine({ initialTrack: null });
    AnimationSampler.restoreState(spine, {
      trackTime: 0,
      animationName: null,
      loop: false,
    });
    // Only clearTrack is called; no setAnimation, no apply.
    expect(calls.clearTrack).toBe(1);
    expect(calls.setAnimation.length).toBe(0);
    expect(calls.apply).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────
// sampleAllAnimations
// ────────────────────────────────────────────────────────────────

describe('AnimationSampler.sampleAllAnimations', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('iterates every animation on the skeleton data and invokes the callback', () => {
    const animations = [
      makeAnimation('idle', 1),
      makeAnimation('walk', 2),
      makeAnimation('run', 0.5),
    ];

    // Build a spine that exposes data.animations.
    const base = makeMockSpine();
    const spineWithData = base.spine as unknown as {
      skeleton: { data: { animations: Animation[] } } & Record<string, unknown>;
      state: unknown;
    };
    spineWithData.skeleton.data = { animations };

    const seen: string[] = [];
    AnimationSampler.sampleAllAnimations(
      base.spine,
      animation => seen.push(animation.name),
      { sampleRate: 10 },
    );

    // The callback fires once per sample, per animation. We only
    // care that each animation was visited at least once.
    expect(new Set(seen)).toEqual(new Set(['idle', 'walk', 'run']));
  });

  it('is a no-op when skeleton.data.animations is empty', () => {
    const base = makeMockSpine();
    const spineWithData = base.spine as unknown as {
      skeleton: { data: { animations: Animation[] } } & Record<string, unknown>;
    };
    spineWithData.skeleton.data = { animations: [] };

    const callback = vi.fn();
    AnimationSampler.sampleAllAnimations(base.spine, callback);
    expect(callback).not.toHaveBeenCalled();
  });
});
