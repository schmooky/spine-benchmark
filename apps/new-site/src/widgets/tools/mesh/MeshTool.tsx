import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Spline } from "lucide-react";

import {
  useSkeletonStore,
  makeMeshDraw,
  listMeshAttachments,
  type MeshEntry,
} from "@/entities/skeleton";
import { stage } from "@/widgets/stage";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { cn } from "@/shared/lib/utils";

/**
 * Mesh tool - a right-docked, non-modal panel (the stage stays interactive). It
 * lists the skeleton's mesh attachments as a flat named list (not a tree).
 * Selecting one draws its deformed wireframe + weight-colored vertices live on
 * the skeleton, the way Spine shows weights.
 */
export function MeshTool() {
  const navigate = useNavigate();
  const spine = useSkeletonStore((s) => s.spine);
  const status = useSkeletonStore((s) => s.status);

  const [entries, setEntries] = useState<MeshEntry[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [shown, setShown] = useState(false);

  // slide in on mount
  useEffect(() => {
    const t = window.setTimeout(() => setShown(true), 20);
    return () => window.clearTimeout(t);
  }, []);

  // build the list from the active skeleton; bounce out if none
  useEffect(() => {
    if (status !== "ready" || !spine) {
      navigate("/", { replace: true });
      return;
    }
    const list = listMeshAttachments(spine);
    setEntries(list);
    setSelected(list[0]?.slotIndex ?? null);
  }, [spine, status, navigate]);

  // drive the stage overlay from the selection
  useEffect(() => {
    if (selected == null) {
      stage.setOverlay(null);
      return;
    }
    stage.setOverlay(makeMeshDraw(selected));
    return () => stage.setOverlay(null);
  }, [selected]);

  const close = () => navigate("/");

  return (
    <div
      className={cn(
        "pointer-events-auto absolute right-4 top-4 bottom-4 z-30 flex w-72 flex-col rounded-2xl border border-border bg-card/80 shadow-2xl backdrop-blur-md transition-transform duration-300 ease-out",
        shown ? "translate-x-0" : "translate-x-[120%]",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Spline className="size-4 text-primary" />
          <span className="text-sm font-medium">Meshes</span>
          <span className="text-xs text-muted-foreground">
            {entries.length}
          </span>
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

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-2">
          {entries.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              This skeleton has no mesh attachments.
            </p>
          )}
          {entries.map((e) => (
            <button
              key={`${e.slotIndex}:${e.attachmentName}`}
              type="button"
              onClick={() => setSelected(e.slotIndex)}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-colors",
                selected === e.slotIndex
                  ? "bg-primary/15 text-foreground ring-1 ring-primary/40"
                  : "hover:bg-accent",
              )}
            >
              <span className="text-sm font-medium leading-tight">
                {e.attachmentName}
              </span>
              <span className="text-xs text-muted-foreground">
                {e.slotName} · {e.vertices} verts ·{" "}
                {e.weighted ? "weighted" : "rigid"}
              </span>
            </button>
          ))}
        </div>
      </ScrollArea>

      <div className="border-t border-border px-4 py-2.5 text-[11px] leading-snug text-muted-foreground">
        Vertices colored by dominant bone, sized by weight.
      </div>
    </div>
  );
}
