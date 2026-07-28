import { useEffect, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { useSkeletonStore, measureFrameFeatures } from "@/entities/skeleton";
import { estimatePoseCoverage, type WalkableSkeleton } from "@spine-benchmark/metrics-impact-formula";
import { stage } from "@/widgets/stage";
import { useDeviceStore } from "@/entities/device";
import {
  BOARD_SIZE,
  CALIBRATED_DEVICES,
  deviceByLabel,
  predictMarginalMs,
  predictMs,
  type CalibratedDevice,
} from "@/shared/config/calibrated-devices";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { cn } from "@/shared/lib/utils";

const FRAME_MS = 1000 / 60;

/** Spine costs are usually well under 1ms: 3 decimals under 1ms, 2 under 10, 1 above. */
function fmt(ms: number): string {
  if (ms >= 10) return ms.toFixed(1);
  if (ms >= 1) return ms.toFixed(2);
  return ms.toFixed(3);
}
const compact = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : Math.round(n).toString();

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

interface Work {
  drawCalls: number;
  vertices: number;
  stateChanges: number;
  batchBreaks: number;
  stencilPasses: number;
  renderTargetSwitches: number;
  filterPasses: number;
}

/**
 * Cost analysis panel, ordered by how certain each number is.
 *
 *   1. THIS SPINE, HERE - the skeleton's own per-frame CPU, measured in
 *      isolation (crawler spineProfile), printed to microsecond resolution
 *      because one idle symbol is well under a millisecond. Zero model.
 *   2. WHOLE FRAME + GPU - context: everything the canvas does, plus real GPU
 *      ms where the browser exposes a timer (desktop yes, mobile no).
 *   3. THE WORK - draws / verts / state / breaks / stencil / RT switches.
 *      Device-INVARIANT facts, no model needed.
 *   4. A PICKED REAL PHONE - the marginal ms of one of these (sub-ms, additive)
 *      and a whole board, from that device's OWN measured calibration, always
 *      carrying its held-out error band. Every benchmarked device is pickable;
 *      ones whose error is above the trust bar are flagged, not hidden - the
 *      band is the honesty, so you can see exactly how much to believe.
 */
export function DeviceMeter() {
  const spine = useSkeletonStore((s) => s.spine);
  const status = useSkeletonStore((s) => s.status);
  const deviceLabel = useDeviceStore((s) => s.deviceId);
  const setDevice = useDeviceStore((s) => s.setDevice);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [measured, setMeasured] = useState<{
    spineMs: number;
    frameMs: number;
    gpuMs: number | null;
  } | null>(null);
  const [work, setWork] = useState<Work | null>(null);
  const [est, setEst] = useState<{ one: number; board: number } | null>(null);
  /** per-device estimates for the picker dialog */
  const [all, setAll] = useState<Map<string, { one: number; board: number }>>(new Map());

  const device: CalibratedDevice | undefined =
    deviceByLabel(deviceLabel) ?? CALIBRATED_DEVICES[0];

  useEffect(() => {
    if (status !== "ready" || !spine) {
      setMeasured(null);
      setWork(null);
      setEst(null);
      return;
    }
    const sample = () => {
      const m = stage.getMeasuredMs();
      // cpuMs is SPINE-isolated (spineProfile on); frameCpuMs is the whole tick
      // including the workbench's own grid/camera/filter chrome.
      setMeasured(m ? { spineMs: m.cpuMs, frameMs: m.frameCpuMs, gpuMs: m.gpuMs } : null);
      setWork(stage.getFrameWork() ?? null);

      const walkable = spine.skeleton as unknown as WalkableSkeleton;
      const coverage = estimatePoseCoverage(walkable, { scale: 1 });
      const features = measureFrameFeatures(spine.skeleton, coverage);
      if (device) {
        setEst({
          one: predictMarginalMs(device, features, 1),
          board: predictMs(device, features, BOARD_SIZE),
        });
      }
      const next = new Map<string, { one: number; board: number }>();
      for (const d of CALIBRATED_DEVICES) {
        next.set(d.label, {
          one: predictMarginalMs(d, features, 1),
          board: predictMs(d, features, BOARD_SIZE),
        });
      }
      setAll(next);
    };
    sample();
    const id = window.setInterval(sample, 250);
    return () => window.clearInterval(id);
  }, [spine, status, device]);

  if (status !== "ready" || !spine) return null;

  const band = device?.errorBand != null ? Math.round(device.errorBand * 100) : null;

  return (
    <>
      <div className="pointer-events-auto absolute left-4 top-4 z-40 w-60 rounded-xl border border-border bg-card/80 px-3 py-2.5 shadow-xl backdrop-blur-md">
        {/* 1. this spine, measured */}
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-medium text-foreground">This spine</span>
          <span className="text-[10px] text-muted-foreground/60">measured here</span>
        </div>
        {measured ? (
          <div className="mt-0.5 flex items-baseline gap-1">
            <span className="text-xl font-semibold leading-none tabular-nums text-foreground">
              {fmt(measured.spineMs)}
            </span>
            <span className="text-xs text-muted-foreground">ms / frame</span>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground/50">measuring...</span>
        )}

        {/* 2. context */}
        {measured && (
          <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] tabular-nums text-muted-foreground/70">
            <span title="everything this canvas does per frame, including the workbench's own grid, camera and filters">
              whole frame {fmt(measured.frameMs)} ms
            </span>
            <span title="real GPU time from EXT_disjoint_timer_query - desktop browsers expose it, mobile ones do not">
              gpu{" "}
              {measured.gpuMs != null ? (
                `${fmt(measured.gpuMs)} ms`
              ) : (
                <span className="text-muted-foreground/40">no timer</span>
              )}
            </span>
          </div>
        )}

        {/* 3. the work */}
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

        {/* 4. picked device */}
        {device && (
          <div className="mt-2 border-t border-border/50 pt-1.5">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex w-full items-center gap-1 text-left text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              title="pick another benchmarked device"
            >
              <span className="truncate font-medium text-foreground">{device.name}</span>
              <ChevronDown className="size-3 shrink-0 opacity-60" />
              {band != null && (
                <span className={cn("ml-auto shrink-0", device.trusted ? "" : "text-amber-400")}>
                  +-{band}%
                </span>
              )}
            </button>
            {est && (
              <div className="mt-1 flex items-baseline justify-between text-[10px] tabular-nums">
                <span className="text-muted-foreground">
                  one <span className="font-medium text-foreground">{fmt(est.one)}</span> ms
                </span>
                <span className="text-muted-foreground">
                  board of {BOARD_SIZE}{" "}
                  <span className={cn("font-medium", TEXT[statusOf(est.board)])}>
                    {fmt(est.board)}
                  </span>{" "}
                  ms
                </span>
              </div>
            )}
            {!device.trusted && (
              <div className="mt-0.5 text-[10px] text-amber-400/80">
                unverified - error above the trust bar
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Benchmarked devices</DialogTitle>
            <DialogDescription>
              Real phones we ran the benchmark on. Each estimate comes from that
              device's own measured runs and carries its held-out error - the ms
              for one of this spine, and for a board of {BOARD_SIZE}. Devices
              whose error is above the trust bar are marked; the band tells you
              how much to believe them.
            </DialogDescription>
          </DialogHeader>

          <div className="grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
            {CALIBRATED_DEVICES.map((d) => {
              const selected = d.label === device?.label;
              const e = all.get(d.label);
              const b = d.errorBand != null ? Math.round(d.errorBand * 100) : null;
              return (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => {
                    setDevice(d.label);
                    setPickerOpen(false);
                  }}
                  className={cn(
                    "relative flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors hover:bg-accent",
                    selected ? "border-primary/60 bg-accent/60" : "border-border bg-card/50",
                  )}
                >
                  {selected && <Check className="absolute right-2 top-2 size-3.5 text-primary" />}
                  <span className="pr-5 text-sm font-medium leading-tight">{d.name}</span>
                  <span className="text-[11px] text-muted-foreground">{d.gpu}</span>
                  {e && (
                    <span className="mt-1 text-[11px] tabular-nums text-foreground">
                      one {fmt(e.one)} ms
                      <span className="text-muted-foreground/50"> · </span>
                      board {fmt(e.board)} ms
                    </span>
                  )}
                  <span
                    className={cn(
                      "text-[10px] tabular-nums",
                      d.trusted ? "text-emerald-400/80" : "text-amber-400/80",
                    )}
                  >
                    {b != null
                      ? d.trusted
                        ? `calibrated +-${b}%`
                        : `unverified +-${b}%`
                      : "no error estimate"}
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
