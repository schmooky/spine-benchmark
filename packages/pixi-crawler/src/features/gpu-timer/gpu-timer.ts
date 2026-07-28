/**
 * GPU frame timing via EXT_disjoint_timer_query_webgl2
 */

interface GpuTimerExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

interface PendingGpuQuery {
  frameIdx: number;
  query: WebGLQuery;
}

/** Minimal mutable slice of a FrameRecord the timer back-fills. */
export interface GpuFrameSink {
  gpuMs?: number;
  gpuDisjoint?: boolean;
}

export interface GpuTimerHost {
  /** Frame index to tag the query begun this frame. */
  currentFrameIdx(): number;
  /** Locate the (mutable) record for a completed query's frame, or undefined. */
  findRecord(frameIdx: number): GpuFrameSink | undefined;
}

const GPU_TIMER_MAX_PENDING = 20;
const GPU_TIMER_PROBE_MIN_MS = 0.001;
const GPU_TIMER_PROBE_MAX_MS = 5000;
const GPU_TIMER_PROBE_POLL_TRIES = 16;
const GPU_TIMER_PROBE_POLL_MS = 4;

function compileGpuProbeProgram(
  gl: WebGL2RenderingContext
): WebGLProgram | null {
  const vsSrc = `#version 300 es
        void main() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0; }`;
  const fsSrc = `#version 300 es
        precision lowp float;
        out vec4 outColor;
        void main() { outColor = vec4(1.0); }`;
  const vs = gl.createShader(gl.VERTEX_SHADER);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }
  gl.shaderSource(vs, vsSrc);
  gl.compileShader(vs);
  gl.shaderSource(fs, fsSrc);
  gl.compileShader(fs);
  const prog = gl.createProgram();
  if (!prog) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

/**
 * Create a GPU timer if the EXT is available, else `undefined`. The returned
 * timer self-validates asynchronously and enables itself only if the probe
 * passes. Callers drive it unconditionally - methods no-op until enabled.
 */
export function createGpuTimer(
  gl: WebGL2RenderingContext | undefined,
  host: GpuTimerHost
): GpuTimer | undefined {
  if (!gl || typeof gl.createQuery !== "function") return undefined;
  const ext = gl.getExtension(
    "EXT_disjoint_timer_query_webgl2"
  ) as GpuTimerExt | null;
  if (!ext) return undefined;
  return new GpuTimer(gl, ext, host);
}

