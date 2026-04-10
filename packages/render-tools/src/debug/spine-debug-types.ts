/**
 * Duck-typed interfaces for the spine-core constraint and bone shapes that
 * the debug layers read at runtime. We define these explicitly instead of
 * importing from spine-core so that:
 *
 *   1. TypeScript catches property renames or removals in spine-core at
 *      compile time (the old `any` casts silently swallowed them).
 *   2. We don't pull in the full spine-core barrel for a handful of fields.
 *   3. PhysicsConstraint, which isn't exported from spine-pixi-v8, is still
 *      type-safe here.
 *
 * Keep these minimal: only the properties the debug layers actually read.
 * If a new debug layer needs a new property, add it here.
 */

export interface DebugBone {
  worldX: number;
  worldY: number;
  a: number;
  c: number;
  data?: { length?: number };
  parent?: DebugBone | null;
}

export interface DebugIkConstraint {
  bones: DebugBone[];
  target?: DebugBone;
  isActive?: () => boolean;
}

export interface DebugTransformConstraint {
  bones: DebugBone[];
  target?: DebugBone;
  isActive?: () => boolean;
}

export interface DebugPathConstraint {
  bones: DebugBone[];
  world?: number[];
  target?: { bone?: DebugBone };
  isActive?: () => boolean;
}

export interface DebugPhysicsConstraint {
  bone: DebugBone;
  gravity: number;
  wind: number;
  isActive?: () => boolean;
}
