import { useEffect, useState } from "react";

import { useSkeletonStore, measureFrameFeatures } from "@/entities/skeleton";
import { estimatePoseCoverage, type WalkableSkeleton } from "@spine-benchmark/metrics-impact-formula";
import { stage } from "@/widgets/stage";
import { BOARD_SIZE, predictGroups, type GroupPrediction } from "@/shared/config/calibrated-devices";
import { cn } from "@/shared/lib/utils";

const FRAME_MS = 1000 / 60;

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

const fmt = (ms: number) => (ms >= 10 ? ms.toFixed(1) : ms.toFixed(2));
const compact = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : Math.round(n).toString();

interface Work {
  drawCalls: number;
  vertices: number;
  stateChanges: number;
  batchBreaks: number;
  stencilPasses: number;
  renderTargetSwitches: number;
  filterPasses: number;
}

function range(g: GroupPrediction): string {
  if (g.maxMs - g.minMs < 0.5) return `${g.maxMs.toFixed(1)} ms`;
  return `${g.minMs.toFixed(1)}-${g.maxMs.toFixed(1)} ms`;
}

/**
 * Cost analysis panel. Three honest layers, in descending order of certainty:
 *
 *   1. THIS DEVICE - CPU and GPU milliseconds MEASURED directly (the crawler's
 *      per-frame CPU + the EXT_disjoint_timer_query GPU timer, which desktop
 *      Chrome does expose). Zero calibration, zero model: a stopwatch.
 *   2. THE WORK - draw calls, vertices, state changes, batch breaks, stencil
 *      passes, render-target switches. These are device-INVARIANT facts: the
 *      same spine issues the same work everywhere, so they explain WHY the
 *      cost is what it is and transfer to any device without a model.
 *   3. OTHER DEVICES - estimated ms from the measured per-device calibration,
 *      with its held-out error band. A model, and labelled as one.
 *
 * Deliberately NOT here: a first-principles "ops / device spec" prediction.
 * Tested against the measured fleet it fails (a universal op-cost model with
 * one speed number per device scores a NEGATIVE R2) - devices differ in their
 * work MIX, not by a single scalar. Only per-device measurement is true.
 */
export function DeviceMeter() {
  const spine = useSkeletonStore((s) => s.spine);
  const status = useSkeletonStore((s) => s.status);

  const [measured, setMeasured] = useState<{ cpuMs: number; gpuMs: number | null } | null>(null);
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
      setMeasured(m ? { cpuMs: m.frameCpuMs, gpuMs: m.gpuMs } : null);
      setWork(stage.getFrameWork() ?? null);
      const walkable = spine.skeleton as unknown as WalkableSkeleton;
      const coverage = estimatePoseCoverage(walkable, { scale: 1 });
      setGroups(predictGroups(measureFrameFeatures(spine.skeleton, coverage), BOARD_SIZE));
    };
    sample();
    const id = window.setInterval(sample, 250);
    return () => window.clearInterval(id);
  }, [spine, status]);

  if (status !== "ready" || !spine) return null;

  const cpuSt = measured ? statusOf(measured.cpuMs) : "ok";
  const gpuSt = measured?.gpuMs != null ? statusOf(measured.gpuMs) : "ok";

  return (
    <div className="pointer-events-auto absolute left-4 top-4 z-40 w-60 rounded-xl border border-border bg-card/80 px-3 py-2.5 shadow-xl backdrop-blur-md">
      {/* 1. MEASURED on this machine - the only fully certain number */}
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-medium text-foreground">This computer</span>
        <span className="text-[10px] text-muted-foreground/60">measured</span>
      </div>

      {measured ? (
        <div className="flex items-baseline gap-3">
          <span className="flex items-baseline gap-1">
            <span className="text-[10px] text-muted-foreground">CPU</span>
            <span className={cn("text-base font-semibold tabular-nums leading-none", TEXT[cpuSt])}>
              {fmt(measured.cpuMs)}
              <span className="text-[10px] font-normal"> ms</span>
            </span>
          </span>
          <span className="flex items-baseline gap-1">
            <span className="text-[10px] text-muted-foreground">GPU</span>
            {measured.gpuMs != null ? (
              <span className={cn("text-base font-semibold tabular-nums leading-none", TEXT[gpuSt])}>
                {fmt(measured.gpuMs)}
                <span className="text-[10px] font-normal"> ms</span>
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground/50">no timer</span>
            )}
          </span>
        </div>
      ) : (
        <span className="text-[10px] text-muted-foreground/50">measuring...</span>
      )}

      {/* 2. THE WORK - device-invariant facts, no model involved */}
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

      {/* 3. OTHER DEVICES - a model, labelled as one */}
      {groups.length > 0 && (
        <div className="mt-2 border-t border-border/50 pt-1.5">
          <div className="mb-1 text-[10px] text-muted-foreground/60">
            estimated CPU, ~{BOARD_SIZE}-symbol board
          </div>
          <div className="flex flex-col gap-0.5">
            {groups.map((g) => (
              <div key={g.name} className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[10px] text-muted-foreground">{g.name}</span>
                {g.trustedCount > 0 ? (
                  <span
                    className={cn("shrink-0 text-[11px] font-medium tabular-nums", TEXT[statusOf(g.maxMs)])}
                  >
                    {range(g)}
                    {g.band != null && (
                      <span className="font-normal text-muted-foreground/50">
                        {" "}
                        +-{Math.round(g.band * 100)}%
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="shrink-0 text-[10px] text-muted-foreground/40">no runs</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
