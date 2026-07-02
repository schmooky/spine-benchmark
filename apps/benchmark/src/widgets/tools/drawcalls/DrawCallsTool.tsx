import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, SquareStack } from "lucide-react";

import {
  useSkeletonStore,
  analyzeDrawCalls,
  type DrawCallAnalysis,
  type BreakReason,
} from "@/entities/skeleton";
import { cn } from "@/shared/lib/utils";

/** desaturated, distinct hue per atlas page so batches on the same page read
 *  as the same colour (and page thrashing is visible at a glance) */
const PAGE_HUES = [38, 150, 285, 0, 95, 320, 210, 255];
function pageColor(pageOrder: string[], page: string): string {
  const i = pageOrder.indexOf(page);
  const hue = PAGE_HUES[(i < 0 ? 0 : i) % PAGE_HUES.length];
  return `hsl(${hue} 45% 62%)`;
}

const REASON_LABEL: Record<BreakReason, string> = {
  first: "first batch",
  page: "atlas page change",
  blend: "blend mode change",
  "page+blend": "page + blend change",
};

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 px-2 py-1.5 text-center">
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

/**
 * Draw-call visualizer - a live side panel. Walks the current draw order and
 * shows the classic Spine batch count plus, for every batch, why it had to
 * start a new draw call (atlas page change or blend mode change). Updates a few
 * times a second so it tracks animation.
 */
export function DrawCallsTool() {
  const navigate = useNavigate();
  const spine = useSkeletonStore((s) => s.spine);
  const status = useSkeletonStore((s) => s.status);

  const [shown, setShown] = useState(false);
  const [analysis, setAnalysis] = useState<DrawCallAnalysis | null>(() =>
    spine ? analyzeDrawCalls(spine) : null,
  );

  useEffect(() => {
    const t = window.setTimeout(() => setShown(true), 20);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (status !== "ready" || !spine) {
      navigate("/", { replace: true });
      return;
    }
    setAnalysis(analyzeDrawCalls(spine));
    const id = window.setInterval(
      () => setAnalysis(analyzeDrawCalls(spine)),
      250,
    );
    return () => window.clearInterval(id);
  }, [spine, status, navigate]);

  const pageOrder = useMemo(() => {
    if (!analysis) return [];
    const seen: string[] = [];
    for (const b of analysis.batches) if (!seen.includes(b.page)) seen.push(b.page);
    return seen;
  }, [analysis]);

  if (status !== "ready" || !spine || !analysis) return null;

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
          <SquareStack className="size-4 text-primary" />
          <span className="text-sm font-medium">Draw calls</span>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="border-b border-border px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-semibold tabular-nums">
            {analysis.total}
          </span>
          <span className="text-sm text-muted-foreground">
            draw call{analysis.total === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          atlas-page + blend-mode batching, live
        </p>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          <Stat value={analysis.pages} label="pages" />
          <Stat value={analysis.pageBreaks} label="page" />
          <Stat value={analysis.blendBreaks} label="blend" />
          <Stat value={analysis.renderedSlots} label="slots" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-1.5">
          {analysis.batches.map((b) => (
            <div
              key={b.index}
              className="rounded-lg border border-border bg-secondary/20 p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  #{b.index + 1}
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px]"
                    title={b.page}
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: pageColor(pageOrder, b.page) }}
                    />
                    <span className="max-w-24 truncate">{b.page}</span>
                  </span>
                  {b.blend !== "normal" && (
                    <span className="rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {b.blend}
                    </span>
                  )}
                </div>
              </div>
              {b.reason !== "first" && (
                <div className="mt-1 text-[11px] text-primary/80">
                  new draw call - {REASON_LABEL[b.reason]}
                </div>
              )}
              <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground/80">
                {b.slots.length} slot{b.slots.length === 1 ? "" : "s"}:{" "}
                {b.slots.join(", ")}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-border px-4 py-2.5 text-[11px] leading-snug text-muted-foreground">
        Consecutive slots batch while page &amp; blend stay equal; each change
        costs a draw call.
      </div>
    </div>
  );
}
