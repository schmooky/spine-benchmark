import { useRef, useState, type DragEvent } from "react";
import { Outlet } from "react-router-dom";

import { StageCanvas } from "@/widgets/stage";
import { DropOverlay } from "@/widgets/drop-overlay";
import { ToolRail } from "@/widgets/tool-rail";
import { AnimSkinPanel } from "@/widgets/anim-panel";
import { ViewControls } from "@/widgets/view-controls";
import { WelcomeDialog } from "@/features/onboarding-tour";
import { useLoadSkeleton } from "@/features/load-skeleton";

/**
 * The persistent workbench shell. The pixi stage, drop handling, tool rail and
 * transport live here and survive route changes; the active tool's surface
 * (bottom drawer, right panel, overlay) renders through <Outlet />. The whole
 * surface is the drop area.
 */
export function WorkspaceLayout() {
  const { load } = useLoadSkeleton();

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
      <ViewControls />

      {/* active tool surface */}
      <Outlet />

      <WelcomeDialog />
    </main>
  );
}
