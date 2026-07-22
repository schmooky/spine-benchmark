import { useState } from "react";

import { useRunnerStore } from "@/store";

/** One 60fps frame is 16.67ms; express measured compute as a share of it. */
const FRAME_60_MS = 1000 / 60;

function fmtMs(ms: number | null): string {
  if (ms == null) return "-";
  return ms >= 10 ? ms.toFixed(1) : ms.toFixed(2);
}

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

  const rows = (measured ?? []).filter((m) => m.frameCpuMs != null);
  const maxMs = Math.max(FRAME_60_MS, ...rows.map((r) => r.frameCpuMs ?? 0));

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 shadow-2xl">
        {/* HERO: the real measured time on THIS device */}
        <p className="text-center text-sm text-neutral-400">
          Measured on <span className="text-neutral-200">this device</span> - real
          per-frame compute time
        </p>

        {rows.length > 0 ? (
          <div className="mt-4 flex flex-col gap-1.5">
            {rows.map((r) => {
              const ms = r.frameCpuMs ?? 0;
              const pctOf60 = (ms / FRAME_60_MS) * 100;
              const bar = Math.min(100, (ms / maxMs) * 100);
              const over = ms > FRAME_60_MS;
              return (
                <div
                  key={r.label}
                  className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm text-neutral-200">{r.label}</span>
                    <span
                      className={`shrink-0 font-mono text-sm tabular-nums ${
                        over ? "text-amber-300" : "text-emerald-300"
                      }`}
                      title={`p95 ${fmtMs(r.frameCpuMsP95)} ms/frame`}
                    >
                      {fmtMs(ms)} ms/frame
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className={`h-full rounded-full ${over ? "bg-amber-400/70" : "bg-emerald-400/70"}`}
                      style={{ width: `${bar}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-500">
                    {pctOf60.toFixed(0)}% of a 60fps frame budget (16.7 ms)
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-center text-sm text-neutral-500">
            No per-scene compute was captured for this run.
          </p>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">
          This is the <span className="text-neutral-400">CPU compute</span> per frame
          (spine update + render-side work), measured directly on this device - not
          predicted. GPU fill time can't be measured in a browser and is not included.
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
