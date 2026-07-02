import { installPipeProbes } from "./pipe-probes";
import { installSpineProbes } from "./probes";
import type {
  InstallSpineProbesOpts,
  PerInstanceMetrics,
  ProbableSpine,
  SpineCounters,
  SpineFrameMetrics,
  SpinePhaseMs,
  SpineStructure,
} from "./types";

export interface SpineCollectorOptions {
  perInstance?: boolean;
  /**
   * Escape hatch for host integrations where wrapping `SpinePipe.prototype`
   * surfaces latent crashes inside `spine-pixi-v8` internals (e.g. malformed
   * gpuSpineData cache, asset format drift). When `true`, attach() skips
   * `installPipeProbes` and only per-instance phases (animationStateUpdate,
   * apply, worldTransform, slotObjects) are collected. Pipe phases
   * (pipeAddRenderableMs / pipeUpdateRenderableMs / pipeValidateRenderableMs)
   * stay zero across the session.
   */
  disablePipeProbes?: boolean;
  /**
   * Auto-register every Spine the SpinePipe renders (default true). Each
   * rendered instance is lazily `register()`-ed on its first `addRenderable`,
   * so per-instance probes install themselves with zero game-side wiring -
   * the HUD/telemetry show Spine data out of the box. Set `false` to require
   * explicit `getSpineCollector().register(spine)` calls (e.g. to profile only
   * specific instances).
   */
  autoRegister?: boolean;
}

function makePhases(): SpinePhaseMs {
  return {
    animationStateUpdateMs: 0,
    skeletonPrePhysicsMs: 0,
    animationApplyMs: 0,
    worldTransformMs: 0,
    slotObjectsMs: 0,
    attachmentValidateMs: 0,
    attachmentTransformMs: 0,
    pipeAddRenderableMs: 0,
    pipeUpdateRenderableMs: 0,
    pipeValidateRenderableMs: 0,
  };
}

function makeCounters(): SpineCounters {
  return {
    attachmentDirtyPasses: 0,
    attachmentNoOpPasses: 0,
    attachmentNestedPasses: 0,
    validateRenderableTrueCount: 0,
    drawOrderSlotsTouched: 0,
  };
}

function makeStructure(): SpineStructure {
  return {
    totalBones: 0,
    totalUpdateCacheLen: 0,
    totalActiveTracks: 0,
    totalMixingPairs: 0,
    totalDrawOrderSlots: 0,
    totalDeformVertices: 0,
    totalSlotObjects: 0,
    constraints: { ik: 0, path: 0, physics: 0, transform: 0 },
  };
}

export class SpineMeasurementCollector {
  private readonly perInstanceEnabled: boolean;
  private readonly pipeProbesDisabled: boolean;
  private readonly instances = new Set<ProbableSpine>();
  private readonly uninstallers = new WeakMap<ProbableSpine, () => void>();
  private enabled = true;
  private readonly autoRegister: boolean = true;
  private readonly autoFailed = new WeakSet();
  private pipeUninstall: (() => void) | null = null;

  private aggregatePhases = makePhases();
  private aggregateCounters = makeCounters();
  private readonly perInstancePhases = new Map<number, SpinePhaseMs>();
  private readonly childMsStack: number[] = [];

  // Structure snapshot (bones/constraints/deform/...) is O(instances × slots)
  // and walks drawOrder + getAttachment() per slot - too heavy to run on every
  // per-frame flush(). It barely moves frame-to-frame, and downstream reads it
  // diagnostically (HUD/telemetry aggregate cpu/pipe phases + instanceCount, not
  // these totals). So recompute every STRUCT_EVERY flushes (or when the instance
  // set size changes), reuse the cached snapshot between. Phases stay per-frame.
  private static readonly STRUCT_EVERY = 6;
  private flushCount = 0;
  private cachedStructure: SpineStructure | undefined;
  private cachedPerInstanceStruct: Map<number, SpineStructure> | undefined;
  private structInstanceCount = -1;

