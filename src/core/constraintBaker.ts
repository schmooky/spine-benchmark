import { Spine, Physics } from '@esotericsoftware/spine-pixi-v8';
import { AnimationSampler } from './utils/animationSampler';

export interface ConstraintInfo {
  name: string;
  type: 'ik' | 'transform' | 'path' | 'physics';
  bones: string[];
  target: string;
  isActive: boolean;
}

export interface BakeReport {
  animationCount: number;
  bakedAnimations: number;
  totalKeyframesGenerated: number;
  constraintsRemoved: { ik: number; transform: number; path: number; physics: number };
  affectedBones: string[];
  sampleRate: number;
}

export function collectConstraints(spine: Spine): ConstraintInfo[] {
  const skeleton = spine.skeleton;
  const result: ConstraintInfo[] = [];

  for (const c of skeleton.ikConstraints) {
    result.push({
      name: c.data.name,
      type: 'ik',
      bones: c.bones.map(b => b.data.name),
      target: c.target.data.name,
      isActive: c.isActive(),
    });
  }

  for (const c of skeleton.transformConstraints) {
    result.push({
      name: c.data.name,
      type: 'transform',
      bones: c.bones.map(b => b.data.name),
      target: c.target.data.name,
      isActive: c.isActive(),
    });
  }

  for (const c of skeleton.pathConstraints) {
    result.push({
      name: c.data.name,
      type: 'path',
      bones: c.bones.map(b => b.data.name),
      target: c.target.data.name,
      isActive: c.isActive(),
    });
  }

  const physicsConstraints = skeleton.physicsConstraints || [];
  for (const c of physicsConstraints) {
    result.push({
      name: c.data.name,
      type: 'physics',
      bones: [c.bone.data.name],
      target: c.bone.data.name,
      isActive: c.isActive(),
    });
  }

  return result;
}

interface BoneFrameData {
  time: number;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  shearX: number;
  shearY: number;
}

interface BakeOptions {
  sampleRate?: number;
}

