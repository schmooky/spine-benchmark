import { useState } from "react";

export function Done({
  runId,
  reportUrl,
}: {
  runId: string;
  reportUrl: string | null;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(runId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard refused: the id is on screen anyway
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 text-center shadow-2xl">
        <p className="text-sm text-neutral-400">Benchmark complete. Your run code:</p>

        <button
          type="button"
          onClick={copy}
          title="Copy to clipboard"
          className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-800/60 px-4 py-5 font-mono text-3xl font-bold tracking-[0.3em] text-emerald-300 transition-colors hover:bg-neutral-800"
        >
          {runId}
        </button>
        <p className="mt-2 h-4 text-xs text-neutral-500">
          {copied ? "copied!" : "tap the code to copy"}
        </p>

        <p className="mt-4 text-sm text-neutral-300">
          Send this code to whoever gave you the link.
        </p>
        {reportUrl && (
          <p className="mt-2 text-xs text-neutral-500">
            Report:{" "}
            <a
              href={reportUrl}
              className="text-neutral-300 underline decoration-neutral-600 underline-offset-2"
            >
              {reportUrl}
            </a>
          </p>
        )}

        <button
          type="button"
          onClick={() => location.reload()}
          className="mt-6 w-full rounded-xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-300 transition-colors hover:bg-neutral-800"
        >
          Run again (new code)
        </button>
      </div>
    </div>
  );
}
