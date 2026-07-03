import { useEffect, useState } from "react";
import { Check } from "lucide-react";

import { useSkeletonStore, measureFrameFeatures } from "@/entities/skeleton";
import { estimatePoseCoverage, type WalkableSkeleton } from "@spine-benchmark/metrics-impact-formula";
import {
  predictDeviceCost,
  fetchCostModel,
  provenanceLabel,
  type CostModelTable,
  type DeviceCost,
} from "@/shared/lib/cost-budget";
import { BENCH_API } from "@/shared/config/api";
import { stage } from "@/widgets/stage";
import { useDeviceStore } from "@/entities/device";
import {
  ASSUMED_SCREEN_HEIGHT_FRACTION,
  DEVICES,
  DEVICE_KIND_ICON,
  DEVICE_KIND_LABEL,
  PORTABLE_KINDS,
  DEFAULT_BUDGET_MS,
  deviceById,
  type BudgetStatus,
  type DeviceProfile,
} from "@/shared/config/devices";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { cn } from "@/shared/lib/utils";

const STATUS_TEXT: Record<BudgetStatus, string> = {
  ok: "text-emerald-400",
  warn: "text-amber-400",
  over: "text-red-400",
};

// Portable families only - desktops are excluded from the target picker.
const KINDS = PORTABLE_KINDS;

/** Skeleton-local px -> target-device px, under the stated size assumption
 * (the skeleton rendered at a fixed fraction of the device's screen height).
 * Without a stated basis the GPU/fill prediction is meaningless. */
function coverageScaleFor(device: DeviceProfile, boundsH: number): number {
  if (!(boundsH > 0)) return 1;
  return (device.screenPx.h * ASSUMED_SCREEN_HEIGHT_FRACTION) / boundsH;
}

/**
 * Device budget meter - top-left corner. THE promise widget: for the device
 * picked in the modal, show how much time the current pose of this spine
 * takes to render THERE - predicted through the fitted per-GPU-family model,
 * scored against that device's frame budget, with provenance + error band so
 * the number is only as confident as the data behind it.
 *
 * The crawler's locally-measured ms is shown SEPARATELY, clearly labeled as
 * this-machine ground truth. It is deliberately never scored against the
 * target device's budget: an M3 Mac measurement against an iPhone budget is
 * how the meter used to lie.
 */
