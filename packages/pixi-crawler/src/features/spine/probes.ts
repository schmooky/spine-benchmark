import type { SpineMeasurementCollector } from "./collector";
import type {
  InstallSpineProbesOpts,
  ProbableAnimationState,
  ProbableSkeleton,
  ProbableSpine,
  SpineProbeRecord,
} from "./types";
import { NO_OP, wrapInstance } from "./utils";

const _probes = new WeakMap<ProbableSpine, SpineProbeRecord>();

export function installSpineProbes(
  spine: ProbableSpine,
  collector: SpineMeasurementCollector,
  opts: InstallSpineProbesOpts = {}
): () => void {
  const existing = _probes.get(spine);
  if (existing) return existing.uninstaller;

  const { skeleton, state } = spine;
  if (!skeleton || typeof skeleton.updateWorldTransform !== "function") {
    opts.onSkipped?.("missing skeleton.updateWorldTransform");
    return NO_OP;
  }
  if (!state || typeof state.apply !== "function") {
    opts.onSkipped?.("missing state.apply");
    return NO_OP;
  }

  const uid = spine.uid;
  const restoreFns: (() => void)[] = [];

  // 1. AnimationState.update(delta) - optional (mock objects in tests may lack it).
  if (typeof state.update === "function") {
    restoreFns.push(wrapAnimationStateUpdate(state, uid, collector));
  } else {
    opts.onSkipped?.("no state.update");
  }

  // 2. AnimationState.apply(skeleton) - required, checked above.
  restoreFns.push(wrapAnimationStateApply(state, uid, collector));

  // 3. Skeleton.update(delta) - physics-pre pass; optional (absent in the oldest builds).
  if (typeof skeleton.update === "function") {
    restoreFns.push(wrapSkeletonUpdate(skeleton, uid, collector));
  } else {
    opts.onSkipped?.("no skeleton.update");
  }

  // 4. Skeleton.updateWorldTransform(physics) - required.
  restoreFns.push(wrapSkeletonUpdateWorldTransform(skeleton, uid, collector));

  // 5. Spine.updateSlotObjects - optional; gated on _slotsObject empty/null inside.
  if (typeof spine.updateSlotObjects === "function") {
    restoreFns.push(wrapSpineUpdateSlotObjects(spine, uid, collector));
  } else {
    opts.onSkipped?.("no spine.updateSlotObjects");
  }

  // 6. Spine._validateAndTransformAttachments - present on WebGL/WebGPU, absent on bare spine-core.
  if (typeof spine._validateAndTransformAttachments === "function") {
    restoreFns.push(wrapValidateAndTransformAttachments(spine, uid, collector));
  } else {
    opts.onSkipped?.("no spine._validateAndTransformAttachments");
  }

  // 7. spine.destroy - a wrapper for auto-uninstalling the probes AND deregistering the
  // instance. Calls collector.unregister(spine): removes probes + drops it from
  // `instances`/`perInstancePhases`. Critical under autoRegister (default) - the scene
  // does not call unregister, and without this `instances` (a Set, strong-ref) accumulates
  // destroyed Spines forever -> (a) a memory leak, (b) instanceCount becomes
  // CUMULATIVE (whole session) instead of concurrent. unregister is idempotent
  // (uninstall under a guard), no recursion (it does not touch destroy).
  const restoreDestroy = wrapInstance(
    spine as unknown as { destroy: (...args: unknown[]) => unknown },
    "destroy",
    (orig) => {
      return function (this: ProbableSpine, ...args: unknown[]) {
        collector.unregister(spine);
        return (orig as (...a: unknown[]) => unknown).call(this, ...args);
      };
    }
  );
  restoreFns.push(restoreDestroy);

  let uninstalled = false;
  const uninstall = (): void => {
    if (uninstalled) return;
    uninstalled = true;
    // Reverse order: destroy was installed last - remove it first, so that
    // if orig.destroy internally touches one of our wrapped methods, it
    // still sees the probes.
    for (let i = restoreFns.length - 1; i >= 0; i--) {
      restoreFns[i]!();
    }
    _probes.delete(spine);
  };

  const record: SpineProbeRecord = { spine, uninstaller: uninstall };
  _probes.set(spine, record);
  return uninstall;
}

export function isSpineProbed(spine: ProbableSpine): boolean {
  return _probes.has(spine);
}

// -- Wrappers. Each: isEnabled gate -> measure -> record. Try/finally so the
// accounting lands even on an exception in the original.

function wrapAnimationStateUpdate(
  state: ProbableAnimationState,
  uid: number,
  collector: SpineMeasurementCollector
): () => void {
  return wrapInstance(
    state as unknown as Record<"update", (d: number) => unknown>,
    "update",
    (orig) => {
      return function (this: ProbableAnimationState, delta: number) {
        if (!collector.isEnabled())
          return (orig as (d: number) => unknown).call(this, delta);
        const t0 = collector.beginSpan();
        try {
          return (orig as (d: number) => unknown).call(this, delta);
        } finally {
          collector.recordAnimationStateUpdate(uid, collector.endSpan(t0));
        }
      };
    }
  );
}

