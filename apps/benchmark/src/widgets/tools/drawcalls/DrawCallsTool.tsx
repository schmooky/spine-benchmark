import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, SquareStack, Check, TriangleAlert } from "lucide-react";

import {
  useSkeletonStore,
  analyzeDrawCalls,
  type DrawCallAnalysis,
  type DrawBatch,
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

/** Short display name for a possibly-pathy atlas page. */
function shortPage(page: string): string {
  const base = page.split("/").pop() ?? page;
  return base.replace(/\.(png|webp|json|atlas)$/i, "");
}

/** Plain-language reason THIS batch had to start a new draw call. */
function breakReason(b: DrawBatch, prev: DrawBatch | undefined): string {
  if (!prev || b.reason === "first") return "first batch of the frame";
  const pageChanged = b.page !== prev.page;
  const blendChanged = b.blend !== prev.blend;
  if (pageChanged && blendChanged) {
    return `texture ${shortPage(prev.page)} -> ${shortPage(b.page)}, blend -> ${b.blend}`;
  }
  if (pageChanged) return `texture changed: ${shortPage(prev.page)} -> ${shortPage(b.page)}`;
  return `blend changed: ${prev.blend} -> ${b.blend}`;
}

/**
 * Draw-call visualizer - a live side panel. Walks the current draw order and
 * shows the classic Spine batch count, WHY each batch had to start a new draw
 * call (which texture/blend changed), and how many calls are wasted on
 * page/blend thrashing (avoidable by reordering slots or repacking the atlas).
 * Updates a few times a second so it tracks animation.
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
    const id = window.setInterval(() => setAnalysis(analyzeDrawCalls(spine)), 250);
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
  const wasted = Math.max(0, analysis.total - analysis.minPossible);

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

      {/* headline + plain explanation */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-semibold tabular-nums">{analysis.total}</span>
          <span className="text-sm text-muted-foreground">
            draw call{analysis.total === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          One call renders a run of neighbouring slots that share the same atlas
          texture and blend mode. A new call starts the moment either changes.
        </p>

        {/* avoidable-cost insight */}
        {wasted > 0 ? (
          <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-2">
            <TriangleAlert className="mt-px size-3.5 shrink-0 text-amber-400" />
            <div className="text-[11px] leading-snug text-amber-200/90">
              <span className="font-medium">{wasted} avoidable</span> - this
              content only needs {analysis.minPossible} (one per texture+blend).
              The extra calls come from those being interleaved in draw order;
              grouping slots by texture removes them.
            </div>
          </div>
        ) : (
          <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-2">
            <Check className="size-3.5 shrink-0 text-emerald-400" />
            <div className="text-[11px] text-emerald-200/90">
              Optimal - one call per texture+blend, no thrashing.
            </div>
          </div>
        )}

        {/* draw-order strip: one cell per batch, coloured by texture */}
        <div className="mt-2.5">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            draw order
          </div>
          <div className="flex h-3 w-full gap-px overflow-hidden rounded">
            {analysis.batches.map((b) => (
              <div
                key={b.index}
                className="h-full flex-1"
                title={`#${b.index + 1} ${shortPage(b.page)} / ${b.blend}`}
                style={{ backgroundColor: pageColor(pageOrder, b.page) }}
              />
            ))}
          </div>
        </div>

        {/* page legend */}
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {pageOrder.map((p) => (
            <span key={p} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="size-2 rounded-full" style={{ backgroundColor: pageColor(pageOrder, p) }} />
              {shortPage(p)}
            </span>
          ))}
        </div>
      </div>

      {/* per-call breakdown */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-1.5">
          {analysis.batches.map((b, i) => (
            <div key={b.index} className="rounded-lg border border-border bg-secondary/20 p-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                  #{b.index + 1}
                </span>
                <span
                  className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px]"
                  title={b.page}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: pageColor(pageOrder, b.page) }}
                  />
                  <span className="max-w-28 truncate">{shortPage(b.page)}</span>
                </span>
                {b.blend !== "normal" && (
                  <span className="rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {b.blend}
                  </span>
                )}
                <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                  {b.slots.length} slot{b.slots.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-1 text-[11px] leading-snug">
                <span className={i === 0 ? "text-muted-foreground/60" : "text-amber-300/80"}>
                  {breakReason(b, analysis.batches[i - 1])}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
