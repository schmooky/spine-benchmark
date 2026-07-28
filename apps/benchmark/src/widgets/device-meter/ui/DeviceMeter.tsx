import { useEffect, useState } from "react";

import { useSkeletonStore, measureFrameFeatures } from "@/entities/skeleton";
import { estimatePoseCoverage, type WalkableSkeleton } from "@spine-benchmark/metrics-impact-formula";
import { stage } from "@/widgets/stage";
import { BOARD_SIZE, predictGroups, type GroupPrediction } from "@/shared/config/calibrated-devices";
import { cn } from "@/shared/lib/utils";

const FRAME_MS = 1000 / 60;

/** Spine costs are usually well under 1ms, so keep the small end readable:
 * 3 decimals below 1ms, 2 below 10ms, 1 above. */
function fmt(ms: number): string {
  if (ms >= 10) return ms.toFixed(1);
  if (ms >= 1) return ms.toFixed(2);
  return ms.toFixed(3);
}
/** A tier's spread, collapsed when the devices agree. */
function span(lo: number, hi: number): string {
  return hi - lo < (hi < 1 ? 0.005 : 0.05) ? fmt(hi) : `${fmt(lo)}-${fmt(hi)}`;
}
const compact = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : Math.round(n).toString();

type Status = "ok" | "warn" | "over";
function statusOf(ms: number): Status {
  if (ms >= FRAME_MS) return "over";
  if (ms >= 0.7 * FRAME_MS) return "warn";
  return "ok";
}
const TEXT: Record<Status, string> = {
  ok: "text-emerald-400",
  warn: "text-amber-400",
  over: "text-red-400",
};

interface Work {
  drawCalls: number;
  vertices: number;
  stateChanges: number;
  batchBreaks: number;
  stencilPasses: number;
  renderTargetSwitches: number;
  filterPasses: number;
}

/**
 * Cost analysis panel, ordered by how certain each number is.
 *
 *   1. THIS SPINE, HERE - the skeleton's OWN per-frame CPU, measured in
 *      isolation (crawler spineProfile: spine.update + its vertex work), not
 *      the whole frame. One idle symbol is typically well under a millisecond,
 *      so it is printed to microsecond resolution. Zero model.
 *   2. WHOLE FRAME, HERE - everything the canvas does this frame (this spine +
 *      the workbench's own grid, camera and filters), plus the real GPU
 *      milliseconds where the browser exposes a timer (desktop does, mobile
 *      does not). Context for the number above, never confused with it.
 *   3. THE WORK - draw calls, vertices, state changes, batch breaks, stencil
 *      and render-target switches. Device-INVARIANT facts; no model needed.
 *   4. ON PHONES - the marginal cost of one of these (sub-ms, additive) and of
 *      a whole board, from the measured per-device calibration + its band.
 */