export function DeviceMeter() {
  const spine = useSkeletonStore((s) => s.spine);
  const status = useSkeletonStore((s) => s.status);
  const deviceId = useDeviceStore((s) => s.deviceId);
  const setDevice = useDeviceStore((s) => s.setDevice);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [cost, setCost] = useState<DeviceCost | null>(null);
  const [model, setModel] = useState<CostModelTable | null>(null);
  // this-machine measured ms (crawler.getLastFrame()) - a local reference
  // readout, NOT comparable to the target device's budget.
  const [measuredMs, setMeasuredMs] = useState<{ gpuMs: number | null; cpuMs: number } | null>(
    null,
  );

  const device = deviceById(deviceId);

  // fetch the fitted per-GPU-family cost model once; falls back to the formula
  // defaults (predictDeviceCost handles null) until one is published.
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
    if (status !== "ready" || !spine) {
      setCost(null);
      return;
    }
    const sample = () => {
      // current pose -> canonical features + geometric coverage normalized to
      // the TARGET device's screen (the stated size assumption)
      const walkable = spine.skeleton as unknown as WalkableSkeleton;
      const scale = coverageScaleFor(device, spine.getLocalBounds().height);
      const coverage = estimatePoseCoverage(walkable, { scale });
      setCost(predictDeviceCost(measureFrameFeatures(spine.skeleton, coverage), device, model ?? undefined));
      setMeasuredMs(stage.getMeasuredMs() ?? null);
    };
    sample();
    const id = window.setInterval(sample, 200);
    return () => window.clearInterval(id);
  }, [spine, status, device, model]);

  if (status !== "ready" || !spine || !cost) return null;

  const Icon = DEVICE_KIND_ICON[device.kind];
  const pct = Math.max(cost.gpuPct, cost.cpuPct);
  const provenance = provenanceLabel(cost);

  return (
    <>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        title={`${device.name} (${device.gpuFamily}) - predicted for this device: CPU ${cost.cpuMs.toFixed(2)}ms (${Math.round(cost.cpuPct * 100)}% of ${cost.budgetMs.cpu}ms), GPU ${cost.gpuMs.toFixed(2)}ms (${Math.round(cost.gpuPct * 100)}% of ${cost.budgetMs.gpu}ms); binding: ${cost.binding.toUpperCase()}. Assumes the skeleton at ${Math.round(ASSUMED_SCREEN_HEIGHT_FRACTION * 100)}% of the device's screen height. Model: ${provenance}. Budget source: ${cost.budgetSource}. Click to change device`}
        className="pointer-events-auto absolute left-4 top-4 z-40 flex flex-col items-start gap-0.5 transition-opacity hover:opacity-75"
      >
        <span className="flex items-center gap-1.5">
          <Icon className={cn("size-4", STATUS_TEXT[cost.status])} />
          <span className={cn("text-sm font-semibold tabular-nums", STATUS_TEXT[cost.status])}>
            {(cost.gpuMs + cost.cpuMs).toFixed(2)}ms
          </span>
          <span className="text-[11px] uppercase tabular-nums text-muted-foreground">
            {cost.binding} {Math.round(pct * 100)}% of frame
          </span>
        </span>
        <span className="pl-[22px] text-[10px] tabular-nums text-muted-foreground/80">
          cpu {cost.cpuMs.toFixed(2)} · gpu {cost.gpuMs.toFixed(2)} · {provenance}
        </span>
        {measuredMs && (
          <span
            className="pl-[22px] text-[10px] tabular-nums text-muted-foreground/50"
            title="Ground truth measured by the crawler on THIS machine - shown for reference, never scored against the target device's budget"
          >
            this machine: cpu {measuredMs.cpuMs.toFixed(2)}
            {measuredMs.gpuMs != null ? ` · gpu ${measuredMs.gpuMs.toFixed(2)}` : " · no gpu timer"}
          </span>
        )}
      </button>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Target device</DialogTitle>
            <DialogDescription>
              The meter predicts how many milliseconds the current pose costs
              on the selected device, assuming the skeleton at{" "}
              {Math.round(ASSUMED_SCREEN_HEIGHT_FRACTION * 100)}% of its screen
              height.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {KINDS.map((kind) => {
              const KindIcon = DEVICE_KIND_ICON[kind];
              return (
                <div key={kind}>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                    <KindIcon className="size-3.5" />
                    {DEVICE_KIND_LABEL[kind]}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {DEVICES.filter((d) => d.kind === kind).map((d) => {
                      const selected = d.id === deviceId;
                      const budget =
                        model?.budgetByFamily?.[d.gpuFamily] ?? model?.budgetMs ?? DEFAULT_BUDGET_MS;
                      const fitted = !!model?.byFamily?.[d.gpuFamily];
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setDevice(d.id);
                            setPickerOpen(false);
                          }}
                          className={cn(
                            "relative flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors hover:bg-accent",
                            selected
                              ? "border-primary/60 bg-accent/60"
                              : "border-border bg-card/50",
                          )}
                        >
                          {selected && (
                            <Check className="absolute right-2 top-2 size-3.5 text-primary" />
                          )}
                          <span className="text-sm font-medium leading-tight">
                            {d.name}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {d.example}
                          </span>
                          <span className="mt-1 text-[10px] tabular-nums text-muted-foreground/70">
                            budget {budget.cpu}ms cpu / {budget.gpu}ms gpu
                            {fitted ? " · fitted" : " · estimate"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
