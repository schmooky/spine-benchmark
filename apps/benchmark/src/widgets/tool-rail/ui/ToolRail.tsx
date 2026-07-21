import { useLocation, useNavigate } from "react-router-dom";

import { TOOLS } from "@/shared/config/tools";
import { useSkeletonStore } from "@/entities/skeleton";
import { cn } from "@/shared/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui/tooltip";

/**
 * The left icon rail - no labels, tooltips on hover. Each icon is a route;
 * clicking toggles the tool (navigate to it, or back to the stage if it's
 * already active). Skeleton-dependent tools are disabled until one is loaded.
 */
export function ToolRail() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const hasSkeleton = useSkeletonStore((s) => s.status === "ready");

  return (
    <nav className="pointer-events-auto absolute bottom-4 left-4 z-30">
      <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card/70 p-1.5 shadow-xl backdrop-blur-md">
        {TOOLS.map((tool) => {
          const active = pathname === tool.path;
          const disabled = tool.requiresSkeleton && !hasSkeleton;
          const Icon = tool.icon;
          return (
            <Tooltip key={tool.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={tool.label}
                  aria-pressed={active}
                  onClick={() => navigate(active ? "/" : tool.path)}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-xl transition-all",
                    "text-muted-foreground hover:text-foreground",
                    "disabled:pointer-events-none disabled:opacity-30",
                    active
                      ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                      : "hover:bg-accent",
                  )}
                >
                  <Icon className="size-[18px]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {disabled ? `${tool.label} - load a skeleton first` : tool.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </nav>
  );
}
