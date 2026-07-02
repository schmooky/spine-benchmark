import { useEffect, useState } from "react";
import { Check } from "lucide-react";

import {
  useSkeletonStore,
  measureFrameImpact,
  measureFrameFeatures,
  type FrameImpact,
} from "@/entities/skeleton";
import {
  predictDeviceCost,
  fetchCostModel,
  scoreAgainstBudget,
  type CostModelTable,
  type DeviceCost,
} from "@/shared/lib/cost-budget";
import { BENCH_API } from "@/shared/config/api";
import { stage } from "@/widgets/stage";
import { useDeviceStore } from "@/entities/device";
import {
  DEVICES,
  DEVICE_KIND_ICON,
  DEVICE_KIND_LABEL,
  PORTABLE_KINDS,
  budgetStatus,
  deviceById,
  type BudgetStatus,
} from "@/shared/config/devices";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { cn } from "@/shared/lib/utils";
import { budgetHeadroom, formatBudgetPct } from "@/shared/lib/format";

const STATUS_TEXT: Record<BudgetStatus, string> = {
  ok: "text-emerald-400",
  warn: "text-amber-400",
  over: "text-red-400",
};

// Portable families only - desktops are excluded from the target picker.
const KINDS = PORTABLE_KINDS;

/**
 * Device budget meter - top-left corner. Shows the chosen target device and
 * how much of its impact budget (canonical RI+CI units) the current frame
 * eats, as a traffic-light percentage: the animator's one-glance "is this
 * okay right now". Click to pick a different device in a dialog. Budgets are
 * first-pass estimates, to be calibrated per device later.
 */
export function DeviceMeter() {
  const spine = useSkeletonStore((s) => s.spine);
  const status = useSkeletonStore((s) => s.status);
  const deviceId = useDeviceStore((s) => s.deviceId);
  const setDevice = useDeviceStore((s) => s.setDevice);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [frame, setFrame] = useState<FrameImpact | null>(null);
  const [cost, setCost] = useState<DeviceCost | null>(null);
  const [model, setModel] = useState<CostModelTable | null>(null);
  // ACTUAL measured ms of the last rendered frame (crawler.getLastFrame()),
  // not a prediction from skeleton features - this is what the meter shows
  // whenever it is available.
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
      setFrame(null);
      setCost(null);
      return;
    }
    const sample = () => {
      setFrame(measureFrameImpact(spine.skeleton));
      // predicted GPU/CPU ms vs this device's ms budget (thesis #6/#7),
      // using the fitted per-family model when available
      setCost(predictDeviceCost(measureFrameFeatures(spine.skeleton), device, model ?? undefined));
      // ACTUAL measured ms from the stage crawler's last rendered frame.
      setMeasuredMs(stage.getMeasuredMs() ?? null);
    };
    sample();
    const id = window.setInterval(sample, 200);
    return () => window.clearInterval(id);
  }, [spine, status, device, model]);

  if (status !== "ready" || !spine || !frame || !cost) return null;

  const fraction = frame.total / device.capacity;
  const Icon = DEVICE_KIND_ICON[device.kind];

  // Prefer the crawler's ACTUAL measured frame ms over the skeleton-feature
  // prediction whenever a live frame is available (basically always - the
  // crawler is mounted headlessly on this same stage). Scored against the
  // SAME resolved budget predictDeviceCost used, so "measured" and
  // "predicted" read on one consistent scale.
  const measuredScored = measuredMs
    ? scoreAgainstBudget(measuredMs.gpuMs ?? 0, measuredMs.cpuMs, cost.budgetMs)
    : null;
  const isMeasured = measuredScored != null;
  const binding = isMeasured ? measuredScored.binding : cost.binding;
  const bindingMs = isMeasured
    ? binding === "gpu"
      ? (measuredMs!.gpuMs ?? measuredMs!.cpuMs)
      : measuredMs!.cpuMs
    : cost.binding === "gpu"
      ? cost.gpuMs
      : cost.cpuMs;
  const pct = isMeasured
    ? Math.max(measuredScored.gpuPct, measuredScored.cpuPct)
    : Math.max(cost.gpuPct, cost.cpuPct);
  const state: BudgetStatus = isMeasured ? measuredScored.status : cost.status;

  return (
    <>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        title={`${device.name} (${device.gpuFamily}) - ${isMeasured ? "MEASURED" : "predicted (no live frame yet)"}: GPU ${(measuredMs?.gpuMs ?? cost.gpuMs).toFixed(2)}ms, CPU ${(measuredMs?.cpuMs ?? cost.cpuMs).toFixed(2)}ms; binding: ${binding.toUpperCase()} at ${Math.round(pct * 100)}% of ${cost.budgetSource} device capacity${measuredMs?.gpuMs == null ? " (no GPU timer on this device - CPU only)" : ""} - click to change device`}
        className="pointer-events-auto absolute left-4 top-4 z-40 flex items-center gap-1.5 transition-opacity hover:opacity-75"
      >
        <Icon className={cn("size-4", STATUS_TEXT[state])} />
        <span className={cn("text-sm font-semibold tabular-nums", STATUS_TEXT[state])}>
          {bindingMs.toFixed(2)}ms
        </span>
        <span className="text-[11px] uppercase tabular-nums text-muted-foreground">
          {binding} {Math.round(pct * 100)}%
        </span>
        {!isMeasured && (
          <span className="text-[11px] tabular-nums text-muted-foreground/70" title="No live crawler frame yet - showing a prediction from skeleton features">
            (predicted)
          </span>
        )}
      </button>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Target device</DialogTitle>
            <DialogDescription>
              The meter shows how much of this device's impact budget the
              current frame uses.
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
                            budget {d.capacity} units
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
