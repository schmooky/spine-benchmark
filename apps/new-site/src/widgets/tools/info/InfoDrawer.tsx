import { useNavigate } from "react-router-dom";

import { useSkeletonStore } from "@/entities/skeleton";
import { useMetricsStore } from "@/entities/metrics";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/shared/ui/drawer";

/**
 * Info tool - a bottom shadcn Drawer showing the measurements gathered during
 * load. Reads straight from the metrics store, so it's whatever the background
 * tasks produced for the active skeleton.
 */
export function InfoDrawer() {
  const navigate = useNavigate();
  const meta = useSkeletonStore((s) => s.meta);
  const metrics = useMetricsStore((s) => s.metrics);

  const close = () => navigate("/");
  const rows = Object.values(metrics);

  return (
    <Drawer open onOpenChange={(open) => !open && close()}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-3xl">
          <DrawerHeader>
            <DrawerTitle>{meta?.name ?? "Metrics"}</DrawerTitle>
            <DrawerDescription>
              Measured at load - {rows.length} metric
              {rows.length === 1 ? "" : "s"}.
            </DrawerDescription>
          </DrawerHeader>
          <div className="max-h-[46vh] overflow-y-auto px-4 pb-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {rows.map((m) => (
                <div
                  key={m.key}
                  className="rounded-xl border border-border bg-card/60 p-4"
                >
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {m.label}
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">
                    {m.value}
                    {m.unit ? (
                      <span className="ml-1 text-sm text-muted-foreground">
                        {m.unit}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
