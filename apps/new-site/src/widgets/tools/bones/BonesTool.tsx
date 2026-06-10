import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bone } from "lucide-react";

import { useSkeletonStore, drawBones } from "@/entities/skeleton";
import { stage } from "@/widgets/stage";

/**
 * Bones tool - no panel, just a live overlay. Activating the route installs the
 * bone-structure draw on the stage (segments + joints, redrawn every frame so
 * it tracks animation), and a small legend chip. Leaving the route clears it.
 */
export function BonesTool() {
  const navigate = useNavigate();
  const status = useSkeletonStore((s) => s.status);

  useEffect(() => {
    stage.setOverlay(drawBones);
    return () => stage.setOverlay(null);
  }, []);

  useEffect(() => {
    if (status !== "ready") navigate("/", { replace: true });
  }, [status, navigate]);

  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-md">
        <Bone className="size-3.5 text-primary" />
        Bone structure - segments &amp; joints, live
      </div>
    </div>
  );
}
