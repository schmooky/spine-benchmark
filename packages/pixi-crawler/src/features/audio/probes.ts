import type { AudioMeasurementCollector } from "./collector";

const PATCHED_AUDIO_CTX = Symbol("audio-ctx-patched");
const PATCHED_BUF_SRC = Symbol("audio-buf-src-patched");
const PATCHED_AUDIO_PARAM = Symbol("audio-param-patched");

const AUTOMATION_METHODS = [
  "setValueAtTime",
  "linearRampToValueAtTime",
  "exponentialRampToValueAtTime",
  "setTargetAtTime",
  "setValueCurveAtTime",
] as const;

interface PatchableProto {
  [PATCHED_AUDIO_CTX]?: true;
  [PATCHED_BUF_SRC]?: true;
  [PATCHED_AUDIO_PARAM]?: true;
}

export function installAudioProbes(
  collector: AudioMeasurementCollector
): () => void {
  if (typeof globalThis === "undefined") return noop;
  const g = globalThis as unknown as {
    AudioContext?: typeof AudioContext;
    AudioBufferSourceNode?: typeof AudioBufferSourceNode;
    AudioParam?: typeof AudioParam;
  };
  if (typeof g.AudioContext === "undefined") {
    return noop;
  }

  const uninstallers: (() => void)[] = [];

  const ctxProto = g.AudioContext.prototype as unknown as AudioContext &
    PatchableProto;
  if (!ctxProto[PATCHED_AUDIO_CTX]) {
    uninstallers.push(patchAudioContext(ctxProto, collector));
    ctxProto[PATCHED_AUDIO_CTX] = true;
  }

  if (typeof g.AudioBufferSourceNode !== "undefined") {
    const srcProto = g.AudioBufferSourceNode
      .prototype as unknown as AudioBufferSourceNode & PatchableProto;
    if (!srcProto[PATCHED_BUF_SRC]) {
      uninstallers.push(patchAudioBufferSourceNode(srcProto, collector));
      srcProto[PATCHED_BUF_SRC] = true;
    }
  }

  if (typeof g.AudioParam !== "undefined") {
    const paramProto = g.AudioParam.prototype as unknown as AudioParam &
      PatchableProto;
    if (!paramProto[PATCHED_AUDIO_PARAM]) {
      uninstallers.push(patchAudioParam(paramProto, collector));
      paramProto[PATCHED_AUDIO_PARAM] = true;
    }
  }

  return () => {
    for (let i = uninstallers.length - 1; i >= 0; i--) {
      uninstallers[i]!();
    }
  };
}

function patchAudioContext(
  proto: AudioContext & PatchableProto,
  collector: AudioMeasurementCollector
): () => void {
  const origDecode = proto.decodeAudioData as (
    this: AudioContext,
    data: ArrayBuffer,
    success?: (buf: AudioBuffer) => unknown,
    error?: (err: DOMException) => unknown
  ) => Promise<AudioBuffer>;
  const origCreateBufferSource = proto.createBufferSource;

  (proto as unknown as { decodeAudioData: unknown }).decodeAudioData =
    function (
      this: AudioContext,
      data: ArrayBuffer,
      success?: (buf: AudioBuffer) => unknown,
      error?: (err: DOMException) => unknown
    ): Promise<AudioBuffer> {
      collector._noteContext(this);
      if (!collector.isEnabled()) {
        return origDecode.call(this, data, success, error);
      }
      const t0 = performance.now();
      let recorded = false;
      const recordOnce = (): void => {
        if (recorded) return;
        recorded = true;
        collector.recordDecode(performance.now() - t0);
      };

      const wrappedSuccess = success
        ? (buf: AudioBuffer): unknown => {
            recordOnce();
            return success(buf);
          }
        : undefined;

      const result = origDecode.call(this, data, wrappedSuccess, error);
      if (result && typeof result.then === "function") {
        return result.then(
          (buf) => {
            recordOnce();
            return buf;
          },
          (err: unknown) => {
            recordOnce();
            throw err;
          }
        );
      }
      return result;
    };

  (proto as unknown as { createBufferSource: unknown }).createBufferSource =
    function (this: AudioContext): AudioBufferSourceNode {
      collector._noteContext(this);
      const node = origCreateBufferSource.call(this);
      if (collector.isEnabled()) collector.recordSourceCreated();
      return node;
    };

  return () => {
    (proto as unknown as { decodeAudioData: unknown }).decodeAudioData =
      origDecode;
    (proto as unknown as { createBufferSource: unknown }).createBufferSource =
      origCreateBufferSource;
    delete (proto as PatchableProto)[PATCHED_AUDIO_CTX];
  };
}

function patchAudioBufferSourceNode(
  proto: AudioBufferSourceNode & PatchableProto,
  collector: AudioMeasurementCollector
): () => void {
  const origStart = proto.start;
  const origStop = proto.stop;

  (proto as unknown as { start: unknown }).start = function (
    this: AudioBufferSourceNode,
    when?: number,
    offset?: number,
    duration?: number
  ): void {
    if (collector.isEnabled()) {
      collector.recordSourceStarted(this);
      this.addEventListener(
        "ended",
        () => {
          collector.recordSourceEnded(this);
        },
        { once: true }
      );
    }
    origStart.call(this, when as number, offset as number, duration as number);
  };

  (proto as unknown as { stop: unknown }).stop = function (
    this: AudioBufferSourceNode,
    when?: number
  ): void {
    if (collector.isEnabled()) collector.recordSourceStopped();
    origStop.call(this, when as number);
  };

  return () => {
    (proto as unknown as { start: unknown }).start = origStart;
    (proto as unknown as { stop: unknown }).stop = origStop;
    delete (proto as PatchableProto)[PATCHED_BUF_SRC];
  };
}

function patchAudioParam(
  proto: AudioParam & PatchableProto,
  collector: AudioMeasurementCollector
): () => void {
  const origs: Record<string, (...args: unknown[]) => unknown> = {};
  for (const name of AUTOMATION_METHODS) {
    const fn = (proto as unknown as Record<string, unknown>)[name];
    if (typeof fn !== "function") continue;
    origs[name] = fn as (...args: unknown[]) => unknown;
    (proto as unknown as Record<string, unknown>)[name] = function (
      this: AudioParam,
      ...args: unknown[]
    ): unknown {
      if (collector.isEnabled()) collector.recordAutomation();
      return origs[name]!.apply(this, args);
    };
  }
  return () => {
    for (const name of AUTOMATION_METHODS) {
      if (name in origs) {
        (proto as unknown as Record<string, unknown>)[name] = origs[name]!;
      }
    }
    delete (proto as PatchableProto)[PATCHED_AUDIO_PARAM];
  };
}

const noop = (): void => {};
