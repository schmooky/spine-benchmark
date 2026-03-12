import type { FrameSnapshot, Recording, Issue, ObjectCensus } from './types.js';
import { ISSUE_IMPACT, ISSUE_EXPLAIN } from './types.js';

/**
 * Ring-buffer history + recording session for the Crawler.
 */
export class Recorder {
    private _history: FrameSnapshot[] = [];
    private _historySize: number;
    private _historyIdx = 0;
    private _historyFull = false;

    private _recording: Recording | null = null;
    private _recordings: Recording[] = [];

    constructor(historySize: number) {
        this._historySize = historySize;
        this._history = new Array(historySize);
    }

    push(
        snapshot: FrameSnapshot,
        frameIssues: { issue: Issue; nodeLabel: string }[],
    ): void {
        this._history[this._historyIdx] = snapshot;
        this._historyIdx = (this._historyIdx + 1) % this._historySize;
        if (this._historyIdx === 0) this._historyFull = true;

        if (this._recording) {
            this._recording.frames.push(snapshot);
            this._recording.endFrame = snapshot.frame;
            this._recording.endTime = snapshot.time;
            for (const fi of frameIssues) {
                this._recording.issues.push({
                    frame: snapshot.frame,
                    issue: fi.issue,
                    nodeLabel: fi.nodeLabel,
                });
            }
        }
    }

    getHistory(): FrameSnapshot[] {
        if (!this._historyFull) {
            return this._history.slice(0, this._historyIdx).filter(Boolean);
        }
        return [
            ...this._history.slice(this._historyIdx),
            ...this._history.slice(0, this._historyIdx),
        ].filter(Boolean);
    }

    getRecent(count: number): FrameSnapshot[] {
        const h = this.getHistory();
        return h.slice(-count);
    }

    startRecording(frame: number): void {
        const now = performance.now();
        this._recording = {
            startFrame: frame,
            endFrame: frame,
            startTime: now,
            endTime: now,
            frames: [],
            issues: [],
        };
    }

    stopRecording(): Recording | null {
        const r = this._recording;
        if (r) {
            this._recordings.push(r);
            this._recording = null;
        }
        return r;
    }

    get isRecording(): boolean { return this._recording !== null; }
    get recordings(): Recording[] { return this._recordings; }

    // ══════════════════════════════════════════════════════════
    // Report generation
    // ══════════════════════════════════════════════════════════

