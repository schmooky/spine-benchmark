import { useEffect, useState } from "react";
import { Check } from "lucide-react";

import {
  useSkeletonStore,
  measureFrameImpact,
  type FrameImpact,
} from "@/entities/skeleton";
import { useDeviceStore } from "@/entities/device";
import {
  DEVICES,
  DEVICE_KIND_ICON,
  DEVICE_KIND_LABEL,
  budgetStatus,
  deviceById,
  type BudgetStatus,
  type DeviceKind,
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
const STATUS_BORDER: Record<BudgetStatus, string> = {
  ok: "border-emerald-400/30",
  warn: "border-amber-400/40",
  over: "border-red-400/50",
};

const KINDS: DeviceKind[] = ["phone", "tablet", "desktop"];

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

  useEffect(() => {
    if (status !== "ready" || !spine) {
      setFrame(null);
      return;
    }
    setFrame(measureFrameImpact(spine.skeleton));
    const id = window.setInterval(
      () => setFrame(measureFrameImpact(spine.skeleton)),
      200,
    );
    return () => window.clearInterval(id);
  }, [spine, status]);

  if (status !== "ready" || !spine || !frame) return null;

  const device = deviceById(deviceId);
  const fraction = frame.total / device.capacity;
  const pct = Math.round(fraction * 100);
  const state = budgetStatus(fraction);
  const Icon = DEVICE_KIND_ICON[device.kind];

  return (
    <>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        title={`RI ${frame.ri.toFixed(1)} + CI ${frame.ci.toFixed(1)} = ${frame.total.toFixed(1)} of ${device.capacity} units - click to change device`}
        className={cn(
          "pointer-events-auto absolute left-4 top-4 z-30 flex items-center gap-2.5 rounded-2xl border bg-card/80 px-3 py-2 shadow-xl backdrop-blur-md transition-colors hover:bg-accent/60",
          STATUS_BORDER[state],
        )}
      >
        <Icon className={cn("size-5", STATUS_TEXT[state])} />
        <span className="flex flex-col items-start leading-none">
          <span
            className={cn(
              "text-lg font-semibold tabular-nums",
              STATUS_TEXT[state],
            )}
          >
            {pct}%
          </span>
          <span className="mt-0.5 text-[10px] text-muted-foreground">
            {device.name}
          </span>
        </span>
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
