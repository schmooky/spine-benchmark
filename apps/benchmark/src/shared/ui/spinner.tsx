import { cn } from "@/shared/lib/utils";

/** Minimal ring spinner - no dependency on tw-animate, uses a local keyframe. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block size-6 rounded-full border-2 border-muted-foreground/25 border-t-primary",
        className,
      )}
      style={{ animation: "ns-spin 0.7s linear infinite" }}
    />
  );
}