export function DeviceMeter() {
  const spine = useSkeletonStore((s) => s.spine);
  const status = useSkeletonStore((s) => s.status);

  const [measured, setMeasured] = useState<{
    spineMs: number;
    frameMs: number;
    gpuMs: number | null;
  } | null>(null);
  const [work, setWork] = useState<Work | null>(null);
  const [groups, setGroups] = useState<GroupPrediction[]>([]);

  useEffect(() => {
    if (status !== "ready" || !spine) {
      setMeasured(null);
      setWork(null);
      setGroups([]);
      return;
    }
    const sample = () => {
      const m = stage.getMeasuredMs();
      // cpuMs is the SPINE-isolated cost (spineProfile is on); frameCpuMs is
      // the whole tick including the workbench's grid/camera/filter chrome.
      setMeasured(m ? { spineMs: m.cpuMs, frameMs: m.frameCpuMs, gpuMs: m.gpuMs } : null);
      setWork(stage.getFrameWork() ?? null);
      const walkable = spine.skeleton as unknown as WalkableSkeleton;
      const coverage = estimatePoseCoverage(walkable, { scale: 1 });
      setGroups(predictGroups(measureFrameFeatures(spine.skeleton, coverage)));
    };
    sample();
    const id = window.setInterval(sample, 250);
    return () => window.clearInterval(id);
  }, [spine, status]);

  if (status !== "ready" || !spine) return null;

  return (
    <div className="pointer-events-auto absolute left-4 top-4 z-40 w-60 rounded-xl border border-border bg-card/80 px-3 py-2.5 shadow-xl backdrop-blur-md">
      {/* 1. THE number: this spine's own cost, measured */}
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium text-foreground">This spine</span>
        <span className="text-[10px] text-muted-foreground/60">measured here</span>
      </div>
      {measured ? (
        <div className="mt-0.5 flex items-baseline gap-1">
          <span className="text-xl font-semibold leading-none tabular-nums text-foreground">
            {fmt(measured.spineMs)}
          </span>
          <span className="text-xs text-muted-foreground">ms / frame</span>
        </div>
      ) : (
        <span className="text-[10px] text-muted-foreground/50">measuring...</span>
      )}

      {/* 2. context: the whole canvas frame + real GPU where available */}
      {measured && (
        <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] tabular-nums text-muted-foreground/70">
          <span title="everything this canvas does per frame, including the workbench's own grid, camera and filters">
            whole frame {fmt(measured.frameMs)} ms
          </span>
          <span title="real GPU time from EXT_disjoint_timer_query - desktop browsers expose it, mobile ones do not">
            gpu{" "}
            {measured.gpuMs != null ? (
              `${fmt(measured.gpuMs)} ms`
            ) : (
              <span className="text-muted-foreground/40">no timer</span>
            )}
          </span>
        </div>
      )}

      {/* 3. the work - device-invariant facts */}
      {work && (
        <div className="mt-2 border-t border-border/50 pt-1.5">
          <div className="mb-1 text-[10px] text-muted-foreground/60">
            work per frame (same on every device)
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] tabular-nums text-muted-foreground">
            <span>
              draws <span className="text-foreground">{Math.round(work.drawCalls)}</span>
            </span>
            <span>
              verts <span className="text-foreground">{compact(work.vertices)}</span>
            </span>
            <span>
              state <span className="text-foreground">{Math.round(work.stateChanges)}</span>
            </span>
            <span>
              breaks <span className="text-foreground">{Math.round(work.batchBreaks)}</span>
            </span>
            {work.stencilPasses > 0 && (
              <span>
                stencil <span className="text-amber-400">{Math.round(work.stencilPasses)}</span>
              </span>
            )}
            {work.renderTargetSwitches > 0 && (
              <span title="framebuffer switches - a tile store/load on mobile GPUs, expensive">
                RT <span className="text-amber-400">{Math.round(work.renderTargetSwitches)}</span>
              </span>
            )}
            {work.filterPasses > 0 && (
              <span>
                filters <span className="text-amber-400">{Math.round(work.filterPasses)}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* 4. estimated on real phones: one spine, and a whole board */}
      {groups.length > 0 && (
        <div className="mt-2 border-t border-border/50 pt-1.5">
          <div className="mb-1 flex items-baseline justify-between text-[10px] text-muted-foreground/60">
            <span>estimated on phones</span>
            <span>1 spine · board of {BOARD_SIZE}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            {groups.map((g) => (
              <div key={g.name} className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[10px] text-muted-foreground">{g.name}</span>
                {g.trustedCount > 0 ? (
                  <span className="shrink-0 text-[10px] tabular-nums">
                    <span className="font-medium text-foreground">
                      {span(g.perSpineMinMs, g.perSpineMaxMs)}
                    </span>
                    <span className="text-muted-foreground/40"> · </span>
                    <span className={cn("font-medium", TEXT[statusOf(g.boardMaxMs)])}>
                      {span(g.boardMinMs, g.boardMaxMs)} ms
                    </span>
                  </span>
                ) : (
                  <span className="shrink-0 text-[10px] text-muted-foreground/40">no runs</span>
                )}
              </div>
            ))}
          </div>
          {groups.some((g) => g.band != null) && (
            <div className="mt-1 text-[10px] text-muted-foreground/50">
              +-
              {Math.round(
                (groups.filter((g) => g.band != null).reduce((a, g) => a + (g.band ?? 0), 0) /
                  Math.max(1, groups.filter((g) => g.band != null).length)) *
                  100,
              )}
              % from measured runs
            </div>
          )}
        </div>
      )}
    </div>
  );
}
