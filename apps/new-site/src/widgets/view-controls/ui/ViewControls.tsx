import { ZoomIn, ZoomOut, Frame } from "lucide-react";

import { stage, useViewStore } from "@/widgets/stage";
import { Button } from "@/shared/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui/tooltip";

/**
 * Bottom-right camera controls: zoom out / in, a live zoom percentage that
 * doubles as a reset button, and an explicit reset-view button. Pan with a
 * drag on the stage, zoom with the wheel; everything eases.
 */
export function ViewControls() {
  const zoom = useViewStore((s) => s.zoom);

  return (
    <div className="pointer-events-auto absolute bottom-5 right-5 z-30 flex items-center gap-0.5 rounded-xl border border-border bg-card/70 p-1 shadow-xl backdrop-blur-md">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Zoom out"
            onClick={() => stage.zoomBy(1 / 1.2)}
          >
            <ZoomOut />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Zoom out</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => stage.resetView()}
            className="min-w-[3.25rem] rounded-md px-1 py-1.5 text-center text-xs font-medium tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {Math.round(zoom * 100)}%
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Reset zoom</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Zoom in"
            onClick={() => stage.zoomBy(1.2)}
          >
            <ZoomIn />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Zoom in</TooltipContent>
      </Tooltip>

      <div className="mx-0.5 h-5 w-px bg-border" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Reset view"
            onClick={() => stage.resetView()}
          >
            <Frame />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Reset view</TooltipContent>
      </Tooltip>
    </div>
  );
}
