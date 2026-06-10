import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { useSkeletonStore, analyzeAnimations } from "@/entities/skeleton";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/shared/ui/drawer";

/** white cell at an opacity that scales with keyframe density */
function heatColor(value: number, max: number): string {
  if (max <= 0 || value <= 0) return "rgba(255,255,255,0.035)";
  const a = 0.14 + 0.86 * (value / max);
  return `rgba(255,255,255,${a.toFixed(3)})`;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
      {children}
    </span>
  );
}

/**
 * Animations tool - a bottom shadcn Drawer listing every animation with its
 * overall stats and a keyframe-density heatmap (animated bones down, time
 * across; brighter = more keys in that slice). Scrollable.
 */
export function AnimationsDrawer() {
  const navigate = useNavigate();
  const spine = useSkeletonStore((s) => s.spine);
  const animations = useMemo(
    () => (spine ? analyzeAnimations(spine) : []),
    [spine],
  );

  const close = () => navigate("/");

  return (
    <Drawer open onOpenChange={(open) => !open && close()}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-3xl">
          <DrawerHeader>
            <DrawerTitle>Animations</DrawerTitle>
            <DrawerDescription>
              {animations.length} animation{animations.length === 1 ? "" : "s"} ·
              keyframe-density heatmap per animated bone over the timeline.
            </DrawerDescription>
          </DrawerHeader>

          <div className="max-h-[58vh] overflow-y-auto px-4 pb-6">
            <div className="flex flex-col gap-3">
              {animations.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  This skeleton has no animations.
                </p>
              )}

              {animations.map((a) => (
                <div
                  key={a.name}
                  className="rounded-xl border border-border bg-card/50 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.name}</span>
                    <Chip>{a.duration.toFixed(2)}s</Chip>
                    <span className="flex-1" />
                    <Chip>{a.timelineCount} timelines</Chip>
                    <Chip>{a.keyCount} keys</Chip>
                    <Chip>{a.boneCount} bones</Chip>
                    {a.slotCount > 0 && <Chip>{a.slotCount} slots</Chip>}
                    {a.eventCount > 0 && <Chip>{a.eventCount} events</Chip>}
                  </div>

                  {a.heat.rows.length > 0 ? (
                    <div className="mt-3 flex flex-col gap-px">
                      {a.heat.rows.map((row) => (
                        <div key={row.name} className="flex items-center gap-2">
                          <div className="w-24 shrink-0 truncate text-right text-[11px] text-muted-foreground">
                            {row.name}
                          </div>
                          <div className="flex flex-1 gap-px">
                            {row.buckets.map((v, i) => (
                              <div
                                key={i}
                                className="h-3 flex-1 rounded-[1px]"
                                style={{ backgroundColor: heatColor(v, a.heat.max) }}
                                title={`${row.name}: ${v} key${v === 1 ? "" : "s"}`}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                      <div className="mt-1 flex items-center gap-2">
                        <div className="w-24 shrink-0" />
                        <div className="flex flex-1 justify-between text-[10px] text-muted-foreground/70">
                          <span>0s</span>
                          {a.heat.extraBones > 0 && (
                            <span>+{a.heat.extraBones} more bones</span>
                          )}
                          <span>{a.duration.toFixed(2)}s</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      No bone timelines{" "}
                      {a.eventCount > 0 || a.hasOther
                        ? "(slot / event / draw-order only)"
                        : ""}
                      .
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
