import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  useSkeletonStore,
  measureFrameFeatures,
  analyzeDrawCalls,
} from "@/entities/skeleton";
import { useDeviceStore } from "@/entities/device";
import {
  estimatePoseCoverage,
  type WalkableSkeleton,
} from "@spine-benchmark/metrics-impact-formula";
import {
  predictDeviceCost,
  fetchCostModel,
  isCostTrusted,
  type CostModelTable,
} from "@/shared/lib/cost-budget";
import { stage } from "@/widgets/stage";
import { BENCH_API } from "@/shared/config/api";
import {
  ASSUMED_SCREEN_HEIGHT_FRACTION,
  DEVICES,
  DEFAULT_BUDGET_MS,
  deviceById,
  type BudgetStatus,
  type DeviceProfile,
} from "@/shared/config/devices";
import { cn } from "@/shared/lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/shared/ui/drawer";

const STATUS_TEXT: Record<BudgetStatus, string> = {
  ok: "text-emerald-400",
  warn: "text-amber-400",
  over: "text-red-400",
};
const STATUS_BAR: Record<BudgetStatus, string> = {
  ok: "bg-emerald-400/70",
  warn: "bg-amber-400/70",
  over: "bg-red-400/70",
};

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-base font-semibold leading-tight tabular-nums">
        {value}
        {sub ? <span className="ml-1 text-[10px] font-normal text-muted-foreground">{sub}</span> : null}
      </div>
    </div>
  );
}

/**
 * Metrics tool - a bottom drawer. Two sections: a compact structural summary
 * (what the skeleton IS) and a per-device cost table (what it COSTS), the same
 * fitted-ms prediction the top-left meter shows, across every target device so
 * you see at a glance where this skeleton is cheap and where it is hot.
 */