function wrapAnimationStateApply(
  state: ProbableAnimationState,
  uid: number,
  collector: SpineMeasurementCollector
): () => void {
  return wrapInstance(
    state as unknown as Record<"apply", (s: ProbableSkeleton) => unknown>,
    "apply",
    (orig) => {
      return function (
        this: ProbableAnimationState,
        skeleton: ProbableSkeleton
      ) {
        if (!collector.isEnabled())
          return (orig as (s: ProbableSkeleton) => unknown).call(
            this,
            skeleton
          );
        const t0 = collector.beginSpan();
        try {
          return (orig as (s: ProbableSkeleton) => unknown).call(
            this,
            skeleton
          );
        } finally {
          collector.recordAnimationApply(uid, collector.endSpan(t0));
        }
      };
    }
  );
}

function wrapSkeletonUpdate(
  skeleton: ProbableSkeleton,
  uid: number,
  collector: SpineMeasurementCollector
): () => void {
  return wrapInstance(
    skeleton as unknown as Record<"update", (d: number) => unknown>,
    "update",
    (orig) => {
      return function (this: ProbableSkeleton, delta: number) {
        if (!collector.isEnabled())
          return (orig as (d: number) => unknown).call(this, delta);
        const t0 = collector.beginSpan();
        try {
          return (orig as (d: number) => unknown).call(this, delta);
        } finally {
          collector.recordSkeletonPrePhysics(uid, collector.endSpan(t0));
        }
      };
    }
  );
}

function wrapSkeletonUpdateWorldTransform(
  skeleton: ProbableSkeleton,
  uid: number,
  collector: SpineMeasurementCollector
): () => void {
  return wrapInstance(
    skeleton as unknown as Record<
      "updateWorldTransform",
      (p: unknown) => unknown
    >,
    "updateWorldTransform",
    (orig) => {
      return function (this: ProbableSkeleton, physics: unknown) {
        if (!collector.isEnabled())
          return (orig as (p: unknown) => unknown).call(this, physics);
        const t0 = collector.beginSpan();
        try {
          return (orig as (p: unknown) => unknown).call(this, physics);
        } finally {
          collector.recordWorldTransform(uid, collector.endSpan(t0));
        }
      };
    }
  );
}

function wrapSpineUpdateSlotObjects(
  spine: ProbableSpine,
  uid: number,
  collector: SpineMeasurementCollector
): () => void {
  return wrapInstance(
    spine as unknown as Record<"updateSlotObjects", () => unknown>,
    "updateSlotObjects",
    (orig) => {
      return function (this: ProbableSpine) {
        if (!collector.isEnabled()) return (orig as () => unknown).call(this);
        const t0 = collector.beginSpan();
        try {
          return (orig as () => unknown).call(this);
        } finally {
          collector.recordSlotObjectsSync(uid, collector.endSpan(t0));
        }
      };
    }
  );
}

// _validateAndTransformAttachments - the key wrapper:
// - read _stateChanged BEFORE the call (it is reset inside at :360);
// - dirty branch: measure validate+transform separately? Not possible due to the single
//   internal call. We measure the total and put it in attachmentTransformMs;
//   attachmentValidateMs stays 0 on this wrapper (validateAttachments
//   and transformAttachments are private nodes of the call graph, wrapping them
//   separately would need patching two adjacent methods and add noise).
// - no-op branch: write (false, 0, 0) - the noOpPasses counter increments.
function wrapValidateAndTransformAttachments(
  spine: ProbableSpine,
  uid: number,
  collector: SpineMeasurementCollector
): () => void {
  return wrapInstance(
    spine as unknown as Record<
      "_validateAndTransformAttachments",
      () => unknown
    >,
    "_validateAndTransformAttachments",
    (orig) => {
      return function (this: ProbableSpine) {
        if (!collector.isEnabled()) return (orig as () => unknown).call(this);
        const wasDirty = this._stateChanged;
        if (!wasDirty) {
          // no-op path in the original: an early return via `if (!this._stateChanged) return;`.
          // We still call the original in case the lib changes in future,
          // and record a no-op pass for pipe-churn stats. We do NOT open a span:
          // ~0 work, its time stays in the inclusive parent pipe span.
          const r = (orig as () => unknown).call(this);
          collector.recordAttachmentPass(uid, false, 0, 0);
          return r;
        }
        // nested = was there a pipe span on the stack BEFORE opening ours. >0 ->
        // the attachment is nested in a pipe (normal render path); 0 -> standalone
        // (bounds getter, Spine.js:709). Self-time is correct either way.
        const nested = collector.spanDepth() > 0;
        const t0 = collector.beginSpan();
        try {
          return (orig as () => unknown).call(this);
        } finally {
          collector.recordAttachmentPass(
            uid,
            true,
            0,
            collector.endSpan(t0),
            nested
          );
        }
      };
    }
  );
}