  beginSpan(): number {
    this.childMsStack.push(0);
    return performance.now();
  }

  endSpan(t0: number): number {
    const inclusive = performance.now() - t0;
    const child = this.childMsStack.pop() ?? 0;
    const parentIdx = this.childMsStack.length - 1;
    if (parentIdx >= 0) {
      const parent = this.childMsStack[parentIdx];
      if (parent !== undefined)
        this.childMsStack[parentIdx] = parent + inclusive;
    }
    const self = inclusive - child;
    return self > 0 ? self : 0;
  }

  spanDepth(): number {
    return this.childMsStack.length;
  }

  constructor(opts: SpineCollectorOptions = {}) {
    this.perInstanceEnabled = opts.perInstance === true;
    this.pipeProbesDisabled = opts.disablePipeProbes === true;
    this.autoRegister = opts.autoRegister !== false;
  }

  /**
   * Called by the SpinePipe probe on every `addRenderable`. Lazily registers
   * a freshly-seen instance so per-instance probes install themselves without
   * any explicit game-side `register()` call. Idempotent + crash-isolated: a
   * spine whose probe install throws is remembered and never retried.
   */
  noteRendered(spine: ProbableSpine): void {
    if (
      !this.autoRegister ||
      this.instances.has(spine) ||
      this.autoFailed.has(spine)
    )
      return;
    try {
      this.register(spine);
    } catch (e) {
      this.autoFailed.add(spine);
      console.warn(
        "[SpineMeasurementCollector] auto-register failed; skipping instance:",
        e
      );
    }
  }

  attach(
    renderer:
      | { type?: number | string; renderPipes?: Record<string, unknown> }
      | undefined
  ): void {
    if (this.pipeUninstall) return;
    if (this.pipeProbesDisabled) {
      console.warn(
        "[SpineMeasurementCollector] disablePipeProbes=true - pipe phase metrics will stay zero."
      );
      return;
    }
    const isCanvas = renderer?.type === 2 || renderer?.type === "canvas";
    if (isCanvas) {
      console.warn(
        "[SpineMeasurementCollector] Canvas renderer detected - pipe-probes skipped (per-instance probes remain active)."
      );
      return;
    }
    this.pipeUninstall = installPipeProbes(this, renderer);
  }

  detach(): void {
    if (this.pipeUninstall) {
      this.pipeUninstall();
      this.pipeUninstall = null;
    }
    for (const spine of this.instances) {
      const uninstall = this.uninstallers.get(spine);
      if (uninstall) uninstall();
    }
    this.instances.clear();
    this.aggregatePhases = makePhases();
    this.aggregateCounters = makeCounters();
    this.perInstancePhases.clear();
    this.childMsStack.length = 0;
    this.cachedStructure = undefined;
    this.cachedPerInstanceStruct = undefined;
    this.structInstanceCount = -1;
    this.flushCount = 0;
  }

  register(spine: ProbableSpine, opts: InstallSpineProbesOpts = {}): void {
    if (this.instances.has(spine)) return;
    const uninstall = installSpineProbes(spine, this, opts);
    this.instances.add(spine);
    this.uninstallers.set(spine, uninstall);
  }