export function bakeConstraints(
  spine: Spine,
  rawJsonText: string,
  options?: BakeOptions
): { bakedText: string; report: BakeReport } {
  const sampleRate = options?.sampleRate ?? 30;
  const data = JSON.parse(rawJsonText);
  const skeleton = spine.skeleton;

  // Collect all bones affected by any constraint
  const affectedBoneSet = new Set<string>();

  for (const c of skeleton.ikConstraints) {
    for (const b of c.bones) affectedBoneSet.add(b.data.name);
  }
  for (const c of skeleton.transformConstraints) {
    for (const b of c.bones) affectedBoneSet.add(b.data.name);
  }
  for (const c of skeleton.pathConstraints) {
    for (const b of c.bones) affectedBoneSet.add(b.data.name);
  }
  const physicsConstraints = skeleton.physicsConstraints || [];
  for (const c of physicsConstraints) {
    affectedBoneSet.add(c.bone.data.name);
  }

  const affectedBones = Array.from(affectedBoneSet);
  if (affectedBones.length === 0) {
    // Nothing to bake
    return {
      bakedText: rawJsonText,
      report: {
        animationCount: skeleton.data.animations.length,
        bakedAnimations: 0,
        totalKeyframesGenerated: 0,
        constraintsRemoved: { ik: 0, transform: 0, path: 0, physics: 0 },
        affectedBones: [],
        sampleRate,
      },
    };
  }

  // Build a map from bone name to bone data (setup pose) for delta computation
  const boneDataMap = new Map<string, { x: number; y: number; rotation: number; scaleX: number; scaleY: number; shearX: number; shearY: number }>();
  for (const boneName of affectedBones) {
    const bone = skeleton.findBone(boneName);
    if (bone) {
      boneDataMap.set(boneName, {
        x: bone.data.x,
        y: bone.data.y,
        rotation: bone.data.rotation,
        scaleX: bone.data.scaleX,
        scaleY: bone.data.scaleY,
        shearX: bone.data.shearX,
        shearY: bone.data.shearY,
      });
    }
  }

  // Ensure animations object exists
  if (!data.animations) {
    data.animations = {};
  }

  let bakedAnimations = 0;
  let totalKeyframesGenerated = 0;

  // For each animation, sample and capture bone transforms
  const animations = skeleton.data.animations;
  for (const animation of animations) {
    const animName = animation.name;
    const frames = new Map<string, BoneFrameData[]>();

    // Initialize frame arrays for each affected bone
    for (const boneName of affectedBones) {
      frames.set(boneName, []);
    }

    // Sample the animation using AnimationSampler
    AnimationSampler.sampleAnimation(spine, animation, (time) => {
      for (const boneName of affectedBones) {
        const bone = skeleton.findBone(boneName);
        if (!bone) continue;

        const boneFrames = frames.get(boneName)!;
        boneFrames.push({
          time,
          x: bone.x,
          y: bone.y,
          rotation: bone.rotation,
          scaleX: bone.scaleX,
          scaleY: bone.scaleY,
          shearX: bone.shearX,
          shearY: bone.shearY,
        });
      }
    }, { sampleRate, preserveState: true });

    // Ensure animation entry exists in JSON
    if (!data.animations[animName]) {
      data.animations[animName] = {};
    }
    if (!data.animations[animName].bones) {
      data.animations[animName].bones = {};
    }

    const animBones = data.animations[animName].bones;
    let animHasKeyframes = false;

    // Write captured frames as bone timelines
    for (const boneName of affectedBones) {
      const boneFrames = frames.get(boneName)!;
      if (boneFrames.length === 0) continue;

      const setupPose = boneDataMap.get(boneName);
      if (!setupPose) continue;

      if (!animBones[boneName]) {
        animBones[boneName] = {};
      }

      // Build rotate timeline
      const rotateTimeline: Array<{ time: number; value: number }> = [];
      for (const frame of boneFrames) {
        const value = frame.rotation - setupPose.rotation;
        rotateTimeline.push({
          time: round(frame.time),
          value: round(value),
        });
      }

      // Build translate timeline
      const translateTimeline: Array<{ time: number; x: number; y: number }> = [];
      for (const frame of boneFrames) {
        const dx = frame.x - setupPose.x;
        const dy = frame.y - setupPose.y;
        translateTimeline.push({
          time: round(frame.time),
          x: round(dx),
          y: round(dy),
        });
      }

      // Build scale timeline (absolute values, Spine 4.x format)
      const scaleTimeline: Array<{ time: number; x: number; y: number }> = [];
      for (const frame of boneFrames) {
        scaleTimeline.push({
          time: round(frame.time),
          x: round(frame.scaleX),
          y: round(frame.scaleY),
        });
      }

      // Build shear timeline
      const shearTimeline: Array<{ time: number; x: number; y: number }> = [];
      for (const frame of boneFrames) {
        shearTimeline.push({
          time: round(frame.time),
          x: round(frame.shearX),
          y: round(frame.shearY),
        });
      }

      // Write timelines, replacing any existing ones for this bone
      animBones[boneName].rotate = rotateTimeline;
      animBones[boneName].translate = translateTimeline;
      animBones[boneName].scale = scaleTimeline;
      animBones[boneName].shear = shearTimeline;

      totalKeyframesGenerated += rotateTimeline.length + translateTimeline.length +
        scaleTimeline.length + shearTimeline.length;
      animHasKeyframes = true;
    }

    if (animHasKeyframes) {
      bakedAnimations++;
    }
  }

  // Count constraints before removal
  const constraintsRemoved = {
    ik: countArray(data.ik),
    transform: countArray(data.transform),
    path: countArray(data.path),
    physics: countArray(data.physics),
  };

  // Remove constraint definitions from JSON root
  delete data.ik;
  delete data.transform;
  delete data.path;
  delete data.physics;

  // Remove constraint timelines from all animations
  for (const animName of Object.keys(data.animations || {})) {
    const anim = data.animations[animName];
    if (!anim || typeof anim !== 'object') continue;
    delete anim.ik;
    delete anim.transform;
    delete anim.path;
    delete anim.physics;
  }

  return {
    bakedText: JSON.stringify(data),
    report: {
      animationCount: animations.length,
      bakedAnimations,
      totalKeyframesGenerated,
      constraintsRemoved,
      affectedBones,
      sampleRate,
    },
  };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function countArray(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  return 0;
}
