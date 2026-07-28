import type { SpineMeasurementCollector } from "./collector";
import type { ProbableSpine } from "./types";

const PROBED_MARKER = Symbol("spine-pipe-probed");

interface ProbedProto {
  [PROBED_MARKER]?: true;
  addRenderable: (spine: ProbableSpine, instructionSet: unknown) => unknown;
  updateRenderable: (spine: ProbableSpine) => unknown;
  validateRenderable: (spine: ProbableSpine) => boolean;
}

export function installPipeProbes(
  collector: SpineMeasurementCollector,
  renderer: { renderPipes?: Record<string, unknown> } | undefined
): () => void {
  const spineInstance = renderer?.renderPipes?.["spine"] as object | undefined;
  if (!spineInstance) {
    return () => {};
  }
  const proto = Object.getPrototypeOf(spineInstance) as ProbedProto;
  if (
    !proto ||
    typeof (proto as { addRenderable?: unknown }).addRenderable !== "function"
  ) {
    return () => {};
  }
  if (proto[PROBED_MARKER]) {
    return () => {};
  }

  const origAdd = proto.addRenderable;
  const origUpdate = proto.updateRenderable;
  const origValidate = proto.validateRenderable;

  proto.addRenderable = function (
    this: unknown,
    spine: ProbableSpine,
    instructionSet: unknown
  ) {
    if (!collector.isEnabled())
      return origAdd.call(this, spine, instructionSet);
    collector.noteRendered(spine);
    const t0 = collector.beginSpan();
    try {
      return origAdd.call(this, spine, instructionSet);
    } finally {
      const dt = collector.endSpan(t0);
      try {
        const slots = spine?.skeleton?.drawOrder?.length ?? 0;
        if (spine && typeof spine.uid === "number") {
          collector.recordPipeAddRenderable(spine.uid, dt, slots);
        }
      } catch (e) {
        console.warn("[SpinePipe-probe] recordPipeAddRenderable failed:", e);
      }
    }
  };

  proto.updateRenderable = function (this: unknown, spine: ProbableSpine) {
    if (!collector.isEnabled()) return origUpdate.call(this, spine);
    const t0 = collector.beginSpan();
    try {
      return origUpdate.call(this, spine);
    } finally {
      const dt = collector.endSpan(t0);
      try {
        if (spine && typeof spine.uid === "number") {
          collector.recordPipeUpdateRenderable(spine.uid, dt);
        }
      } catch (e) {
        console.warn("[SpinePipe-probe] recordPipeUpdateRenderable failed:", e);
      }
    }
  };

  proto.validateRenderable = function (this: unknown, spine: ProbableSpine) {
    if (!collector.isEnabled()) return origValidate.call(this, spine);
    const t0 = collector.beginSpan();
    let rebuildTriggered = false;
    try {
      const r = origValidate.call(this, spine);
      rebuildTriggered = r;
      return r;
    } finally {
      const dt = collector.endSpan(t0);
      try {
        if (spine && typeof spine.uid === "number") {
          collector.recordPipeValidateRenderable(
            spine.uid,
            dt,
            rebuildTriggered
          );
        }
      } catch (e) {
        console.warn(
          "[SpinePipe-probe] recordPipeValidateRenderable failed:",
          e
        );
      }
    }
  };

  proto[PROBED_MARKER] = true;

  return () => {
    if (!proto[PROBED_MARKER]) return;
    proto.addRenderable = origAdd;
    proto.updateRenderable = origUpdate;
    proto.validateRenderable = origValidate;
    delete proto[PROBED_MARKER];
  };
}
