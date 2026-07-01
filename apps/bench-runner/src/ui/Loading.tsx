/**
 * Load-all gate: every scene's spine assets are fetched before any measuring
 * starts, so the run never stalls mid-measure on a cold fetch.
 */
export function Loading({ loaded, total }: { loaded: number; total: number }) {
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 shadow-2xl">
        <h1 className="text-lg font-semibold">Loading all scene assets</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Every scene is fetched before any measuring starts.
        </p>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full rounded-full bg-neutral-100 transition-all duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-right text-xs tabular-nums text-neutral-400">{pct}%</p>
      </div>
    </div>
  );
}
