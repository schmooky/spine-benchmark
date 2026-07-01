import { useEffect, useState } from "react";

/**
 * First-visit auto-run gate: this device has never been measured, so we start
 * automatically after a short, cancelable countdown. Cancel drops to the normal
 * Landing so the user keeps manual control.
 */
export function Countdown({
  seconds = 5,
  onDone,
  onCancel,
}: {
  seconds?: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    if (left <= 0) {
      onDone();
      return;
    }
    const t = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left, onDone]);

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 text-center shadow-2xl">
        <h1 className="text-xl font-semibold">First run on this device</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Starting the Spine scene benchmark automatically in
        </p>
        <p className="my-3 text-5xl font-bold tabular-nums text-neutral-100">{left}</p>
        <ul className="mb-4 space-y-1 text-xs text-neutral-500">
          <li>keep this tab in the foreground and the screen on</li>
          <li>plug in or charge up - throttling skews results</li>
        </ul>
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-xl border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
