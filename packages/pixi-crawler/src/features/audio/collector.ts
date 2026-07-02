import { installAudioProbes } from "./probes";
import type {
  AudioCollectorOptions,
  AudioCounters,
  AudioFrameMetrics,
} from "./types";

function makeCounters(): AudioCounters {
  return {
    decodeCount: 0,
    sourceCreated: 0,
    sourceStarted: 0,
    sourceStopped: 0,
    automationOps: 0,
    contextStateTransitions: 0,
  };
}

export class AudioMeasurementCollector {
  private enabled: boolean;
  private uninstall: (() => void) | null = null;

  private readonly knownContexts = new Set<AudioContext>();
  /** ctx -> its statechange handler, so detach() can removeEventListener. The
   *  AudioContext is game-owned and long-lived; without removal the handler
   *  (and via its closure the whole collector) leaks past dispose(). */
  private readonly ctxStateListeners = new Map<AudioContext, () => void>();

  private readonly activeSources = new Set<AudioBufferSourceNode>();
  private peakSourceCount = 0;

  private decodeMs = 0;
  private counters = makeCounters();

  private prevAudioCurrentTimeMs: number | undefined;
  private prevPerfNowMs: number | undefined;

  constructor(opts: AudioCollectorOptions = {}) {
    this.enabled = opts.enabled !== false;
  }

  attach(): void {
    if (this.uninstall) return;
    this.uninstall = installAudioProbes(this);
  }

  detach(): void {
    if (this.uninstall) {
      this.uninstall();
      this.uninstall = null;
    }
    for (const [ctx, handler] of this.ctxStateListeners) {
      ctx.removeEventListener("statechange", handler);
    }
    this.ctxStateListeners.clear();
    this.knownContexts.clear();
    this.activeSources.clear();
    this.peakSourceCount = 0;
    this.decodeMs = 0;
    this.counters = makeCounters();
    this.prevAudioCurrentTimeMs = undefined;
    this.prevPerfNowMs = undefined;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  flush(): AudioFrameMetrics | undefined {
    if (this.knownContexts.size === 0) return undefined;

    let driftMs = 0;
    const firstCtx = this.knownContexts.values().next().value;
    if (firstCtx) {
      const audioMs = firstCtx.currentTime * 1000;
      const now = performance.now();
      if (
        this.prevAudioCurrentTimeMs !== undefined &&
        this.prevPerfNowMs !== undefined
      ) {
        const audioDelta = audioMs - this.prevAudioCurrentTimeMs;
        const realDelta = now - this.prevPerfNowMs;
        driftMs = realDelta - audioDelta;
      }
      this.prevAudioCurrentTimeMs = audioMs;
      this.prevPerfNowMs = now;
    }

    const result: AudioFrameMetrics = {
      decodeMs: this.decodeMs,
      activeSourceCount: this.activeSources.size,
      peakSourceCount: this.peakSourceCount,
      contextCount: this.knownContexts.size,
      currentTimeDriftMs: driftMs,
      counters: this.counters,
    };

    this.decodeMs = 0;
    this.counters = makeCounters();
    this.peakSourceCount = this.activeSources.size;

    return result;
  }

  _noteContext(ctx: AudioContext): void {
    if (this.knownContexts.has(ctx)) return;
    this.knownContexts.add(ctx);
    const handler = (): void => {
      if (this.enabled) this.counters.contextStateTransitions++;
    };
    ctx.addEventListener("statechange", handler);
    this.ctxStateListeners.set(ctx, handler);
  }

  recordDecode(ms: number): void {
    this.decodeMs += ms;
    this.counters.decodeCount++;
  }

  recordSourceCreated(): void {
    this.counters.sourceCreated++;
  }

  recordSourceStarted(node: AudioBufferSourceNode): void {
    this.counters.sourceStarted++;
    this.activeSources.add(node);
    if (this.activeSources.size > this.peakSourceCount) {
      this.peakSourceCount = this.activeSources.size;
    }
  }

  recordSourceStopped(): void {
    this.counters.sourceStopped++;
  }

  recordSourceEnded(node: AudioBufferSourceNode): void {
    this.activeSources.delete(node);
  }

  recordAutomation(): void {
    this.counters.automationOps++;
  }
}
