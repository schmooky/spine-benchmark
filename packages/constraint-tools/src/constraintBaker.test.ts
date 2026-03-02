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
  meshes: Map<string, number[]>;
}

const SAMPLE_RATE = 60;
const WORLD_TOLERANCE = 5e-4;
const MESH_TOLERANCE = 1e-4;
const STRETCHYMAN_PRO_FIXTURE_PATH = fileURLToPath(
  new URL('./fixtures/stretchyman-pro.json', import.meta.url)
);
const STRETCHYMAN_PRO_JSON = readFileSync(STRETCHYMAN_PRO_FIXTURE_PATH, 'utf8');
const RAPTOR_PRO_FIXTURE_PATH = fileURLToPath(
  new URL('./fixtures/raptor-pro.json', import.meta.url)
);
const RAPTOR_PRO_JSON = readFileSync(RAPTOR_PRO_FIXTURE_PATH, 'utf8');
const SPINEBOY_PRO_FIXTURE_PATH = fileURLToPath(
  new URL('./fixtures/spineboy-pro.json', import.meta.url)
);
const SPINEBOY_PRO_JSON = readFileSync(SPINEBOY_PRO_FIXTURE_PATH, 'utf8');
const SACK_PRO_FIXTURE_PATH = fileURLToPath(
  new URL('./fixtures/sack-pro.json', import.meta.url)
);
const SACK_PRO_JSON = readFileSync(SACK_PRO_FIXTURE_PATH, 'utf8');
const VINE_PRO_FIXTURE_PATH = fileURLToPath(
  new URL('./fixtures/vine-pro.json', import.meta.url)
);
const VINE_PRO_JSON = readFileSync(VINE_PRO_FIXTURE_PATH, 'utf8');

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
    assertSampledWorldPositionsMatch(originalSpine, bakedSpine, SAMPLE_RATE, affectedBones);
  });

  it('bakes raptor-pro IK constraints and preserves per-frame bone world positions', () => {
    const rawJsonText = RAPTOR_PRO_JSON;
    const sourceSpine = createSpineLike(rawJsonText);
    const { bakedText, report } = bakeConstraints(sourceSpine as never, rawJsonText, {
      sampleRate: SAMPLE_RATE
    });

    expect(report.bakedAnimations).toBeGreaterThan(0);
    expect(report.totalKeyframesGenerated).toBeGreaterThan(0);
    expect(report.constraintsRemoved.ik).toBeGreaterThan(0);
    expect(report.constraintsRemoved.transform).toBe(0);
    expect(report.constraintsRemoved.path).toBe(0);
    expect(report.constraintsRemoved.physics).toBe(0);
    expect(report.affectedBones.length).toBeGreaterThan(0);
    const affectedBones = new Set(report.affectedBones);

    const bakedData = JSON.parse(bakedText) as Record<string, unknown>;
    expect(bakedData.ik).toBeUndefined();
    expect(bakedData.transform).toBeUndefined();
    expect(bakedData.path).toBeUndefined();
    expect(bakedData.physics).toBeUndefined();

    const originalSpine = createSpineLike(rawJsonText);
    const bakedSpine = createSpineLike(bakedText);
    assertSampledWorldPositionsMatch(originalSpine, bakedSpine, SAMPLE_RATE, affectedBones);
  });

  it('bakes spineboy-pro IK/transform constraints and preserves per-frame bone world positions', () => {
    const rawJsonText = SPINEBOY_PRO_JSON;
    const sourceSpine = createSpineLike(rawJsonText);
    const { bakedText, report } = bakeConstraints(sourceSpine as never, rawJsonText, {
      sampleRate: SAMPLE_RATE
    });

    expect(report.bakedAnimations).toBeGreaterThan(0);
    expect(report.totalKeyframesGenerated).toBeGreaterThan(0);
    expect(report.constraintsRemoved.ik).toBeGreaterThan(0);
    expect(report.constraintsRemoved.transform).toBeGreaterThan(0);
    expect(report.constraintsRemoved.path).toBe(0);
    expect(report.constraintsRemoved.physics).toBe(0);
    expect(report.affectedBones.length).toBeGreaterThan(0);
    const affectedBones = new Set(report.affectedBones);

    const bakedData = JSON.parse(bakedText) as Record<string, unknown>;
    expect(bakedData.ik).toBeUndefined();
    expect(bakedData.transform).toBeUndefined();
    expect(bakedData.path).toBeUndefined();
    expect(bakedData.physics).toBeUndefined();

    const originalSpine = createSpineLike(rawJsonText);
    const bakedSpine = createSpineLike(bakedText);
    assertSampledWorldPositionsMatch(originalSpine, bakedSpine, SAMPLE_RATE, affectedBones);
  });

  it('bakes sack-pro physics constraints and preserves per-frame mesh vertices 1:1', () => {
    const rawJsonText = SACK_PRO_JSON;
    const sourceSpine = createSpineLike(rawJsonText);
    const { bakedText, report } = bakeConstraints(sourceSpine as never, rawJsonText, {
      sampleRate: SAMPLE_RATE,
      preserveTransformConstraints: true,
      preservePhysicsConstraints: true
    });

    expect(report.bakedAnimations).toBe(0);
    expect(report.totalKeyframesGenerated).toBe(0);
    expect(report.constraintsRemoved.ik).toBe(0);
    expect(report.constraintsRemoved.transform).toBe(0);
    expect(report.constraintsRemoved.path).toBe(0);
    expect(report.constraintsRemoved.physics).toBe(0);
    expect(report.affectedBones).toHaveLength(0);
    expect(bakedText).toBe(rawJsonText);

    const bakedData = JSON.parse(bakedText) as Record<string, unknown>;
    expect(bakedData.ik).toBeUndefined();
    expect(bakedData.transform).toBeDefined();
    expect(bakedData.path).toBeUndefined();
    expect(bakedData.physics).toBeDefined();

    const originalSpine = createSpineLike(rawJsonText);
    const bakedSpine = createSpineLike(bakedText);
    assertSampledMeshVerticesMatch(originalSpine, bakedSpine, SAMPLE_RATE);
  });

  it('keeps vine-pro path-constraint animation unchanged (path-only no-op bake)', () => {
    const rawJsonText = VINE_PRO_JSON;
    const sourceSpine = createSpineLike(rawJsonText);
    const { bakedText, report } = bakeConstraints(sourceSpine as never, rawJsonText, {
      sampleRate: SAMPLE_RATE
    });

    expect(report.bakedAnimations).toBe(0);
    expect(report.totalKeyframesGenerated).toBe(0);
    expect(report.constraintsRemoved.ik).toBe(0);
    expect(report.constraintsRemoved.transform).toBe(0);
    expect(report.constraintsRemoved.path).toBe(0);
    expect(report.constraintsRemoved.physics).toBe(0);
    expect(report.affectedBones).toHaveLength(0);
    expect(bakedText).toBe(rawJsonText);

    const bakedData = JSON.parse(bakedText) as Record<string, unknown>;
    expect(bakedData.path).toBeDefined();

    const originalSpine = createSpineLike(rawJsonText);
    const bakedSpine = createSpineLike(bakedText);
    assertSampledWorldPositionsMatch(originalSpine, bakedSpine, SAMPLE_RATE);
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
      bones: collectBoneWorldTransforms(spine.skeleton.bones),
      meshes: collectMeshWorldVertices(spine.skeleton)
    });
  }

  return frames;
}

