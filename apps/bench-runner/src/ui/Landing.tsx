import { useEffect, useState } from "react";

import { totalSeconds } from "@/config";
import { pastRuns, type PastRun } from "@/lib/history";
import { collectDevice } from "@/lib/device";
import { useRunnerStore } from "@/store";

export function Landing({ onStart }: { onStart: () => void }) {
  const crashReport = useRunnerStore((s) => s.crashReport);
  const [history, setHistory] = useState<PastRun[]>([]);
  const [deviceLabel, setDeviceLabel] = useState<string>("");

  useEffect(() => {
    setHistory(pastRuns());
    void collectDevice().then((d) => setDeviceLabel(d.label));
  }, []);

  const mins = Math.round(totalSeconds() / 60);
  const quick = totalSeconds() < 120;

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 shadow-2xl">
        <h1 className="text-xl font-semibold">Spine Run</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Device benchmark for Spine animation budgets. It plays bundled
          scenes for about{" "}
          <span className="text-neutral-200">
            {quick ? `${totalSeconds()} seconds (quick mode)` : `${mins} minutes`}
          </span>{" "}
          while recording frame timings, then uploads the result and gives
          you a short run code.
        </p>

        {deviceLabel && (
          <p className="mt-3 rounded-lg bg-neutral-800/60 px-3 py-2 text-xs text-neutral-400">
            This device: <span className="text-neutral-200">{deviceLabel}</span>
          </p>
        )}

        {crashReport && (
          <div className="mt-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-200">
            <p className="font-medium">
              The previous run crashed the browser during{" "}
              <span className="font-mono">{crashReport.scenario}</span> at{" "}
              {crashReport.instances} instances.
            </p>
            <p className="mt-1 text-red-200/80">
              A crash report was uploaded as{" "}
              <span className="font-mono text-red-100">{crashReport.id}</span>{" "}
              - that breaking point is useful data, send this code too.
            </p>
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            <p className="font-medium">
              This device already ran the benchmark{" "}
              {history.length === 1 ? "once" : `${history.length} times`}:
            </p>
            <ul className="mt-1 space-y-0.5">
              {history.slice(-5).map((r) => (
                <li key={r.id} className="tabular-nums">
                  <span className="font-mono text-amber-100">{r.id}</span>
                  <span className="text-amber-200/60">
                    {" "}
                    · {new Date(r.at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-amber-200/70">
              Running again issues a new code.
            </p>
          </div>
        )}

        <ul className="mt-4 space-y-1 text-xs text-neutral-500">
          <li>· keep this tab in the foreground and the screen on</li>
          <li>· plug in or charge up - throttling skews results</li>
          <li>· nothing personal is collected beyond hardware info</li>
        </ul>

        <button
          type="button"
          onClick={onStart}
          className="mt-5 w-full rounded-xl bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-900 transition-colors hover:bg-white"
        >
          Start benchmark
        </button>
      </div>
    </div>
  );
}