  unregister(spine: ProbableSpine): void {
    const uninstall = this.uninstallers.get(spine);
    if (uninstall) uninstall();
    this.uninstallers.delete(spine);
    this.instances.delete(spine);
    this.perInstancePhases.delete(spine.uid);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  flush(): SpineFrameMetrics | undefined {
    if (this.instances.size === 0) return undefined;
    const phases = this.aggregatePhases;
    const counters = this.aggregateCounters;

    // Recompute the (expensive) structure snapshot only periodically; reuse the
    // cached one otherwise. Phases below are always per-frame (cheap Map reads).
    this.flushCount++;
    const recompute =
      this.cachedStructure === undefined ||
      this.instances.size !== this.structInstanceCount ||
      this.flushCount % SpineMeasurementCollector.STRUCT_EVERY === 0;
    if (recompute) {
      const structure = makeStructure();
      const perInstanceStruct = this.perInstanceEnabled
        ? new Map<number, SpineStructure>()
        : undefined;
      for (const spine of this.instances) {
        const s = snapshotStructure(spine);
        structure.totalBones += s.totalBones;
        structure.totalUpdateCacheLen += s.totalUpdateCacheLen;
        structure.totalActiveTracks += s.totalActiveTracks;
        structure.totalMixingPairs += s.totalMixingPairs;
        structure.totalDrawOrderSlots += s.totalDrawOrderSlots;
        structure.totalDeformVertices += s.totalDeformVertices;
        structure.totalSlotObjects += s.totalSlotObjects;
        structure.constraints.ik += s.constraints.ik;
        structure.constraints.path += s.constraints.path;
        structure.constraints.physics += s.constraints.physics;
        structure.constraints.transform += s.constraints.transform;
        if (perInstanceStruct) perInstanceStruct.set(spine.uid, s);
      }
      this.cachedStructure = structure;
      this.cachedPerInstanceStruct = perInstanceStruct;
      this.structInstanceCount = this.instances.size;
    }
    // Guaranteed set: the `recompute` guard above includes `=== undefined`.
    const structure = this.cachedStructure!;

    const perInstance: Record<number, PerInstanceMetrics> | undefined = this
      .perInstanceEnabled
      ? {}
      : undefined;
    if (perInstance) {
      for (const spine of this.instances) {
        const bucket = this.perInstancePhases.get(spine.uid) ?? makePhases();
        perInstance[spine.uid] = {
          spineUid: spine.uid,
          totalMs: sumPhases(bucket),
          phases: bucket,
          structure:
            this.cachedPerInstanceStruct?.get(spine.uid) ??
            snapshotStructure(spine),
        };
      }
    }

    const totalMs = sumPhases(phases);

    const result: SpineFrameMetrics = {
      instanceCount: this.instances.size,
      totalMs,
      phases,
      counters,
      structure,
    };
    if (perInstance) result.perInstance = perInstance;

    this.aggregatePhases = makePhases();
    this.aggregateCounters = makeCounters();
    this.perInstancePhases.clear();

    return result;
  }

  recordAnimationStateUpdate(uid: number, ms: number): void {
    this.aggregatePhases.animationStateUpdateMs += ms;
    if (this.perInstanceEnabled)
      this.bucketFor(uid).animationStateUpdateMs += ms;
  }
  recordSkeletonPrePhysics(uid: number, ms: number): void {
    this.aggregatePhases.skeletonPrePhysicsMs += ms;
    if (this.perInstanceEnabled) this.bucketFor(uid).skeletonPrePhysicsMs += ms;
  }
  recordAnimationApply(uid: number, ms: number): void {
    this.aggregatePhases.animationApplyMs += ms;
    if (this.perInstanceEnabled) this.bucketFor(uid).animationApplyMs += ms;
  }
  recordWorldTransform(uid: number, ms: number): void {
    this.aggregatePhases.worldTransformMs += ms;
    if (this.perInstanceEnabled) this.bucketFor(uid).worldTransformMs += ms;
  }
  recordSlotObjectsSync(uid: number, ms: number): void {
    this.aggregatePhases.slotObjectsMs += ms;
    if (this.perInstanceEnabled) this.bucketFor(uid).slotObjectsMs += ms;
  }
  recordAttachmentPass(
    uid: number,
    wasDirty: boolean,
    validateMs: number,
    transformMs: number,
    nested = false
  ): void {
    if (wasDirty) {
      this.aggregateCounters.attachmentDirtyPasses++;
      if (nested) this.aggregateCounters.attachmentNestedPasses++;
      this.aggregatePhases.attachmentValidateMs += validateMs;
      this.aggregatePhases.attachmentTransformMs += transformMs;
      if (this.perInstanceEnabled) {
        const b = this.bucketFor(uid);
        b.attachmentValidateMs += validateMs;
        b.attachmentTransformMs += transformMs;
      }
    } else {
      this.aggregateCounters.attachmentNoOpPasses++;
    }
  }
  recordPipeAddRenderable(uid: number, ms: number, slotsTouched: number): void {
    this.aggregatePhases.pipeAddRenderableMs += ms;
    this.aggregateCounters.drawOrderSlotsTouched += slotsTouched;
    if (this.perInstanceEnabled) this.bucketFor(uid).pipeAddRenderableMs += ms;
  }
  recordPipeUpdateRenderable(uid: number, ms: number): void {
    this.aggregatePhases.pipeUpdateRenderableMs += ms;
    if (this.perInstanceEnabled)
      this.bucketFor(uid).pipeUpdateRenderableMs += ms;
  }
  recordPipeValidateRenderable(
    uid: number,
    ms: number,
    rebuildTriggered: boolean
  ): void {
    this.aggregatePhases.pipeValidateRenderableMs += ms;
    if (rebuildTriggered) this.aggregateCounters.validateRenderableTrueCount++;
    if (this.perInstanceEnabled)
      this.bucketFor(uid).pipeValidateRenderableMs += ms;
  }

  private bucketFor(uid: number): SpinePhaseMs {
    let b = this.perInstancePhases.get(uid);
    if (!b) {
      b = makePhases();
      this.perInstancePhases.set(uid, b);
    }
    return b;
  }
}

function snapshotStructure(spine: ProbableSpine): SpineStructure {
  const skel = spine.skeleton;
  const state = spine.state;
  const tracks = state?.tracks;
  let activeTracks = 0;
  let mixingPairs = 0;
  if (tracks) {
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      if (!t) continue;
      activeTracks++;
      if (t.mixingFrom !== null && t.mixingFrom !== undefined) mixingPairs++;
    }
  }
  return {
    totalBones: skel?.bones?.length ?? 0,
    totalUpdateCacheLen: skel?._updateCache?.length ?? 0,
    totalActiveTracks: activeTracks,
    totalMixingPairs: mixingPairs,
    totalDrawOrderSlots: skel?.drawOrder?.length ?? 0,
    totalDeformVertices: countDeformVertices(skel),
    totalSlotObjects: countSlotObjects(spine),
    constraints: {
      ik: skel?.ikConstraints?.length ?? 0,
      path: skel?.pathConstraints?.length ?? 0,
      physics: skel?.physicsConstraints?.length ?? 0,
      transform: skel?.transformConstraints?.length ?? 0,
    },
  };
}

function countDeformVertices(
  skel: ProbableSpine["skeleton"] | undefined
): number {
  const drawOrder = skel?.drawOrder;
  if (!drawOrder) return 0;
  let total = 0;
  for (let i = 0; i < drawOrder.length; i++) {
    const slot = drawOrder[i];
    if (!slot) continue;
    const att =
      typeof slot.getAttachment === "function"
        ? slot.getAttachment()
        : slot.attachment;
    const wvl = att?.worldVerticesLength;
    if (typeof wvl === "number" && wvl > 0) total += wvl;
  }
  return total;
}

function countSlotObjects(spine: ProbableSpine): number {
  const obj = spine._slotsObject;
  if (!obj) return 0;
  let count = 0;
  for (const k in obj) {
    if (obj[k] != null) count++;
  }
  return count;
}

function sumPhases(p: SpinePhaseMs): number {
  return (
    p.animationStateUpdateMs +
    p.skeletonPrePhysicsMs +
    p.animationApplyMs +
    p.worldTransformMs +
    p.slotObjectsMs +
    p.attachmentValidateMs +
    p.attachmentTransformMs +
    p.pipeAddRenderableMs +
    p.pipeUpdateRenderableMs +
    p.pipeValidateRenderableMs
  );
}
