/**
 * WaterfallSpy - GL interceptor that tracks draw calls and state changes
 * for the draw call waterfall visualization.
 *
 * Replaces the simple draw-count spy with full state tracking.
 */

export interface WaterfallBreak {
    type: 'blend' | 'stencil' | 'fbo' | 'program';
    detail: string;
}

export interface WaterfallEntry {
    index: number;
    drawType: 'elements' | 'arrays' | 'elementsInstanced' | 'arraysInstanced';
    vertexCount: number;
    instanceCount: number;
    breaks: WaterfallBreak[];
}

// ── Blend factor names ───────────────────────────────────

const BLEND_NAMES: Record<number, string> = {
    0: 'ZERO', 1: 'ONE',
    768: 'SRC_COLOR', 769: '1-SRC_COLOR',
    770: 'SRC_ALPHA', 771: '1-SRC_ALPHA',
    772: 'DST_ALPHA', 773: '1-DST_ALPHA',
    774: 'DST_COLOR', 775: '1-DST_COLOR',
};

function blendName(f: number): string { return BLEND_NAMES[f] ?? `${f}`; }

function describeBlend(src: number, dst: number): string {
    if (src === 1 && dst === 771) return 'normal(pm)';
    if (src === 770 && dst === 771) return 'normal';
    if (src === 1 && dst === 1) return 'add';
    if (src === 774 && dst === 771) return 'multiply';
    if (src === 1 && dst === 769) return 'screen';
    return `${blendName(src)}+${blendName(dst)}`;
}

// ── Spy class ────────────────────────────────────────────

export class WaterfallSpy {
    private _installed = false;

    // Per-frame accumulated data
    private _entries: WaterfallEntry[] = [];
    private _drawIndex = 0;
    private _pendingBreaks: WaterfallBreak[] = [];

    // Tracked GL state
    private _curProgram: WebGLProgram | null = null;
    private _curBlendSrc = -1;
    private _curBlendDst = -1;
    private _stencilOn = false;
    private _curFbo: WebGLFramebuffer | null = null;

    get installed(): boolean { return this._installed; }

    /**
     * Hook draw calls + state-changing methods on the renderer's GL context.
     */
    install(renderer: unknown): boolean {
        try {
            const r = renderer as Record<string, unknown>;
            const gl = (
                r.gl ??
                (r.context as Record<string, unknown> | undefined)?.gl
            ) as WebGL2RenderingContext | undefined;

            if (!gl || typeof gl.drawElements !== 'function') return false;

            // Read initial GL state
            this._stencilOn = gl.isEnabled(gl.STENCIL_TEST);
            this._curFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
            this._curProgram = gl.getParameter(gl.CURRENT_PROGRAM);
            this._curBlendSrc = gl.getParameter(gl.BLEND_SRC_RGB);
            this._curBlendDst = gl.getParameter(gl.BLEND_DST_RGB);

            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const self = this;
            const STENCIL_TEST = gl.STENCIL_TEST;

            // ── Draw call hooks ──

            const origDE = gl.drawElements.bind(gl);
            gl.drawElements = function (m: GLenum, c: GLsizei, t: GLenum, o: GLintptr) {
                self._record('elements', c, 1);
                return origDE(m, c, t, o);
            };

            const origDA = gl.drawArrays.bind(gl);
            gl.drawArrays = function (m: GLenum, f: GLint, c: GLsizei) {
                self._record('arrays', c, 1);
                return origDA(m, f, c);
            };

            const origDEI = gl.drawElementsInstanced?.bind(gl);
            if (origDEI) {
                gl.drawElementsInstanced = function (
                    m: GLenum, c: GLsizei, t: GLenum, o: GLintptr, ic: GLsizei,
                ) {
                    self._record('elementsInstanced', c, ic);
                    return origDEI(m, c, t, o, ic);
                };
            }

            const origDAI = gl.drawArraysInstanced?.bind(gl);
            if (origDAI) {
                gl.drawArraysInstanced = function (
                    m: GLenum, f: GLint, c: GLsizei, ic: GLsizei,
                ) {
                    self._record('arraysInstanced', c, ic);
                    return origDAI(m, f, c, ic);
                };
            }

            // ── State change hooks ──

            const origUP = gl.useProgram.bind(gl);
            gl.useProgram = function (p: WebGLProgram | null) {
                if (p !== self._curProgram) {
                    self._pendingBreaks.push({ type: 'program', detail: 'shader change' });
                    self._curProgram = p;
                }
                return origUP(p);
            };

            const origBF = gl.blendFunc.bind(gl);
            gl.blendFunc = function (s: GLenum, d: GLenum) {
                if (s !== self._curBlendSrc || d !== self._curBlendDst) {
                    const from = describeBlend(self._curBlendSrc, self._curBlendDst);
                    const to = describeBlend(s, d);
                    self._pendingBreaks.push({ type: 'blend', detail: `${from} \u2192 ${to}` });
                    self._curBlendSrc = s;
                    self._curBlendDst = d;
                }
                return origBF(s, d);
            };

            const origBFS = gl.blendFuncSeparate.bind(gl);
            gl.blendFuncSeparate = function (sR: GLenum, dR: GLenum, sA: GLenum, dA: GLenum) {
                if (sR !== self._curBlendSrc || dR !== self._curBlendDst) {
                    const from = describeBlend(self._curBlendSrc, self._curBlendDst);
                    const to = describeBlend(sR, dR);
                    self._pendingBreaks.push({ type: 'blend', detail: `${from} \u2192 ${to}` });
                    self._curBlendSrc = sR;
                    self._curBlendDst = dR;
                }
                return origBFS(sR, dR, sA, dA);
            };

            const origEn = gl.enable.bind(gl);
            gl.enable = function (cap: GLenum) {
                if (cap === STENCIL_TEST && !self._stencilOn) {
                    self._pendingBreaks.push({ type: 'stencil', detail: 'stencil on (mask start)' });
                    self._stencilOn = true;
                }
                return origEn(cap);
            };

            const origDis = gl.disable.bind(gl);
            gl.disable = function (cap: GLenum) {
                if (cap === STENCIL_TEST && self._stencilOn) {
                    self._pendingBreaks.push({ type: 'stencil', detail: 'stencil off (mask end)' });
                    self._stencilOn = false;
                }
                return origDis(cap);
            };

            const origBFB = gl.bindFramebuffer.bind(gl);
            gl.bindFramebuffer = function (target: GLenum, fbo: WebGLFramebuffer | null) {
                if (fbo !== self._curFbo) {
                    self._pendingBreaks.push({
                        type: 'fbo',
                        detail: fbo ? 'fbo bind (filter/RT)' : 'fbo unbind (canvas)',
                    });
                    self._curFbo = fbo;
                }
                return origBFB(target, fbo);
            };

            this._installed = true;
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Harvest entries from the previous render and reset for the next one.
     * Call at the start of each tick, before the next render.
     */
    harvest(): { drawCount: number; entries: WaterfallEntry[] } {
        const result = { drawCount: this._drawIndex, entries: this._entries };
        this._entries = [];
        this._drawIndex = 0;
        this._pendingBreaks = [];
        return result;
    }

    private _record(
        drawType: WaterfallEntry['drawType'],
        vertexCount: number,
        instanceCount: number,
    ): void {
        this._entries.push({
            index: this._drawIndex++,
            drawType,
            vertexCount,
            instanceCount,
            breaks: this._pendingBreaks.length > 0 ? [...this._pendingBreaks] : [],
        });
        this._pendingBreaks = [];
    }
}
