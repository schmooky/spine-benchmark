import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { useSkeletonStore, analyzeAnimations } from "@/entities/skeleton";
import { useDeviceStore } from "@/entities/device";
import {
  budgetStatus,
  deviceById,
  DEFAULT_BUDGET_MS,
  type BudgetStatus,
} from "@/shared/config/devices";
import { cn } from "@/shared/lib/utils";
import { fetchCostModel, scoreAgainstBudget, type CostModelTable } from "@/shared/lib/cost-budget";
import { BENCH_API } from "@/shared/config/api";
import { stage, type AnimationMeasurement } from "@/widgets/stage";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/shared/ui/drawer";

const BAR_CHIP: Record<BudgetStatus, string> = {
  ok: "border-emerald-400/40 text-emerald-400",
  warn: "border-amber-400/50 text-amber-400",
  over: "border-red-400/60 text-red-400",
};
const BAR_FILL: Record<BudgetStatus, string> = {
  ok: "bg-emerald-400/70",
  warn: "bg-amber-400/70",
  over: "bg-red-400/70",
};

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
      {children}
    </span>
  );
}

/**
 * Animations tool - a bottom shadcn Drawer that PLAYS every animation on the
 * live stage in turn (stage-controller.measureAnimations) and plots each
 * one's REAL measured cost (avg/p95/max CPU ms, avg GPU ms when a timer is
 * available) against the selected device's budget - not a static
 * keyframe-density heatmap and not a synthetic RI/CI pose estimate.
 * Auto-runs once when the drawer opens; the stage returns to its normal
 * static setup pose when the pass finishes.
 */
export function AnimationsDrawer() {
  const navigate = useNavigate();
  const spine = useSkeletonStore((s) => s.spine);
  const animations = useMemo(
    () => (spine ? analyzeAnimations(spine) : []),
    [spine],
  );
  const device = deviceById(useDeviceStore((s) => s.deviceId));

  const [open, setOpen] = useState(true);
  const [model, setModel] = useState<CostModelTable | null>(null);
  const [results, setResults] = useState<Map<string, AnimationMeasurement>>(new Map());
  const [progress, setProgress] = useState<{ name: string; index: number; total: number } | null>(
    null,
  );

  useEffect(() => {
    let live = true;
    void fetchCostModel(BENCH_API).then((m) => {
      if (live) setModel(m);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!spine || animations.length === 0) {
      setResults(new Map());
      return;
    }
    let cancelled = false;
    const entries = animations.map((a) => ({ name: a.name, durationSec: a.duration }));
    setProgress({ name: entries[0]!.name, index: 0, total: entries.length });
    void stage
      .measureAnimations(entries, (name, index, total) => {
        if (!cancelled) setProgress({ name, index, total });
      })
      .then((measured) => {
        if (!cancelled) {
          setResults(measured);
          setProgress(null);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spine, animations.length]);

  const famBudget = model?.budgetByFamily?.[device.gpuFamily];
  const budget = famBudget ?? model?.budgetMs ?? DEFAULT_BUDGET_MS;

  const rows = animations
    .map((a) => {
      const m = results.get(a.name);
      const scored = m ? scoreAgainstBudget(m.avgGpuMs, m.avgCpuMs, budget) : null;
      return { anim: a, measurement: m, scored };
    })
    .sort((a, b) => {
      const av = a.scored ? Math.max(a.scored.gpuPct, a.scored.cpuPct) : -1;
      const bv = b.scored ? Math.max(b.scored.gpuPct, b.scored.cpuPct) : -1;
      return bv - av;
    });

  const maxPct = Math.max(0.001, ...rows.map((r) => (r.scored ? Math.max(r.scored.gpuPct, r.scored.cpuPct) : 0)));

  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      onAnimationEnd={(o) => {
        if (!o) navigate("/");
      }}
    >
      <DrawerContent>
        <div className="mx-auto w-full max-w-3xl">
          <DrawerHeader>
            <DrawerTitle>Animations</DrawerTitle>
            <DrawerDescription>
              {animations.length} animation{animations.length === 1 ? "" : "s"} · real measured
              cost on {device.name}, sorted heaviest first.
              {progress && (
                <span className="ml-2 inline-flex items-center gap-1 text-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  measuring {progress.name} ({progress.index + 1}/{progress.total})
                </span>
              )}
            </DrawerDescription>
          </DrawerHeader>

          <div className="max-h-[58vh] overflow-y-auto px-4 pb-6">
            <div className="flex flex-col gap-2">
              {animations.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  This skeleton has no animations.
                </p>
              )}

              {rows.map(({ anim: a, measurement: m, scored }) => {
                const status = scored ? budgetStatus(Math.max(scored.gpuPct, scored.cpuPct)) : "ok";
                const pct = scored ? Math.max(scored.gpuPct, scored.cpuPct) : 0;
                const barWidth = Math.min(100, (pct / maxPct) * 100);
                return (
                  <div key={a.name} className="rounded-xl border border-border bg-card/50 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{a.name}</span>
                      <Chip>{a.duration.toFixed(2)}s</Chip>
                      {m ? (
                        <span
                          title={`avg ${m.avgCpuMs.toFixed(2)}ms · p95 ${m.p95CpuMs.toFixed(2)}ms · max ${m.maxCpuMs.toFixed(2)}ms CPU${m.avgGpuMs != null ? ` · avg ${m.avgGpuMs.toFixed(2)}ms GPU` : " · no GPU timer on this device"} over ${m.frames} real frames`}
                          className={cn(
                            "rounded-md border bg-secondary/40 px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                            BAR_CHIP[status],
                          )}
                        >
                          {m.avgCpuMs.toFixed(2)}ms avg · {(pct * 100).toFixed(0)}% of budget
                        </span>
                      ) : (
                        <Chip>measuring…</Chip>
                      )}
                      <span className="flex-1" />
                      <Chip>{a.timelineCount} timelines</Chip>
                      <Chip>{a.keyCount} keys</Chip>
                      {a.eventCount > 0 && <Chip>{a.eventCount} events</Chip>}
                    </div>

                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary/50">
                      <div
                        className={cn("h-full rounded-full transition-all", BAR_FILL[status])}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
