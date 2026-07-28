import { useEffect, useState } from "react";

import { useSkeletonStore, measureFrameFeatures } from "@/entities/skeleton";
import { estimatePoseCoverage, type WalkableSkeleton } from "@spine-benchmark/metrics-impact-formula";
import { stage } from "@/widgets/stage";
import { BOARD_SIZE, predictGroups, type GroupPrediction } from "@/shared/config/calibrated-devices";
import { cn } from "@/shared/lib/utils";

/** A 60fps frame is 16.67ms; colour the tier's WORST case against it. */
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
const BAR: Record<Status, string> = {
  ok: "bg-emerald-400/70",
  warn: "bg-amber-400/70",
  over: "bg-red-400/70",
};

function fmt(ms: number): string {
  return ms >= 10 ? ms.toFixed(0) : ms.toFixed(1);
}

/** "5-9 ms" or "6 ms" when the tier's spread is tight. */
function range(g: GroupPrediction): string {
  if (g.maxMs - g.minMs < 0.5) return `${fmt(g.maxMs)} ms`;
  return `${fmt(g.minMs)}-${fmt(g.maxMs)} ms`;
}

/**
 * Device meter (top-left). Shows, for the dropped spine, the estimated
 * per-frame CPU cost across each DEVICE TIER as a range - predicted from the
 * measured per-device calibration, with the models' held-out error band. It is
 * a synthetic estimate (not a live phone), so every tier carries its +/-.
 *
 * The always-real ground truth - the spine measured on THIS computer - sits at
 * the bottom, clearly labelled as this machine.
 */
export function DeviceMeter() {
  const spine = useSkeletonStore((s) => s.spine);
  const status = useSkeletonStore((s) => s.status);

  const [groups, setGroups] = useState<GroupPrediction[]>([]);
  const [measured, setMeasured] = useState<number | null>(null);

  useEffect(() => {
    if (status !== "ready" || !spine) {
      setGroups([]);
      return;
    }
    const sample = () => {
      const walkable = spine.skeleton as unknown as WalkableSkeleton;
      const coverage = estimatePoseCoverage(walkable, { scale: 1 });
      const features = measureFrameFeatures(spine.skeleton, coverage);
      setGroups(predictGroups(features, BOARD_SIZE));
      setMeasured(stage.getMeasuredMs()?.frameCpuMs ?? null);
    };
    sample();
    const id = window.setInterval(sample, 200);
    return () => window.clearInterval(id);
  }, [spine, status]);

  if (status !== "ready" || !spine || groups.length === 0) return null;

  return (
    <div className="pointer-events-auto absolute left-4 top-4 z-40 w-60 rounded-xl border border-border bg-card/80 px-3 py-2.5 shadow-xl backdrop-blur-md">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11px] font-medium text-foreground">Est. cost / frame</span>
        <span className="text-[10px] text-muted-foreground/60">~{BOARD_SIZE}-symbol board · CPU</span>
      </div>

      <div className="flex flex-col gap-2">
        {groups.map((g) => {
          const st = statusOf(g.maxMs);
          const bandPct = g.band != null ? Math.round(g.band * 100) : null;
          const worstPct = Math.min(100, (g.maxMs / FRAME_MS) * 100);
          return (
            <div key={g.name}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[11px] text-muted-foreground">{g.name}</span>
                {g.trustedCount > 0 ? (
                  <span className={cn("shrink-0 text-xs font-semibold tabular-nums", TEXT[st])}>
                    {range(g)}
                    {bandPct != null && (
                      <span className="font-normal text-muted-foreground/60"> +-{bandPct}%</span>
                    )}
                  </span>
                ) : (
                  <span className="shrink-0 text-[10px] text-muted-foreground/50">no clean runs</span>
                )}
              </div>
              {g.trustedCount > 0 && (
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-secondary/50">
                  <div
                    className={cn("h-full rounded-full", BAR[st])}
                    style={{ width: `${worstPct}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 border-t border-border/50 pt-1.5 text-[10px] tabular-nums text-muted-foreground/70">
        {measured != null ? (
          <>measured here (this computer): {measured.toFixed(1)} ms</>
        ) : (
          <span className="text-muted-foreground/50">measuring on this computer...</span>
        )}
      </div>
    </div>
  );
}
