import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import {
  useSkeletonStore,
  analyzeAnimations,
  measureAnimationCostCurves,
  type AnimationCostCurve,
} from "@/entities/skeleton";
import { useDeviceStore } from "@/entities/device";
import {
  ASSUMED_SCREEN_HEIGHT_FRACTION,
  DEFAULT_BUDGET_MS,
  budgetStatus,
  deviceById,
  type BudgetStatus,
} from "@/shared/config/devices";
import { cn } from "@/shared/lib/utils";
import {
  fetchCostModel,
  isCostTrusted,
  predictDeviceCost,
  scoreAgainstBudget,
  type CostModelTable,
} from "@/shared/lib/cost-budget";
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
const SPARK_STROKE: Record<BudgetStatus, string> = {
  ok: "stroke-emerald-400/80",
  warn: "stroke-amber-400/80",
  over: "stroke-red-400/80",
};

function Chip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground"
    >
      {children}
    </span>
  );
}

/** Tiny ms(t) sparkline of one animation's predicted cost curve. */
function CostSparkline({ curve, status }: { curve: AnimationCostCurve; status: BudgetStatus }) {
  const w = 120;
  const h = 20;
  const max = Math.max(0.001, ...curve.samples.map((s) => s.totalMs));
  const pts = curve.samples
    .map((s, i) => {
      const x = (i / Math.max(1, curve.samples.length - 1)) * w;
      const y = h - (s.totalMs / max) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0"
      aria-label="predicted cost across the timeline"
    >
      <polyline points={pts} fill="none" strokeWidth="1.5" className={SPARK_STROKE[status]} />
    </svg>
  );
}

/**
 * Animations tool. For every animation, the PRIMARY reading is the predicted
 * cost on the SELECTED device: ms(t) across the timeline through the fitted
 * per-family model (sparkline), with the worst moment called out ("peak 7.1ms
 * @ 0:04, GPU-bound") and scored against that device's frame budget.
 *
 * The stage also plays each animation once and reports the REAL measured ms
 * on THIS machine - shown as a reference chip, deliberately never scored
 * against the target device's budget (a workstation measurement against a
 * phone budget is a lie).
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
  const [modelLoaded, setModelLoaded] = useState(false);
  const [results, setResults] = useState<Map<string, AnimationMeasurement>>(new Map());
  const [progress, setProgress] = useState<{ name: string; index: number; total: number } | null>(
    null,
  );

  useEffect(() => {
    let live = true;
    void fetchCostModel(BENCH_API).then((m) => {
      if (live) {
        setModel(m);
        setModelLoaded(true);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  // predicted ms(t) curves on the selected device (recomputed when the device
  // or the fitted model changes; waits for the model fetch to settle so the
  // first paint isn't placeholder-weight predictions)
  const curves = useMemo(() => {
    if (!spine || !modelLoaded) return new Map<string, AnimationCostCurve>();
    const boundsH = spine.getLocalBounds().height;
    const scale = boundsH > 0 ? (device.screenPx.h * ASSUMED_SCREEN_HEIGHT_FRACTION) / boundsH : 1;
    return measureAnimationCostCurves(
      spine,
      (features) => {
        const c = predictDeviceCost(features, device, model ?? undefined);
        return { gpuMs: c.gpuMs, cpuMs: c.cpuMs };
      },
      scale,
    );
  }, [spine, device, model, modelLoaded]);

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
  // Is the SELECTED device's GPU family calibrated with a tight-error fit? If
  // not, the predicted per-device ms/curves are placeholder guesses and must
  // NOT be shown as the primary number - the real measured-on-this-machine cost
  // is what's shown instead.
  const deviceTrusted = isCostTrusted(
    predictDeviceCost(
      { vertices: 0, nonNormalBlends: 0, clippingMasks: 0, meshes: 0, weightedMeshes: 0, deformedMeshes: 0, ik: 0, transform: 0, path: 0, physics: 0, drawCallEst: 0, coveredKpx: 0, overdrawFactor: 1 },
      device,
      model ?? undefined,
    ),
  );

  const rows = animations
    .map((a) => {
      const curve = curves.get(a.name);
      const scored = curve ? scoreAgainstBudget(curve.peak.gpuMs, curve.peak.cpuMs, budget) : null;
      const m = results.get(a.name);
      // rank/scale by the number we actually trust: predicted % on a calibrated
      // device, else the measured max-CPU on THIS machine.
      const primary = deviceTrusted && scored ? Math.max(scored.gpuPct, scored.cpuPct) : m ? m.maxCpuMs : 0;
      return { anim: a, curve, scored, measurement: m, primary };
    })
    .sort((a, b) => b.primary - a.primary);

  const maxPrimary = Math.max(0.001, ...rows.map((r) => r.primary));

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
              {animations.length} animation{animations.length === 1 ? "" : "s"} ·{" "}
              {deviceTrusted
                ? `predicted on ${device.name} at ${Math.round(ASSUMED_SCREEN_HEIGHT_FRACTION * 100)}% screen height`
                : `measured on this computer (${device.name} not calibrated)`}{" "}
              · heaviest first.
              {progress && (
                <span className="ml-2 inline-flex items-center gap-1 text-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  measuring locally: {progress.name} ({progress.index + 1}/{progress.total})
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

              {rows.map(({ anim: a, curve, scored, measurement: m, primary }) => {
                const pct = scored ? Math.max(scored.gpuPct, scored.cpuPct) : 0;
                const status = deviceTrusted && scored ? budgetStatus(pct) : "ok";
                const barWidth = Math.min(100, (primary / maxPrimary) * 100);
                return (
                  <div key={a.name} className="rounded-xl border border-border bg-card/50 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{a.name}</span>
                      <Chip>{a.duration.toFixed(2)}s</Chip>

                      {deviceTrusted ? (
                        /* calibrated device: the predicted peak is trustworthy */
                        curve && scored ? (
                          <span
                            title={`worst sampled moment on ${device.name}: cpu ${curve.peak.cpuMs.toFixed(2)}ms + gpu ${curve.peak.gpuMs.toFixed(2)}ms at t=${curve.peak.t.toFixed(2)}s`}
                            className={cn(
                              "rounded-md border bg-secondary/40 px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                              BAR_CHIP[status],
                            )}
                          >
                            peak {curve.peak.totalMs.toFixed(2)}ms @ {curve.peak.t.toFixed(2)}s ·{" "}
                            {scored.binding}-bound · {(pct * 100).toFixed(0)}% of budget
                          </span>
                        ) : (
                          <Chip>predicting…</Chip>
                        )
                      ) : /* uncalibrated: only the measured-on-this-machine cost is real */ m ? (
                        <span
                          title={`REAL frames measured on THIS computer (not ${device.name}): avg ${m.avgCpuMs.toFixed(2)}ms · p95 ${m.p95CpuMs.toFixed(2)}ms · max ${m.maxCpuMs.toFixed(2)}ms CPU over ${m.frames} frames`}
                          className="rounded-md border border-border bg-secondary/40 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-foreground"
                        >
                          {m.avgCpuMs.toFixed(2)}ms avg · {m.maxCpuMs.toFixed(2)}ms peak
                          <span className="ml-1 font-normal text-muted-foreground/60">on this computer</span>
                        </span>
                      ) : (
                        <Chip>measuring…</Chip>
                      )}

                      <span className="flex-1" />
                      {deviceTrusted && curve && <CostSparkline curve={curve} status={status} />}
                    </div>

                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary/50">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          deviceTrusted ? BAR_FILL[status] : "bg-muted-foreground/40",
                        )}
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