    static generateReport(rec: Recording): string {
        const L: string[] = [];
        const W = 64;
        const hr  = '═'.repeat(W);
        const hr2 = '─'.repeat(W);

        const duration = rec.endTime - rec.startTime;
        const frameCount = rec.frames.length;
        const avgFps  = frameCount > 0 ? rec.frames.reduce((s, f) => s + f.fps, 0) / frameCount : 0;
        const minFps  = frameCount > 0 ? Math.min(...rec.frames.map(f => f.fps)) : 0;
        const maxDC   = frameCount > 0 ? Math.max(...rec.frames.map(f => f.drawCalls)) : 0;
        const avgDC   = frameCount > 0 ? rec.frames.reduce((s, f) => s + f.drawCalls, 0) / frameCount : 0;
        const maxNodes = frameCount > 0 ? Math.max(...rec.frames.map(f => f.nodeCount)) : 0;

        // ── Header ──
        L.push(`╔${hr}╗`);
        L.push(`║  CRAWLER PERFORMANCE REPORT${' '.repeat(W - 29)}║`);
        L.push(`╠${hr}╣`);
        L.push(`║  Duration:      ${(duration / 1000).toFixed(2)}s (${frameCount} frames)`);
        L.push(`║  Avg FPS:       ${avgFps.toFixed(1)}`);
        L.push(`║  Min FPS:       ${minFps.toFixed(1)}`);
        L.push(`║  Max Draw Calls: ${maxDC}`);
        L.push(`║  Avg Draw Calls: ${avgDC.toFixed(1)}`);
        L.push(`║  Max Nodes:     ${maxNodes}`);

        // ── Object Census ──
        const census = Recorder._lastCensus(rec);
        if (census) {
            L.push(`║`);
            L.push(`╠${hr}╣`);
            L.push(`║  OBJECT CENSUS`);
            L.push(`╠${hr}╣`);

            L.push(`║`);
            L.push(`║  Node distribution:`);
            for (const { kind, count } of census.byKind) {
                const bar = '█'.repeat(Math.min(count, 30));
                L.push(`║    ${kind.padEnd(18)} ${String(count).padStart(4)}  ${bar}`);
            }

            if (census.spineSkeletons.length > 0) {
                L.push(`║`);
                L.push(`║  Spine skeleton instances:`);
                for (const { name, count } of census.spineSkeletons) {
                    const note = count > 3 ? ` ← ${count} instances, consider pooling` : '';
                    L.push(`║    ${name.padEnd(22)} x${count}${note}`);
                }
            }

            if (census.textureSources.length > 0) {
                L.push(`║`);
                L.push(`║  Texture sources (${census.textureSources.length} unique):`);
                for (const { id, count, width, height } of census.textureSources.slice(0, 15)) {
                    L.push(`║    [${id}] ${width}x${height}  used ${count}x`);
                }
                if (census.textureSources.length > 15) {
                    L.push(`║    ... and ${census.textureSources.length - 15} more`);
                }
            }

            L.push(`║`);
            L.push(`║  Totals: ${census.totalMasks} masks, ${census.totalFilters} filters, ${census.totalBlendBreaks} blend breaks`);
        }

        // ── Issues by impact ──
        L.push(`║`);
        L.push(`╠${hr}╣`);
        L.push(`║  ISSUES (sorted by rendering impact)`);
        L.push(`╠${hr}╣`);

        // Group issues by code, sort groups by max impact
        const issuesByCode = new Map<string, {
            count: number;
            impact: number;
            severity: Issue['severity'];
            examples: string[];
        }>();

        for (const { issue, nodeLabel } of rec.issues) {
            const key = issue.code;
            if (!issuesByCode.has(key)) {
                issuesByCode.set(key, {
                    count: 0,
                    impact: ISSUE_IMPACT[issue.code],
                    severity: issue.severity,
                    examples: [],
                });
            }
            const entry = issuesByCode.get(key)!;
            entry.count++;
            if (entry.examples.length < 3) {
                entry.examples.push(`[F${issue.frame}] ${nodeLabel}: ${issue.message}`);
            }
        }

        // Sort by impact descending
        const sortedIssues = [...issuesByCode.entries()].sort(
            (a, b) => b[1].impact - a[1].impact,
        );

        if (sortedIssues.length === 0) {
            L.push(`║`);
            L.push(`║  No issues detected - clean run!`);
        }

        for (const [code, data] of sortedIssues) {
            const sev = data.severity === 'error' ? '!!!' : data.severity === 'warn' ? ' ! ' : '   ';
            const impactBar = '▓'.repeat(Math.min(data.impact, 10));

            L.push(`║`);
            L.push(`║  ${sev} ${code} (x${data.count})  impact: ${impactBar} ${data.impact}/10`);

            // Explanation
            const explain = ISSUE_EXPLAIN[code as keyof typeof ISSUE_EXPLAIN];
            if (explain) {
                L.push(`║  ┌─ WHAT: ${Recorder._wrap(explain.what, W - 12, '║  │  ')}`);
                L.push(`║  └─ FIX:  ${Recorder._wrap(explain.fix, W - 12, '║       ')}`);
            }

            // Examples
            if (data.examples.length > 0) {
                L.push(`║  ${hr2.substring(0, 40)}`);
                for (const ex of data.examples) {
                    L.push(`║    ${ex}`);
                }
                if (data.count > 3) {
                    L.push(`║    ... and ${data.count - 3} more occurrences`);
                }
            }
        }

        // ── Heavy frames ──
        L.push(`║`);
        L.push(`╠${hr}╣`);
        L.push(`║  HEAVY FRAMES (FPS < 30)`);
        L.push(`╠${hr}╣`);

        const heavyFrames = rec.frames.filter(f => f.fps < 30 && f.fps > 0);
        if (heavyFrames.length === 0) {
            L.push(`║  None - all frames above 30fps`);
        } else {
            for (const f of heavyFrames.slice(0, 20)) {
                L.push(`║  F${f.frame}: ${f.fps.toFixed(1)}fps  ${f.drawCalls}dc  ${f.nodeCount} nodes`);
                for (const h of f.heavyNodes.slice(0, 3)) {
                    L.push(`║    └─ ${h.label}: ${h.drawCalls}dc`);
                }
            }
            if (heavyFrames.length > 20) {
                L.push(`║  ... and ${heavyFrames.length - 20} more heavy frames`);
            }
        }

        // ── Mask report ──
        if (census && census.totalMasks > 0) {
            L.push(`║`);
            L.push(`╠${hr}╣`);
            L.push(`║  MASK ANALYSIS`);
            L.push(`╠${hr}╣`);
            L.push(`║  Total masks in scene: ${census.totalMasks}`);

            // Count nested/complex from issues
            let nestedCount = 0;
            let complexCount = 0;
            for (const { issue } of rec.issues) {
                if (issue.code === 'MASK_NESTED') nestedCount++;
                if (issue.code === 'MASK_COMPLEX_SHAPE') complexCount++;
            }
            if (nestedCount > 0) {
                L.push(`║  !! Nested masks: ${nestedCount} - causes recursive stencil ops`);
            }
            if (complexCount > 0) {
                L.push(`║  !  Complex mask shapes: ${complexCount}`);
            }
            L.push(`║  Estimated mask draw call overhead: +${census.totalMasks * 2}dc`);
        }

        L.push(`║`);
        L.push(`╚${hr}╝`);
        return L.join('\n');
    }

    // ── Helpers ──

    /** Find the last census in the recording */
    private static _lastCensus(rec: Recording): ObjectCensus | undefined {
        for (let i = rec.frames.length - 1; i >= 0; i--) {
            if (rec.frames[i].census) return rec.frames[i].census;
        }
        return undefined;
    }

    /** Wrap long text at a given width */
    private static _wrap(text: string, maxLen: number, prefix: string): string {
        if (text.length <= maxLen) return text;
        const words = text.split(' ');
        const lines: string[] = [];
        let current = '';
        for (const word of words) {
            if (current.length + word.length + 1 > maxLen && current.length > 0) {
                lines.push(current);
                current = word;
            } else {
                current = current ? `${current} ${word}` : word;
            }
        }
        if (current) lines.push(current);
        return lines.join('\n' + prefix);
    }
}
