export function ErrorView({
  error,
  pendingPayload,
  onRetry,
}: {
  error: string;
  pendingPayload: string | null;
  onRetry: (() => void) | null;
}) {
  const download = () => {
    if (!pendingPayload) return;
    const blob = new Blob([pendingPayload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spine-run-result.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-red-400/30 bg-neutral-900/60 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-red-300">Something broke</h2>
        <p className="mt-2 break-words text-sm text-neutral-400">{error}</p>
        <div className="mt-5 flex flex-col gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="w-full rounded-xl bg-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-white"
            >
              Retry upload
            </button>
          )}
          {pendingPayload && (
            <button
              type="button"
              onClick={download}
              className="w-full rounded-xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              Download result as JSON
            </button>
          )}
          <button
            type="button"
            onClick={() => location.reload()}
            className="w-full rounded-xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Start over
          </button>
        </div>
      </div>
    </div>
  );
}
