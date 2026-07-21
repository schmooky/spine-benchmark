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
  provenanceLabel,
  type CostModelTable,
} from "@/shared/lib/cost-budget";
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

  useEffect(() => {
    let live = true;
    void fetchCostModel(BENCH_API).then((m) => live && setModel(m));
    return () => {
      live = false;
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

  const provenance = perDevice[0] ? provenanceLabel(perDevice[0].cost) : "";

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
              What this skeleton is, and what it costs per device -{" "}
              {provenance || "predicted"} at{" "}
              {Math.round(ASSUMED_SCREEN_HEIGHT_FRACTION * 100)}% screen height.
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

              {/* cost by device */}
              <div className="mt-4 mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Cost by device
                </span>
                <span className="text-[10px] text-muted-foreground/70">
                  predicted ms / frame, binding axis
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-border">
                {perDevice.map(({ d, cost, pct }, i) => (
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

                    {/* budget bar */}
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
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-snug text-muted-foreground/60">
                Budget {DEFAULT_BUDGET_MS.cpu}ms cpu / {DEFAULT_BUDGET_MS.gpu}ms gpu per frame unless a
                fitted per-family ceiling exists. Local machine measurement is shown in the top-left meter.
              </p>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
