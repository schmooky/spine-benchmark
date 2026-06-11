import type { HudState } from "@/bench/engine";

function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Fixed overlay above the benchmark canvas: progress, timer, live stats. */
export function Hud({ hud }: { hud: HudState }) {
  const progress = hud.totalMs > 0 ? Math.min(1, hud.elapsedMs / hud.totalMs) : 0;
  const remaining = hud.totalMs - hud.elapsedMs;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 p-4">
      <div className="mx-auto max-w-xl rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4 backdrop-blur-md">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm text-neutral-200">
            {hud.scenarioLabel}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-neutral-400">
            {hud.scenarioIndex + 1}/{hud.scenarioCount}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full rounded-full bg-neutral-300 transition-[width] duration-200"
            style={{ width: `${(progress * 100).toFixed(1)}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs tabular-nums text-neutral-400">
          <span>-{mmss(remaining)}</span>
          <span>
            {hud.instances} instance{hud.instances === 1 ? "" : "s"}
          </span>
          <span
            className={
              hud.fps >= 50
                ? "text-emerald-400"
                : hud.fps >= 30
                  ? "text-amber-400"
                  : "text-red-400"
            }
          >
            {hud.fps.toFixed(0)} fps
          </span>
        </div>
      </div>
    </div>
  );
}
