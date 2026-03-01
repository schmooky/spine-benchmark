import {
  AnimationState,
  AnimationStateData,
  BoundingBoxAttachment,
  ClippingAttachment,
  MeshAttachment,
  PathAttachment,
  Physics,
  PointAttachment,
  RegionAttachment,
  Skeleton,
  SkeletonJson,
  type AttachmentLoader,
  type Bone
} from '@esotericsoftware/spine-core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bakeConstraints } from './constraintBaker';

interface SpineLike {
  skeleton: Skeleton;
  state: AnimationState;
}

interface BoneWorldTransform {
  worldX: number;
  worldY: number;
}

interface FrameSample {
  time: number;
  bones: Map<string, BoneWorldTransform>;
}

const SAMPLE_RATE = 60;
const WORLD_TOLERANCE = 5e-4;
const STRETCHYMAN_PRO_FIXTURE_PATH = fileURLToPath(
  new URL('./fixtures/stretchyman-pro.json', import.meta.url)
);
const STRETCHYMAN_PRO_JSON = readFileSync(STRETCHYMAN_PRO_FIXTURE_PATH, 'utf8');

const TEST_ATTACHMENT_LOADER: AttachmentLoader = {
  newRegionAttachment(_skin, name, path) {
    return new RegionAttachment(name, path);
  },
  newMeshAttachment(_skin, name, path) {
    return new MeshAttachment(name, path);
  },
  newBoundingBoxAttachment(_skin, name) {
    return new BoundingBoxAttachment(name);
  },
  newPathAttachment(_skin, name) {
    return new PathAttachment(name);
  },
  newPointAttachment(_skin, name) {
    return new PointAttachment(name);
  },
  newClippingAttachment(_skin, name) {
    return new ClippingAttachment(name);
  }
};

describe('constraint-baker', () => {
  it('bakes stretchyman-pro constraints and preserves per-frame bone world positions', () => {
    const rawJsonText = STRETCHYMAN_PRO_JSON;
    const sourceSpine = createSpineLike(rawJsonText);
    const { bakedText, report } = bakeConstraints(sourceSpine as never, rawJsonText, {
      sampleRate: SAMPLE_RATE
    });

    expect(report.bakedAnimations).toBeGreaterThan(0);
    expect(report.totalKeyframesGenerated).toBeGreaterThan(0);
    expect(report.constraintsRemoved.ik).toBeGreaterThan(0);
    expect(report.constraintsRemoved.transform).toBeGreaterThan(0);
    expect(report.constraintsRemoved.path).toBe(0);
    expect(report.affectedBones.length).toBeGreaterThan(0);
    const affectedBones = new Set(report.affectedBones);

    const bakedData = JSON.parse(bakedText) as Record<string, unknown>;
    expect(bakedData.ik).toBeUndefined();
    expect(bakedData.transform).toBeUndefined();
    expect(bakedData.path).toBeDefined();

    const originalSpine = createSpineLike(rawJsonText);
    const bakedSpine = createSpineLike(bakedText);
    const animationNames = originalSpine.skeleton.data.animations.map((animation) => animation.name);

    for (const animationName of animationNames) {
      const originalFrames = sampleAnimation(originalSpine, animationName, SAMPLE_RATE);
      const bakedFrames = sampleAnimation(bakedSpine, animationName, SAMPLE_RATE);

      expect(bakedFrames.length).toBe(originalFrames.length);

      for (let frameIndex = 0; frameIndex < originalFrames.length; frameIndex++) {
        const originalFrame = originalFrames[frameIndex]!;
        const bakedFrame = bakedFrames[frameIndex]!;

        expect(bakedFrame.time).toBeCloseTo(originalFrame.time, 6);
        expect(bakedFrame.bones.size).toBe(originalFrame.bones.size);

        for (const [boneName, expectedTransform] of originalFrame.bones) {
          if (!affectedBones.has(boneName)) continue;
          const actualTransform = bakedFrame.bones.get(boneName);
          expect(actualTransform).toBeDefined();
          if (!actualTransform) continue;
          assertBoneTransformEqual(actualTransform, expectedTransform, {
            animationName,
            frameIndex,
            time: originalFrame.time,
            boneName
          });
        }
      }
    }
  });
});

function createSpineLike(rawJsonText: string): SpineLike {
  const parser = new SkeletonJson(TEST_ATTACHMENT_LOADER);
  const skeletonData = parser.readSkeletonData(rawJsonText);
  const skeleton = new Skeleton(skeletonData);
  const state = new AnimationState(new AnimationStateData(skeletonData));
  skeleton.setToSetupPose();
  skeleton.updateWorldTransform(Physics.update);
  return { skeleton, state };
}

function sampleAnimation(spine: SpineLike, animationName: string, sampleRate: number): FrameSample[] {
  const animation = spine.skeleton.data.findAnimation(animationName);
  if (!animation) {
    throw new Error(`Animation not found: ${animationName}`);
  }

  const samples = Math.max(1, Math.ceil(animation.duration * sampleRate));
  const frames: FrameSample[] = [];

  spine.skeleton.setToSetupPose();
  spine.skeleton.updateWorldTransform(Physics.update);
  spine.state.clearTrack(0);
  spine.state.setAnimation(0, animationName, false);

  for (let i = 0; i <= samples; i++) {
    const time = (i / samples) * animation.duration;
    const track = spine.state.getCurrent(0);
    if (track) {
      track.trackTime = time;
      track.animationLast = time;
      track.animationEnd = animation.duration;
    }

    spine.state.update(0);
    spine.state.apply(spine.skeleton);
    spine.skeleton.updateWorldTransform(Physics.update);

    frames.push({
      time,
      bones: collectBoneWorldTransforms(spine.skeleton.bones)
    });
  }

  return frames;
}

function collectBoneWorldTransforms(bones: Bone[]): Map<string, BoneWorldTransform> {
  const result = new Map<string, BoneWorldTransform>();
  for (const bone of bones) {
    result.set(bone.data.name, {
      worldX: bone.worldX,
      worldY: bone.worldY
    });
  }
  return result;
}

function assertBoneTransformEqual(
  actual: BoneWorldTransform,
  expected: BoneWorldTransform,
  context: { animationName: string; frameIndex: number; time: number; boneName: string }
): void {
  assertClose(actual.worldX, expected.worldX, 'worldX', context);
  assertClose(actual.worldY, expected.worldY, 'worldY', context);
}

function assertClose(
  actual: number,
  expected: number,
  metric: keyof BoneWorldTransform,
  context: { animationName: string; frameIndex: number; time: number; boneName: string }
): void {
  const diff = Math.abs(actual - expected);
  expect(
    diff,
    [
      `Mismatch in ${metric}`,
      `animation=${context.animationName}`,
      `frame=${context.frameIndex}`,
      `time=${context.time.toFixed(6)}`,
      `bone=${context.boneName}`,
      `actual=${actual}`,
      `expected=${expected}`,
      `diff=${diff}`,
      `tolerance=${WORLD_TOLERANCE}`
    ].join(' | ')
  ).toBeLessThanOrEqual(WORLD_TOLERANCE);
}
