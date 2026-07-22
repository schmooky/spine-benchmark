import { useEffect, useState } from "react";
import { Check } from "lucide-react";

import { useSkeletonStore, measureFrameFeatures } from "@/entities/skeleton";
import { estimatePoseCoverage, type WalkableSkeleton } from "@spine-benchmark/metrics-impact-formula";
import {
  predictDeviceCost,
  fetchCostModel,
  isCostTrusted,
  provenanceLabel,
  TRUST_RELMAE_MAX,
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

const STATUS_BAR: Record<BudgetStatus, string> = {
  ok: "bg-emerald-400/70",
  warn: "bg-amber-400/70",
  over: "bg-red-400/70",
};

/** The "+-N%" error band from the model's fit quality, or "" when unknown. */
function band(cost: { quality?: { gpu: { relMae?: number } | null; cpu: { relMae?: number } | null } | null }): string {
  const q = cost.quality?.cpu ?? cost.quality?.gpu;
  return q?.relMae != null ? `+-${Math.round(q.relMae * 100)}%` : "";
}

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
  const [measuredMs, setMeasuredMs] = useState<{
    gpuMs: number | null;
    cpuMs: number;
    frameCpuMs: number;
  } | null>(null);

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
  const pct = Math.round(Math.max(cost.gpuPct, cost.cpuPct) * 100);
  // THE honesty gate: only show an authoritative per-device number when a real,
  // tight-error fit backs it. Otherwise show ONLY the measured-on-this-machine
  // cost, clearly labelled - never a placeholder guess dressed as a fact.
  const trusted = isCostTrusted(cost);
  const provShort = `${cost.source === "family" ? device.gpuFamily : "fleet"} fit${
    band(cost) ? ` ${band(cost)}` : ""
  }`;

  return (
    <>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        title={
          trusted
            ? `${device.name} (${device.gpuFamily}) - predicted: CPU ${cost.cpuMs.toFixed(2)}ms, GPU ${cost.gpuMs.toFixed(2)}ms; ${cost.binding.toUpperCase()}-bound at ${pct}% of frame. Model: ${provenanceLabel(cost)}. Assumes ${Math.round(ASSUMED_SCREEN_HEIGHT_FRACTION * 100)}% screen height. Click to change device.`
            : `No trustworthy prediction for ${device.name} yet - the cost model for its GPU family (${device.gpuFamily}) is not calibrated. The number shown is MEASURED on THIS computer (${measuredMs ? `${measuredMs.cpuMs.toFixed(2)}ms compute, ${measuredMs.frameCpuMs.toFixed(2)}ms whole frame` : "measuring..."}), which is not the target phone. Click to change device.`
        }
        className="pointer-events-auto absolute left-4 top-4 z-40 flex w-52 flex-col gap-1 rounded-xl border border-border bg-card/80 px-3 py-2 text-left shadow-xl backdrop-blur-md transition-colors hover:bg-card"
      >
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate font-medium text-foreground">{device.name}</span>
          {trusted && <span className="ml-auto shrink-0 uppercase tracking-wide">{cost.binding}</span>}
        </span>

        {trusted ? (
          <>
            {/* authoritative: a real fit with a tight error band backs this */}
            <span className="flex items-baseline gap-1.5">
              <span className={cn("text-lg font-semibold leading-none tabular-nums", STATUS_TEXT[cost.status])}>
                {(cost.gpuMs + cost.cpuMs).toFixed(2)}
                <span className="text-xs font-normal">ms</span>
              </span>
              <span className={cn("text-xs tabular-nums", STATUS_TEXT[cost.status])}>{pct}% of frame</span>
            </span>
            <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-secondary/50">
              <div
                className={cn("h-full rounded-full", STATUS_BAR[cost.status])}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              cpu {cost.cpuMs.toFixed(2)} · gpu {cost.gpuMs.toFixed(2)}
            </span>
            <span className="text-[10px] text-muted-foreground/70">predicted · {provShort}</span>
          </>
        ) : (
          <>
            {/* NO fabricated per-device number - the model isn't calibrated. Show
                only what is really measured, and say whose machine it's on. */}
            <span className="text-[11px] font-medium text-amber-400">
              not calibrated for this device
            </span>
            {measuredMs ? (
              <>
                <span className="text-[10px] text-muted-foreground/70">
                  measured on THIS computer (not the phone):
                </span>
                <span className="text-lg font-semibold leading-none tabular-nums text-foreground">
                  {measuredMs.cpuMs.toFixed(2)}
                  <span className="text-xs font-normal"> ms compute</span>
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground/40">
                  whole frame {measuredMs.frameCpuMs.toFixed(2)} ms · GPU not measurable in-browser
                </span>
              </>
            ) : (
              <span className="text-[10px] text-muted-foreground/60">measuring on this computer...</span>
            )}
          </>
        )}
      </button>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Target device</DialogTitle>
            <DialogDescription>
              Once a device's GPU family has enough measured runs, the meter
              shows the predicted milliseconds on it (at{" "}
              {Math.round(ASSUMED_SCREEN_HEIGHT_FRACTION * 100)}% screen height).
              Until then it shows only what is measured on this computer, and
              says so.
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
                      const fq = model?.byFamilyQuality?.[d.gpuFamily];
                      const relMae = fq?.cpu?.relMae ?? fq?.gpu?.relMae;
                      const calibrated = relMae != null && relMae <= TRUST_RELMAE_MAX;
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
                          <span
                            className={cn(
                              "mt-1 text-[10px] tabular-nums",
                              calibrated ? "text-emerald-400/80" : "text-muted-foreground/50",
                            )}
                          >
                            {calibrated
                              ? `calibrated +-${Math.round((relMae as number) * 100)}%`
                              : "not calibrated yet"}
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
