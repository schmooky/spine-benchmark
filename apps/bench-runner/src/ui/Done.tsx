import { useState } from "react";

import { useRunnerStore, type MeasuredScene } from "@/store";

function fmtMs(ms: number | null): string {
  if (ms == null) return "-";
  return ms >= 10 ? ms.toFixed(1) : ms.toFixed(2);
}

type Status = "ok" | "warn" | "over";

/** Traffic-light on the REAL render rate: a scene that holds ~full frame rate
 * is fine; one that drops below it is the real cost problem. */
function statusOf(fps: number | null): Status {
  if (fps == null) return "ok";
  if (fps >= 57) return "ok";
  if (fps >= 45) return "warn";
  return "over";
}

/** Ranking / bar weight: real (GPU-inclusive) frame time when a scene dropped
 * below full rate, else its compute cost (a smooth scene's wall-clock is just
 * pinned at the refresh ceiling). */
function sceneCost(m: MeasuredScene): number {
  const dropped = m.fps != null && m.fps < 57 && m.frameMs != null;
  return dropped ? m.frameMs! : m.frameCpuMs ?? m.frameMs ?? 0;
}

const NUM: Record<Status, string> = {
  ok: "text-emerald-300",
  warn: "text-amber-300",
  over: "text-red-300",
};
const FILL: Record<Status, string> = {
  ok: "bg-emerald-400/70",
  warn: "bg-amber-400/70",
  over: "bg-red-400/70",
};

export function Done({
  runId,
  reportUrl,
}: {
  runId: string;
  reportUrl: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const measured = useRunnerStore((s) => s.measured);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(runId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard refused: the id is on screen anyway
    }
  };

  const rows = (measured ?? []).filter(
    (m) => m.frameMs != null || m.frameCpuMs != null,
  );
  const maxCost = Math.max(0.001, ...rows.map(sceneCost));

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 shadow-2xl">
        <p className="text-center text-sm text-neutral-400">
          Measured on <span className="text-neutral-200">this device</span> - real
          per-frame render cost
        </p>

        {rows.length > 0 ? (
          <div className="mt-4 flex flex-col gap-1.5">
            {rows.map((r) => {
              const st = statusOf(r.fps);
              const bar = Math.min(100, (sceneCost(r) / maxCost) * 100);
              return (
                <div
                  key={r.label}
                  className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm text-neutral-200">{r.label}</span>
                    <span
                      className={`shrink-0 font-mono text-sm tabular-nums ${NUM[st]}`}
                      title={`compute p95 ${fmtMs(r.frameCpuMsP95)} ms`}
                    >
                      {fmtMs(r.frameMs)} ms{" "}
                      <span className="text-neutral-500">
                        · {r.fps == null ? "-" : Math.round(r.fps)} fps
                      </span>
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className={`h-full rounded-full ${FILL[st]}`}
                      style={{ width: `${bar}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-500">
                    frame {fmtMs(r.frameMs)} ms (real, incl. GPU) · compute{" "}
                    {fmtMs(r.frameCpuMs)} ms (CPU)
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-center text-sm text-neutral-500">
            No per-scene timings were captured for this run.
          </p>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">
          <span className="text-neutral-400">frame</span> = real time per frame
          including GPU (capped at your screen's refresh, so a scene at full fps is
          fine even near 16.7 ms). <span className="text-neutral-400">compute</span> =
          CPU work (spine update + render), clamped so it can never exceed the frame.
          The browser can't split GPU fill out on its own - but the frame time already
          includes it whenever a scene drops below full rate.
        </p>

        {/* SECONDARY: the run code to hand back to whoever collects */}
        <div className="mt-5 border-t border-neutral-800 pt-4 text-center">
          <p className="text-xs text-neutral-500">Run code (send to whoever gave you the link):</p>
          <button
            type="button"
            onClick={copy}
            title="Copy to clipboard"
            className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-800/60 px-4 py-3 font-mono text-2xl font-bold tracking-[0.3em] text-neutral-200 transition-colors hover:bg-neutral-800"
          >
            {runId}
          </button>
          <p className="mt-1 h-4 text-[11px] text-neutral-500">
            {copied ? "copied!" : "tap the code to copy"}
          </p>
          {reportUrl && (
            <p className="mt-1 text-[11px] text-neutral-500">
              Report:{" "}
              <a
                href={reportUrl}
                className="text-neutral-400 underline decoration-neutral-600 underline-offset-2"
              >
                {reportUrl}
              </a>
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => location.reload()}
          className="mt-5 w-full rounded-xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-300 transition-colors hover:bg-neutral-800"
        >
          Run again (new code)
        </button>
      </div>
    </div>
  );
}
