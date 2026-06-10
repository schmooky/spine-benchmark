import { useRef, useState, type DragEvent } from "react";
import { Outlet } from "react-router-dom";

import { StageCanvas } from "@/widgets/stage";
import { DropOverlay } from "@/widgets/drop-overlay";
import { ToolRail } from "@/widgets/tool-rail";
import { AnimSkinPanel } from "@/widgets/anim-panel";
import { WelcomeDialog } from "@/features/onboarding-tour";
import { useLoadSkeleton } from "@/features/load-skeleton";
import { useSkeletonStore } from "@/entities/skeleton";

/**
 * The persistent workbench shell. The pixi stage, drop handling, tool rail and
 * transport live here and survive route changes; the active tool's surface
 * (bottom drawer, right panel, overlay) renders through <Outlet />. The whole
 * surface is the drop area.
 */
export function WorkspaceLayout() {
  const { load } = useLoadSkeleton();
  const meta = useSkeletonStore((s) => s.meta);
  const status = useSkeletonStore((s) => s.status);

  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer?.types?.includes("Files")) {
      dragDepth.current += 1;
      setIsDragging(true);
    }
  };
  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) void load(files);
  };

  return (
    <main
      className="relative h-full w-full overflow-hidden bg-background"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <StageCanvas />
      <DropOverlay isDragging={isDragging} />

      <ToolRail />
      <AnimSkinPanel />

      {/* active tool surface */}
      <Outlet />

      <WelcomeDialog />

      <header className="pointer-events-none absolute left-5 top-5 z-20 flex items-center gap-2">
        <div className="size-2.5 rounded-full bg-primary shadow-[0_0_12px] shadow-primary/70" />
        <span className="text-sm font-medium tracking-tight text-foreground/90">
          Spine Workbench
        </span>
        {status === "ready" && meta && (
          <span className="ml-2 rounded-md border border-border bg-card/60 px-2 py-0.5 text-xs text-muted-foreground backdrop-blur-sm">
            {meta.name} · {meta.bones} bones · scale 1:1
          </span>
        )}
      </header>
    </main>
  );
}