export function InfoDrawer() {
  const navigate = useNavigate();
  const spine = useSkeletonStore((s) => s.spine);
  const status = useSkeletonStore((s) => s.status);
  const meta = useSkeletonStore((s) => s.meta);
  const selectedId = useDeviceStore((s) => s.deviceId);
  const selected = deviceById(selectedId);

  const [open, setOpen] = useState(true);
  const [model, setModel] = useState<CostModelTable | null>(null);
  const [measured, setMeasured] = useState<{
    spineMs: number | null;
    frameCpuMs: number;
  } | null>(null);

  useEffect(() => {
    let live = true;
    void fetchCostModel(BENCH_API).then((m) => live && setModel(m));
    const id = window.setInterval(() => {
      const m = stage.getMeasuredMs();
      // spineMs is STRICTLY the skeleton's own cost - never the whole tick,
      // which is mostly the workbench's grid/camera/filters.
      if (m) setMeasured({ spineMs: m.spineMs, frameCpuMs: m.frameCpuMs });
    }, 300);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, []);

  // structural summary of the current skeleton (live pose). Counts come from
  // the canonical walker so meshes/vertices match what the cost model sees.
  const structure = useMemo(() => {
    if (!spine) return null;
    const sk = spine.skeleton;
    const f = measureFrameFeatures(sk);
    const dc = analyzeDrawCalls(spine);
    const b = spine.getLocalBounds();
    return {
      bones: sk.bones.length,
      slots: sk.slots.length,
      skins: sk.data.skins.length,
      animations: sk.data.animations.length,
      meshes: f.meshes,
      vertices: Math.round(f.vertices),
      drawCalls: dc.total,
      wasted: Math.max(0, dc.total - dc.minPossible),
      constraints: f.ik + f.transform + f.path + f.physics,
      w: Math.round(b.width),
      h: Math.round(b.height),
    };
  }, [spine]);

  // predicted cost per device for the current pose (coverage scaled per screen)
  const perDevice = useMemo(() => {
    if (!spine) return [];
    const boundsH = spine.getLocalBounds().height;
    return DEVICES.map((d: DeviceProfile) => {
      const scale = boundsH > 0 ? (d.screenPx.h * ASSUMED_SCREEN_HEIGHT_FRACTION) / boundsH : 1;
      const coverage = estimatePoseCoverage(spine.skeleton as unknown as WalkableSkeleton, { scale });
      const cost = predictDeviceCost(measureFrameFeatures(spine.skeleton, coverage), d, model ?? undefined);
      const budget = model?.budgetByFamily?.[d.gpuFamily] ?? model?.budgetMs ?? DEFAULT_BUDGET_MS;
      return { d, cost, budget, pct: Math.round(Math.max(cost.gpuPct, cost.cpuPct) * 100) };
    });
  }, [spine, model]);

  const anyCalibrated = perDevice.some((x) => isCostTrusted(x.cost));

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
          <DrawerHeader className="pb-2">
            <DrawerTitle>{meta?.name ?? "Metrics"}</DrawerTitle>
            <DrawerDescription>
              What this skeleton is (measured), and what it costs per device
              (shown only for calibrated GPU families).
            </DrawerDescription>
          </DrawerHeader>

          {status === "ready" && structure && (
            <div className="max-h-[52vh] overflow-y-auto px-4 pb-6">
              {/* structural summary - compact */}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                <Stat label="Bones" value={structure.bones} />
                <Stat label="Slots" value={structure.slots} />
                <Stat label="Meshes" value={structure.meshes} />
                <Stat label="Vertices" value={structure.vertices} />
                <Stat label="Constraints" value={structure.constraints} />
                <Stat label="Skins" value={structure.skins} />
                <Stat label="Animations" value={structure.animations} />
                <Stat
                  label="Draw calls"
                  value={structure.drawCalls}
                  sub={structure.wasted > 0 ? `${structure.wasted} avoidable` : "optimal"}
                />
                <Stat label="Bounds" value={`${structure.w}x${structure.h}`} sub="px" />
              </div>

              {/* measured on THIS machine - the one number that is real today */}
              <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-card/40 px-3 py-2">
                <span className="text-[11px] text-muted-foreground">
                  Measured on this computer
                  <span className="text-muted-foreground/50"> (not the phone)</span>
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {!measured
                    ? "measuring..."
                    : measured.spineMs != null
                      ? `${measured.spineMs.toFixed(3)} ms spine`
                      : "spine profiler off"}
                  {measured && (
                    <span
                      className="ml-1 text-[10px] font-normal text-muted-foreground/50"
                      title="the whole canvas frame - your spine PLUS the workbench's own grid, camera and filters"
                    >
                      frame {measured.frameCpuMs.toFixed(2)}
                    </span>
                  )}
                </span>
              </div>

              {/* cost by device - only trustworthy (calibrated) rows carry a number */}
              <div className="mt-4 mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Predicted cost by device
                </span>
                <span className="text-[10px] text-muted-foreground/70">calibrated families only</span>
              </div>
              {anyCalibrated ? (
                <div className="overflow-hidden rounded-xl border border-border">
                  {perDevice.map(({ d, cost, pct }, i) => {
                    const trusted = isCostTrusted(cost);
                    return (
                      <div
                        key={d.id}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2",
                          i > 0 && "border-t border-border",
                          d.id === selected.id && "bg-primary/5",
                        )}
                      >
                        <div className="w-28 shrink-0">
                          <div className="truncate text-xs font-medium">{d.name}</div>
                          <div className="truncate text-[10px] text-muted-foreground">{d.gpuFamily}</div>
                        </div>
                        {trusted ? (
                          <>
                            <div className="min-w-0 flex-1">
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/50">
                                <div
                                  className={cn("h-full rounded-full", STATUS_BAR[cost.status])}
                                  style={{ width: `${Math.min(100, pct)}%` }}
                                />
                              </div>
                            </div>
                            <div className="hidden w-40 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground sm:block">
                              cpu {cost.cpuMs.toFixed(2)} · gpu {cost.gpuMs.toFixed(2)}
                            </div>
                            <div className={cn("w-24 shrink-0 text-right text-xs font-semibold tabular-nums", STATUS_TEXT[cost.status])}>
                              {pct}% {cost.binding}
                            </div>
                          </>
                        ) : (
                          <div className="flex-1 text-right text-[11px] text-muted-foreground/40">
                            not calibrated
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 px-3 py-3 text-[11px] leading-snug text-amber-200/80">
                  No device is calibrated yet, so there is no trustworthy per-device
                  prediction to show. Collect benchmark runs for a GPU family and its
                  cost appears here. Until then, only the measured-on-this-computer
                  number above is real.
                </div>
              )}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
