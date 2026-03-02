import { Spine, Physics } from '@esotericsoftware/spine-pixi-v8';
import { AnimationSampler } from '@spine-benchmark/metrics-sampling';

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

interface BonePose {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  shearX: number;
  shearY: number;
}

interface BoneLike {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  shearX: number;
  shearY: number;
  ax: number;
  ay: number;
  arotation: number;
  ascaleX: number;
  ascaleY: number;
  ashearX: number;
  ashearY: number;
  a: number;
  b: number;
  c: number;
  d: number;
  worldX: number;
  worldY: number;
  inherit: number;
  data: { name: string };
  parent: BoneLike | null;
  skeleton: { x: number; y: number; scaleX: number; scaleY: number };
  updateWorldTransformWith: (
    x: number,
    y: number,
    rotation: number,
    scaleX: number,
    scaleY: number,
    shearX: number,
    shearY: number
  ) => void;
  updateAppliedTransform: () => void;
}

interface BakeOptions {
  sampleRate?: number;
  preserveTransformConstraints?: boolean;
  preservePhysicsConstraints?: boolean;
}

export function bakeConstraints(
  spine: Spine,
  rawJsonText: string,
  options?: BakeOptions
): { bakedText: string; report: BakeReport } {
  const sampleRate = options?.sampleRate ?? 30;
  const preserveTransformConstraints = options?.preserveTransformConstraints ?? false;
  const preservePhysicsConstraints = options?.preservePhysicsConstraints ?? false;
  const data = JSON.parse(rawJsonText);
  const skeleton = spine.skeleton;

  // Collect all bones affected by any constraint
  const affectedBoneSet = new Set<string>();

  for (const c of skeleton.ikConstraints) {
    for (const b of c.bones) affectedBoneSet.add(b.data.name);
  }
  if (!preserveTransformConstraints) {
    for (const c of skeleton.transformConstraints) {
      for (const b of c.bones) affectedBoneSet.add(b.data.name);
    }
  }
  const physicsConstraints = skeleton.physicsConstraints || [];
  if (!preservePhysicsConstraints) {
    for (const c of physicsConstraints) {
      affectedBoneSet.add(c.bone.data.name);
    }
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
  const affectedBoneIndexSet = new Set<number>();
  for (let i = 0; i < skeleton.bones.length; i++) {
    const bone = skeleton.bones[i];
    if (bone && affectedBoneSet.has(bone.data.name)) {
      affectedBoneIndexSet.add(i);
    }
  }
  const SkeletonCtor = skeleton.constructor as new (data: typeof skeleton.data) => typeof skeleton;
  const solverSkeleton = new SkeletonCtor(skeleton.data);
  solverSkeleton.x = skeleton.x;
  solverSkeleton.y = skeleton.y;
  solverSkeleton.scaleX = skeleton.scaleX;
  if ('_scaleY' in solverSkeleton && '_scaleY' in skeleton) {
    (solverSkeleton as unknown as { _scaleY: number })._scaleY =
      (skeleton as unknown as { _scaleY: number })._scaleY;
  } else {
    const yDown = Boolean((skeleton.constructor as { yDown?: boolean }).yDown);
    solverSkeleton.scaleY = yDown ? -skeleton.scaleY : skeleton.scaleY;
  }

  // For each animation, sample and capture bone transforms
  const animations = skeleton.data.animations;
  for (const animation of animations) {
    const animName = animation.name;
    const frames = new Map<string, BoneFrameData[]>();

    // Reset to a clean setup pose so sampling this animation isn't contaminated
    // by the previous animation pass.
    skeleton.setToSetupPose();
    skeleton.updateWorldTransform(Physics.update);

    // Initialize frame arrays for each affected bone
    for (const boneName of affectedBones) {
      frames.set(boneName, []);
    }

    // Sample the animation using AnimationSampler
    AnimationSampler.sampleAnimation(spine, animation, (time) => {
      const sourceBones = skeleton.bones;
      const solverBones = solverSkeleton.bones;

      for (let boneIndex = 0; boneIndex < sourceBones.length; boneIndex++) {
        const sourceBone = sourceBones[boneIndex];
        const solverBone = solverBones[boneIndex];
        if (!sourceBone || !solverBone) continue;

        solverBone.inherit = sourceBone.inherit;
        const localPose = poseFromLocal(sourceBone);

        if (!affectedBoneIndexSet.has(boneIndex)) {
          applyPoseToBone(solverBone, localPose);
          continue;
        }

        const appliedPose = poseFromApplied(sourceBone);
        const solvedTranslation = solveLocalTranslationForWorld(
          solverBone,
          sourceBone.worldX,
          sourceBone.worldY,
          localPose.x,
          localPose.y
        );
        const worldXYLocalPose: BonePose = {
          ...localPose,
          x: solvedTranslation.x,
          y: solvedTranslation.y
        };
        const worldXYAppliedPose: BonePose = {
          ...appliedPose,
          x: solvedTranslation.x,
          y: solvedTranslation.y
        };
        const derivedPose = derivePoseFromTargetWorld(
          sourceBone,
          solverBone,
          solvedTranslation,
          localPose.rotation
        );
        const chosenPose = chooseBestPoseForWorldMatch(sourceBone, solverBone, [
          localPose,
          appliedPose,
          worldXYLocalPose,
          worldXYAppliedPose,
          derivedPose
        ]);

        const boneFrames = frames.get(sourceBone.data.name);
        if (!boneFrames) continue;
        boneFrames.push({
          time,
          ...chosenPose
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
          time: frame.time,
          value,
        });
      }

      // Build translate timeline
      const translateTimeline: Array<{ time: number; x: number; y: number }> = [];
      for (const frame of boneFrames) {
        const dx = frame.x - setupPose.x;
        const dy = frame.y - setupPose.y;
        translateTimeline.push({
          time: frame.time,
          x: dx,
          y: dy,
        });
      }

      // Build scale timeline (absolute values, Spine 4.x format)
      const scaleTimeline: Array<{ time: number; x: number; y: number }> = [];
      for (const frame of boneFrames) {
        const sx = setupPose.scaleX !== 0 ? frame.scaleX / setupPose.scaleX : frame.scaleX;
        const sy = setupPose.scaleY !== 0 ? frame.scaleY / setupPose.scaleY : frame.scaleY;
        scaleTimeline.push({
          time: frame.time,
          x: sx,
          y: sy,
        });
      }

      // Build shear timeline
      const shearTimeline: Array<{ time: number; x: number; y: number }> = [];
      for (const frame of boneFrames) {
        const sx = frame.shearX - setupPose.shearX;
        const sy = frame.shearY - setupPose.shearY;
        shearTimeline.push({
          time: frame.time,
          x: sx,
          y: sy,
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
    transform: preserveTransformConstraints ? 0 : countArray(data.transform),
    // Path constraints are currently preserved to keep world-space motion exact.
    path: 0,
    physics: preservePhysicsConstraints ? 0 : countArray(data.physics),
  };

  // Remove constraint definitions from JSON root
  delete data.ik;
  if (!preserveTransformConstraints) {
    delete data.transform;
  }
  if (!preservePhysicsConstraints) {
    delete data.physics;
  }

  // Remove constraint timelines from all animations
  for (const animName of Object.keys(data.animations || {})) {
    const anim = data.animations[animName];
    if (!anim || typeof anim !== 'object') continue;
    delete anim.ik;
    if (!preserveTransformConstraints) {
      delete anim.transform;
    }
    if (!preservePhysicsConstraints) {
      delete anim.physics;
    }
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

function countArray(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  return 0;
}

function poseFromLocal(bone: BoneLike): BonePose {
  return {
    x: bone.x,
    y: bone.y,
    rotation: bone.rotation,
    scaleX: bone.scaleX,
    scaleY: bone.scaleY,
    shearX: bone.shearX,
    shearY: bone.shearY
  };
}

function poseFromApplied(bone: BoneLike): BonePose {
  return {
    x: bone.ax,
    y: bone.ay,
    rotation: bone.arotation,
    scaleX: bone.ascaleX,
    scaleY: bone.ascaleY,
    shearX: bone.ashearX,
    shearY: bone.ashearY
  };
}

function applyPoseToBone(bone: BoneLike, pose: BonePose): void {
  bone.updateWorldTransformWith(
    pose.x,
    pose.y,
    pose.rotation,
    pose.scaleX,
    pose.scaleY,
    pose.shearX,
    pose.shearY
  );
}

function chooseBestPoseForWorldMatch(sourceBone: BoneLike, solverBone: BoneLike, poses: BonePose[]): BonePose {
  let bestPose = poses[0]!;
  let bestError = Number.POSITIVE_INFINITY;
  for (const pose of poses) {
    applyPoseToBone(solverBone, pose);
    const error = boneWorldMatrixError(sourceBone, solverBone);
    if (error < bestError) {
      bestError = error;
      bestPose = pose;
    }
  }

  applyPoseToBone(solverBone, bestPose);
  return bestPose;
}

function boneWorldMatrixError(sourceBone: BoneLike, solverBone: BoneLike): number {
  return Math.max(
    Math.abs(sourceBone.a - solverBone.a),
    Math.abs(sourceBone.b - solverBone.b),
    Math.abs(sourceBone.c - solverBone.c),
    Math.abs(sourceBone.d - solverBone.d),
    Math.abs(sourceBone.worldX - solverBone.worldX),
    Math.abs(sourceBone.worldY - solverBone.worldY)
  );
}

function solveLocalTranslationForWorld(
  bone: BoneLike,
  targetWorldX: number,
  targetWorldY: number,
  fallbackX: number,
  fallbackY: number
): { x: number; y: number } {
  const parent = bone.parent;

  if (!parent) {
    const scaleX = Math.abs(bone.skeleton.scaleX) > 1e-12 ? bone.skeleton.scaleX : 1;
    const scaleY = Math.abs(bone.skeleton.scaleY) > 1e-12 ? bone.skeleton.scaleY : 1;
    return {
      x: (targetWorldX - bone.skeleton.x) / scaleX,
      y: (targetWorldY - bone.skeleton.y) / scaleY
    };
  }

  const pa = parent.a;
  const pb = parent.b;
  const pc = parent.c;
  const pd = parent.d;
  const det = pa * pd - pb * pc;
  if (Math.abs(det) <= 1e-12) {
    return { x: fallbackX, y: fallbackY };
  }

  const invDet = 1 / det;
  const ia = pd * invDet;
  const ib = pb * invDet;
  const ic = pc * invDet;
  const id = pa * invDet;
  const dx = targetWorldX - parent.worldX;
  const dy = targetWorldY - parent.worldY;

  return {
    x: dx * ia - dy * ib,
    y: dy * id - dx * ic
  };
}

function derivePoseFromTargetWorld(
  sourceBone: BoneLike,
  solverBone: BoneLike,
  translation: { x: number; y: number },
  rotationSeed: number
): BonePose {
  solverBone.a = sourceBone.a;
  solverBone.b = sourceBone.b;
  solverBone.c = sourceBone.c;
  solverBone.d = sourceBone.d;
  solverBone.worldX = sourceBone.worldX;
  solverBone.worldY = sourceBone.worldY;
  solverBone.rotation = rotationSeed;
  solverBone.updateAppliedTransform();

  return {
    x: translation.x,
    y: translation.y,
    rotation: solverBone.arotation,
    scaleX: solverBone.ascaleX,
    scaleY: solverBone.ascaleY,
    shearX: solverBone.ashearX,
    shearY: solverBone.ashearY
  };
}
