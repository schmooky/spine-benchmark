import { useTransition, animated } from "@react-spring/web";
import { UploadCloud, AlertTriangle } from "lucide-react";

import { useSkeletonStore } from "@/entities/skeleton";
import { useMetricsStore } from "@/entities/metrics";
import { Spinner } from "@/shared/ui/spinner";
import { cn } from "@/shared/lib/utils";

type View = "prompt" | "loading" | "error" | "hidden";

/**
 * The thing in the middle of the grid. Presentational only - it reads the
 * active skeleton's status and cross-fades between: the "drop assets here"
 * prompt, a measuring spinner, and an error. When a skeleton is ready it gets
 * out of the way entirely (react-spring leave animation = the text vanishing).
 */
export function DropOverlay({ isDragging }: { isDragging: boolean }) {
  const status = useSkeletonStore((s) => s.status);
  const error = useSkeletonStore((s) => s.error);
  const progress = useMetricsStore((s) => s.progress);

  const view: View =
    status === "loading"
      ? "loading"
      : status === "ready"
        ? "hidden"
        : status === "error"
          ? "error"
          : "prompt";

  const transitions = useTransition(view, {
    keys: view,
    from: { opacity: 0, transform: "scale(0.94)" },
    enter: { opacity: 1, transform: "scale(1)" },
    leave: { opacity: 0, transform: "scale(1.06)" },
    config: { tension: 300, friction: 28 },
  });

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      {/* drag-active ring */}
      <div
        className={cn(
          "absolute inset-4 rounded-2xl border-2 border-dashed transition-all duration-200",
          isDragging && status !== "loading"
            ? "border-primary/70 bg-primary/5 opacity-100"
            : "border-transparent opacity-0",
        )}
      />

      {transitions((style, v) => {
        if (v === "hidden") return null;
        return (
          <animated.div
            style={style}
            className="absolute flex flex-col items-center text-center select-none"
          >
            {v === "prompt" && (
              <>
                <div
                  className="mb-5 flex size-20 items-center justify-center rounded-full border border-border bg-card/40 backdrop-blur-sm"
                  style={{ animation: "ns-fade-up 0.6s ease both" }}
                >
                  <UploadCloud className="size-9 text-primary" />
                </div>
                <h1 className="text-3xl font-semibold tracking-tight">
                  Drop assets here
                </h1>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  A Spine bundle - <code className="text-foreground/80">.json</code> or{" "}
                  <code className="text-foreground/80">.skel</code>, its{" "}
                  <code className="text-foreground/80">.atlas</code>, and the textures.
                  Drop anywhere on the grid.
                </p>
              </>
            )}

            {v === "loading" && (
              <>
                <Spinner className="size-9" />
                <h2 className="mt-5 text-xl font-medium">Materializing…</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Running measurements
                </p>
                <div className="mt-4 h-1 w-56 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
              </>
            )}

            {v === "error" && (
              <>
                <div className="mb-5 flex size-20 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10">
                  <AlertTriangle className="size-9 text-destructive" />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Couldn’t load that
                </h2>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  {error}
                </p>
                <p className="mt-3 text-xs text-muted-foreground/70">
                  Drop a complete bundle to try again.
                </p>
              </>
            )}
          </animated.div>
        );
      })}
    </div>
  );
}