export class GpuTimer {
  private enabled = false;
  private disposed = false;
  /** Per-attempt probe diagnostics - surfaced in the disable warning so a
   *  true broken-driver verdict can be told apart from a too-strict probe. */
  private probeDiag: string[] = [];
  private readonly pending: PendingGpuQuery[] = [];
  private readonly pool: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  private activeFrameIdx = -1;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly ext: GpuTimerExt,
    private readonly host: GpuTimerHost
  ) {
    void this._validateAndEnable();
  }

  private async _validateAndEnable(): Promise<void> {
    let ok: boolean;
    try {
      ok = await this._validate();
    } catch {
      ok = false;
    }
    if (this.disposed) return; // torn down during async-probe -> don't enable
    if (!ok) {
      const diag =
        this.probeDiag.length > 0
          ? " Probe: " + this.probeDiag.join(" | ")
          : "";
      console.warn(
        "[crawler] EXT_disjoint_timer_query_webgl2 present but timer did NOT pass the " +
          "probe. " +
          "GPU timing disabled;." +
          diag
      );
      return;
    }
    this.enabled = true;
    console.info(
      "[crawler] GPU timing ENABLED - EXT timer scales under load."
    );
  }

  private async _validate(): Promise<boolean> {
    const { gl, ext } = this;
    this.probeDiag = [];
    const prevProgram = gl.getParameter(
      gl.CURRENT_PROGRAM
    ) as WebGLProgram | null;
    const prevFbo = gl.getParameter(
      gl.FRAMEBUFFER_BINDING
    ) as WebGLFramebuffer | null;
    const prevVao = gl.getParameter(
      gl.VERTEX_ARRAY_BINDING
    ) as WebGLVertexArrayObject | null;
    const program = compileGpuProbeProgram(gl);
    if (!program) return true; // can't build probe -> trust ext (no regression)
    const fbTex = gl.createTexture();
    const fb = gl.createFramebuffer();
    try {
      if (!fbTex || !fb) return true;
      gl.bindTexture(gl.TEXTURE_2D, fbTex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        fbTex,
        0
      );
      let valid = 0;
      let invalid = 0;
      for (let attempt = 0; attempt < 3; attempt++) {
        gl.useProgram(program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.bindVertexArray(null);
        gl.getParameter(ext.GPU_DISJOINT_EXT);
        const q = gl.createQuery();
        if (!q) break;
        const cpuStart = performance.now();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        for (let i = 0; i < 50; i++) gl.drawArrays(gl.POINTS, 0, 1);
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        gl.finish();
        const cpuMs = performance.now() - cpuStart;
        const avail = await this._awaitQueryAvailable(q);
        if (this.disposed) {
          gl.deleteQuery(q);
          return false;
        }
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean;
        if (!disjoint && avail) {
          const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
          const ms = ns / 1e6;
          const absOk =
            ms >= GPU_TIMER_PROBE_MIN_MS && ms <= GPU_TIMER_PROBE_MAX_MS;
          const ratio = cpuMs > 0.01 ? ms / cpuMs : 1;
          const crossOk = ratio >= 0.2;
          if (absOk && crossOk) valid++;
          else invalid++;
          this.probeDiag.push(
            `#${attempt}: gpu=${ms.toFixed(4)}ms cpu=${cpuMs.toFixed(4)}ms ratio=${ratio.toFixed(2)} absOk=${absOk} crossOk=${crossOk}`
          );
        } else {
          invalid++;
          this.probeDiag.push(
            `#${attempt}: ${disjoint ? "GPU_DISJOINT" : "result-unavailable"} (gpuMs unread)`
          );
        }
        gl.deleteQuery(q);
      }
      return !(invalid >= 2 && valid <= 1);
    } finally {
      gl.deleteProgram(program);
      if (fbTex) gl.deleteTexture(fbTex);
      if (fb) gl.deleteFramebuffer(fb);
      gl.useProgram(prevProgram);
      gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
      gl.bindVertexArray(prevVao);
    }
  }

  /**
   * Poll QUERY_RESULT_AVAILABLE across macrotask yields so the Chrome GPU
   * process can deliver the result over IPC. Returns true once available, or
   * false after the poll budget is exhausted (or the timer is torn down).
   */
  private async _awaitQueryAvailable(q: WebGLQuery): Promise<boolean> {
    const { gl } = this;
    for (let i = 0; i < GPU_TIMER_PROBE_POLL_TRIES; i++) {
      if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) as boolean)
        return true;
      await new Promise<void>((resolve) =>
        setTimeout(resolve, GPU_TIMER_PROBE_POLL_MS)
      );
      if (this.disposed) return false;
    }
    return gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) as boolean;
  }

  beginFrame(): void {
    if (!this.enabled) return;
    const { gl, ext } = this;

    if (this.active) {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      this.pool.push(this.active);
      this.active = null;
    }
    let query = this.pool.pop();
    if (!query) {
      const created = gl.createQuery();
      if (!created) return;
      query = created;
    }
    gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
    this.active = query;
    this.activeFrameIdx = this.host.currentFrameIdx();
  }

  endFrame(): void {
    if (!this.enabled || !this.active) return;
    const { gl, ext } = this;
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    this.pending.push({ frameIdx: this.activeFrameIdx, query: this.active });
    this.active = null;
    while (this.pending.length > GPU_TIMER_MAX_PENDING) {
      const dropped = this.pending.shift()!;
      this.pool.push(dropped.query);
    }
  }

  poll(): void {
    if (!this.enabled) return;
    const { gl, ext } = this;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean;
    if (disjoint) {
      for (const p of this.pending) {
        const rec = this.host.findRecord(p.frameIdx);
        if (rec) rec.gpuDisjoint = true;
        this.pool.push(p.query);
      }
      this.pending.length = 0;
      return;
    }
    while (this.pending.length > 0) {
      const head = this.pending[0]!;
      const available = gl.getQueryParameter(
        head.query,
        gl.QUERY_RESULT_AVAILABLE
      ) as boolean;
      if (!available) break;
      const ns = gl.getQueryParameter(head.query, gl.QUERY_RESULT) as number;
      this.pending.shift();
      this.pool.push(head.query);
      const rec = this.host.findRecord(head.frameIdx);
      if (rec) {
        const ms = ns / 1e6;
        if (!Number.isFinite(ms) || ms < 0 || ms > 1000) {
          rec.gpuDisjoint = true;
        } else {
          rec.gpuMs = ms;
        }
      }
    }
  }

  /** True when at least one query is awaiting a result (drives flushPending). */
  hasPending(): boolean {
    return this.pending.length > 0;
  }

  /**
   * Drain pending results into FrameRecords, polling via rAF until the queue
   * empties or the timeout elapses. Resolves immediately if not enabled.
   */
  flushPending(timeoutMs = 50): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    return new Promise((resolve) => {
      const start = performance.now();
      const tick = (): void => {
        this.poll();
        if (
          this.disposed ||
          !this.hasPending() ||
          performance.now() - start >= timeoutMs
        ) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  teardown(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.enabled = false;
    const { gl, ext } = this;
    if (this.active) {
      try {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
      } catch {
        /* context may be lost */
      }
      gl.deleteQuery(this.active);
      this.active = null;
    }
    for (const p of this.pending) gl.deleteQuery(p.query);
    for (const q of this.pool) gl.deleteQuery(q);
    this.pending.length = 0;
    this.pool.length = 0;
  }
}
