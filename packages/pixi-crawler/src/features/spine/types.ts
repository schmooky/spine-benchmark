export interface SpinePhaseMs {
  animationStateUpdateMs: number;
  skeletonPrePhysicsMs: number;
  animationApplyMs: number;
  worldTransformMs: number;
  slotObjectsMs: number;
  attachmentValidateMs: number;
  attachmentTransformMs: number;
  pipeAddRenderableMs: number;
  pipeUpdateRenderableMs: number;
  pipeValidateRenderableMs: number;
}

export interface SpineStructure {
  totalBones: number;
  totalUpdateCacheLen: number;
  totalActiveTracks: number;
  totalMixingPairs: number;
  totalDrawOrderSlots: number;
  // sum of worldVerticesLength over all deform/mesh attachments in drawOrder (Phase 0.2).
  // The exact loop boundary of computeWorldVertices in Spine.transformAttachments
  // (spine-pixi-v8 Spine.js:437) -> cost-driver for attachmentTransformMs.
  totalDeformVertices: number;
  // Number of active (non-null) container-slot objects in spine._slotsObject (Phase 0.2).
  // Matches the skip-null loop of Spine.updateSlotObjects (Spine.js:535) -> cost-driver for slotObjectsMs.
  totalSlotObjects: number;
  constraints: {
    ik: number;
    path: number;
    physics: number;
    transform: number;
  };
}

export interface SpineCounters {
  attachmentDirtyPasses: number;
  attachmentNoOpPasses: number;
  // How many dirty attachment passes ran INSIDE a pipe span (self-time
  // depth > 0 on entry). Empirical confirmation of pipe-attachment overlap
  // (Phase 0.1). dirtyPasses - nestedPasses = standalone passes (bounds getter,
  // Spine.js:709) - those NOT nested in a pipe.
  attachmentNestedPasses: number;
  validateRenderableTrueCount: number;
  drawOrderSlotsTouched: number;
}

export interface PerInstanceMetrics {
  spineUid: number;
  totalMs: number;
  phases: SpinePhaseMs;
  structure: SpineStructure;
}

export interface SpineFrameMetrics {
  instanceCount: number;
  totalMs: number;
  phases: SpinePhaseMs;
  counters: SpineCounters;
  structure: SpineStructure;
  perInstance?: Record<number, PerInstanceMetrics>;
}

export interface ProbableSpine {
  readonly uid: number;
  _stateChanged: boolean;
  _slotsObject: Record<string, unknown> | null;
  skeleton: ProbableSkeleton;
  state: ProbableAnimationState;
  updateSlotObjects?: () => void;
  _validateAndTransformAttachments?: () => void;
  destroy: (...args: unknown[]) => unknown;
}

export interface ProbableAttachment {
  // The VertexAttachment base (mesh/deform/path/clipping/boundingbox) sets a
  // numeric worldVerticesLength; RegionAttachment does NOT have one (fixed 4 verts).
  // spine-core attachments/Attachment.js:55.
  worldVerticesLength?: number;
}

export interface ProbableSlot {
  // spine-core Slot.js:71 getAttachment() returns .attachment.
  getAttachment?: () => ProbableAttachment | null;
  attachment?: ProbableAttachment | null;
}

export interface ProbableSkeleton {
  bones: readonly unknown[];
  drawOrder: readonly ProbableSlot[];
  ikConstraints: readonly unknown[];
  pathConstraints: readonly unknown[];
  physicsConstraints: readonly unknown[];
  transformConstraints: readonly unknown[];
  _updateCache?: readonly unknown[];
  update: (delta: number) => unknown;
  updateWorldTransform: (physics: unknown) => unknown;
}

export interface ProbableAnimationState {
  tracks: readonly (ProbableTrackEntry | null)[];
  update: (delta: number) => unknown;
  apply: (skeleton: ProbableSkeleton) => unknown;
}

export interface ProbableTrackEntry {
  mixingFrom: ProbableTrackEntry | null;
}

export interface InstallSpineProbesOpts {
  onSkipped?: (reason: string) => void;
}

export interface SpineProbeRecord {
  readonly spine: ProbableSpine;
  readonly uninstaller: () => void;
}
