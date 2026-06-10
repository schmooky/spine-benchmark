import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Zap, Trash2 } from "lucide-react";

import { useSkeletonStore } from "@/entities/skeleton";
import { useEventLogStore } from "@/entities/playback";
import { cn } from "@/shared/lib/utils";

/**
 * Events monitor - a live console of user events fired by the skeleton's
 * animations. The log is captured by a listener attached at load (so it sees
 * events from the transport and the mixer alike); this panel just drains it,
 * newest first, with each event's payload.
 */
export function EventsTool() {
  const navigate = useNavigate();
  const spine = useSkeletonStore((s) => s.spine);
  const status = useSkeletonStore((s) => s.status);
  const events = useEventLogStore((s) => s.events);
  const clear = useEventLogStore((s) => s.clear);

  const [shown, setShown] = useState(false);
  const definedCount = useMemo(
    () => spine?.skeleton.data.events.length ?? 0,
    [spine],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setShown(true), 20);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (status !== "ready" || !spine) navigate("/", { replace: true });
  }, [status, spine, navigate]);

  if (status !== "ready" || !spine) return null;

  const close = () => navigate("/");

  return (
    <div
      className={cn(
        "pointer-events-auto absolute right-4 top-4 bottom-4 z-30 flex w-80 flex-col rounded-2xl border border-border bg-card/80 shadow-2xl backdrop-blur-md transition-transform duration-300 ease-out",
        shown ? "translate-x-0" : "translate-x-[120%]",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-primary" />
          <span className="text-sm font-medium">Events</span>
          <span className="text-xs text-muted-foreground">
            {events.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => clear()}
            aria-label="Clear log"
            title="Clear log"
            disabled={events.length === 0}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <Trash2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {events.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">
            {definedCount === 0
              ? "This skeleton defines no events."
              : "No events fired yet. Play an animation that fires events."}
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {events.map((e) => (
              <div
                key={e.id}
                className="rounded-lg border border-border bg-secondary/20 px-3 py-2"
                style={{ animation: "ns-fade-up 0.25s ease both" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{e.name}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    t={e.time.toFixed(2)}s
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {e.animation} · track {e.track}
                </div>
                {(e.intValue !== 0 ||
                  e.floatValue !== 0 ||
                  e.stringValue !== "") && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {e.intValue !== 0 && (
                      <span className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                        int {e.intValue}
                      </span>
                    )}
                    {e.floatValue !== 0 && (
                      <span className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                        float {e.floatValue}
                      </span>
                    )}
                    {e.stringValue !== "" && (
                      <span className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        &quot;{e.stringValue}&quot;
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border px-4 py-2.5 text-[11px] leading-snug text-muted-foreground">
        {definedCount} event{definedCount === 1 ? "" : "s"} defined in this
        skeleton.
      </div>
    </div>
  );
}