function assertSampledWorldPositionsMatch(
  originalSpine: SpineLike,
  bakedSpine: SpineLike,
  sampleRate: number,
  includeBones?: Set<string>
): void {
  const animationNames = originalSpine.skeleton.data.animations.map((animation) => animation.name);

  for (const animationName of animationNames) {
    const originalFrames = sampleAnimation(originalSpine, animationName, sampleRate);
    const bakedFrames = sampleAnimation(bakedSpine, animationName, sampleRate);

    expect(bakedFrames.length).toBe(originalFrames.length);

    for (let frameIndex = 0; frameIndex < originalFrames.length; frameIndex++) {
      const originalFrame = originalFrames[frameIndex]!;
      const bakedFrame = bakedFrames[frameIndex]!;

      expect(bakedFrame.time).toBeCloseTo(originalFrame.time, 6);
      expect(bakedFrame.bones.size).toBe(originalFrame.bones.size);

      for (const [boneName, expectedTransform] of originalFrame.bones) {
        if (includeBones && !includeBones.has(boneName)) continue;
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
}

function assertSampledMeshVerticesMatch(
  originalSpine: SpineLike,
  bakedSpine: SpineLike,
  sampleRate: number
): void {
  const animationNames = originalSpine.skeleton.data.animations.map((animation) => animation.name);
  let maxDiff = 0;
  let maxContext =
    'No mesh vertices sampled';

  for (const animationName of animationNames) {
    const originalFrames = sampleAnimation(originalSpine, animationName, sampleRate);
    const bakedFrames = sampleAnimation(bakedSpine, animationName, sampleRate);

    expect(bakedFrames.length).toBe(originalFrames.length);

    for (let frameIndex = 0; frameIndex < originalFrames.length; frameIndex++) {
      const originalFrame = originalFrames[frameIndex]!;
      const bakedFrame = bakedFrames[frameIndex]!;

      expect(bakedFrame.meshes.size).toBe(originalFrame.meshes.size);

      for (const [meshKey, expectedVertices] of originalFrame.meshes) {
        const actualVertices = bakedFrame.meshes.get(meshKey);
        expect(actualVertices).toBeDefined();
        if (!actualVertices) continue;
        expect(actualVertices.length).toBe(expectedVertices.length);

        for (let vertexIndex = 0; vertexIndex < expectedVertices.length; vertexIndex++) {
          const expectedValue = expectedVertices[vertexIndex]!;
          const actualValue = actualVertices[vertexIndex]!;
          const diff = Math.abs(actualValue - expectedValue);
          if (diff > maxDiff) {
            maxDiff = diff;
            maxContext = [
              'Mismatch in mesh world vertex',
              `animation=${animationName}`,
              `frame=${frameIndex}`,
              `time=${originalFrame.time.toFixed(6)}`,
              `mesh=${meshKey}`,
              `vertexIndex=${vertexIndex}`,
              `actual=${actualValue}`,
              `expected=${expectedValue}`,
              `diff=${diff}`,
              `tolerance=${MESH_TOLERANCE}`
            ].join(' | ');
          }
        }
      }
    }
  }

  expect(maxDiff, maxContext).toBeLessThanOrEqual(MESH_TOLERANCE);
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

function collectMeshWorldVertices(skeleton: Skeleton): Map<string, number[]> {
  const result = new Map<string, number[]>();

  for (const slot of skeleton.drawOrder) {
    const attachment = slot.getAttachment();
    if (!(attachment instanceof MeshAttachment)) continue;

    const vertices = new Array<number>(attachment.worldVerticesLength);
    attachment.computeWorldVertices(slot, 0, attachment.worldVerticesLength, vertices, 0, 2);
    result.set(`${slot.data.name}/${attachment.name}`, vertices);
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
