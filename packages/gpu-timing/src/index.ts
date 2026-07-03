/**
 * @module @spine-benchmark/gpu-timing
 *
 * True GPU render cost via `EXT_disjoint_timer_query_webgl2`. This is the fix
 * for the "vsync floor" problem: on a display-capped device every frame reads
 * ~16.7ms of *frame* time regardless of load, so frame time carries no signal.
 * A GPU timer query measures the actual time the GPU spent between begin/end,
 * independent of vsync, so cost still has a gradient at a locked 60fps.
 *
 * Usage per frame:
 *   timer.begin();
 *   ...draw...
 *   timer.end();
 *   timer.poll(ms => samples.push(ms));   // results arrive a few frames later
 *
 * When the extension is unavailable (Safari, most mobile) `supported` is false
 * and the caller should fall back to CPU-side timing; `begin/end/poll` are safe
 * no-ops so call sites don't branch.
 */

export * from "./coverageSampler.js";

type TimerExt = {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
};

export interface GpuTimerOptions {
  /** Max in-flight queries before older ones are dropped. Default 8. */
  maxInFlight?: number;
}

export class GpuTimer {
  readonly supported: boolean;
  private readonly gl: WebGL2RenderingContext | null;
  private readonly ext: TimerExt | null;
  private readonly maxInFlight: number;
  private readonly inFlight: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;

  constructor(gl: WebGL2RenderingContext | null, opts: GpuTimerOptions = {}) {
    this.maxInFlight = opts.maxInFlight ?? 8;
    this.gl = gl;
    this.ext = gl
      ? (gl.getExtension("EXT_disjoint_timer_query_webgl2") as TimerExt | null)
      : null;
    this.supported = !!gl && !!this.ext;
  }

  /** Begin timing the draw work that follows. No-op if unsupported. */
  begin(): void {
    if (!this.supported || !this.gl || !this.ext) return;
    if (this.active) {
      // unbalanced begin (an exception between begin/end skipped end()):
      // close + drop the stale query instead of no-oping forever - a
      // permanently-open TIME_ELAPSED query would block every later begin().
      try {
        this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      } catch {
        /* query may already be closed by a context event */
      }
      this.gl.deleteQuery(this.active);
      this.active = null;
    }
    const q = this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  /** End the current timing region and queue it for later readback. */
  end(): void {
    if (!this.supported || !this.gl || !this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.inFlight.push(this.active);
    this.active = null;
    while (this.inFlight.length > this.maxInFlight) {
      const stale = this.inFlight.shift();
      if (stale) this.gl.deleteQuery(stale);
    }
  }

  /**
   * Drain any queries whose result is ready. Calls `onResult` with the GPU time
   * in milliseconds for each. Results that landed in a disjoint (unreliable)
   * window are discarded. Call once per frame.
   */
  poll(onResult: (gpuMs: number) => void): void {
    if (!this.supported || !this.gl || !this.ext) return;
    const gl = this.gl;
    // Reading GPU_DISJOINT_EXT RESETS the flag. A disjoint invalidates every
    // in-flight query - including ones whose results have not landed yet (the
    // normal case: results arrive 1-3 frames late). Those must be dropped NOW;
    // keeping them would deliver their corrupted timings on a later poll when
    // the (already reset) flag reads false. This fires exactly on mobile GPU
    // power-state transitions, so it is the case that matters most.
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT) as boolean;
    if (disjoint) {
      for (const q of this.inFlight) gl.deleteQuery(q);
      this.inFlight.length = 0;
      return;
    }
    let i = 0;
    while (i < this.inFlight.length) {
      const q = this.inFlight[i];
      const available = gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) as boolean;
      if (!available) {
        i++;
        continue;
      }
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
      onResult(ns / 1e6); // nanoseconds -> milliseconds
      gl.deleteQuery(q);
      this.inFlight.splice(i, 1);
    }
  }

  /** Release all outstanding queries. */
  dispose(): void {
    if (!this.gl) return;
    if (this.active) this.gl.deleteQuery(this.active);
    for (const q of this.inFlight) this.gl.deleteQuery(q);
    this.inFlight.length = 0;
    this.active = null;
  }
}

/**
 * Best-effort extraction of the raw WebGL2 context from a Pixi v8 renderer (or
 * a canvas). Kept here so consumers don't reach into Pixi internals themselves.
 */
export function getGl2(source: unknown): WebGL2RenderingContext | null {
  const s = source as {
    gl?: unknown;
    context?: { gl?: unknown };
    canvas?: HTMLCanvasElement;
  };
  const cand = s?.gl ?? s?.context?.gl;
  if (cand && typeof (cand as WebGL2RenderingContext).createQuery === "function") {
    return cand as WebGL2RenderingContext;
  }
  const canvas = s?.canvas;
  if (canvas) {
    const gl = canvas.getContext("webgl2");
    if (gl) return gl;
  }
  return null;
}
