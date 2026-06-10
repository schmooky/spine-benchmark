import { useEffect, useRef } from "react";

import { useSkeletonStore } from "@/entities/skeleton";
import { stage } from "../model/stage-controller";

/**
 * Fullscreen pixi host. Owns nothing but the mount point - the StageController
 * does the heavy lifting. Subscribes to the one active skeleton and reflects it
 * onto the stage; everything else (grid, materialize) is internal to the stage.
 */
export function StageCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const spine = useSkeletonStore((s) => s.spine);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    void stage.init(host).then(() => {
      // a skeleton may already be present (re-mount) - reflect it
      if (!disposed) stage.setSpine(useSkeletonStore.getState().spine);
    });
    return () => {
      disposed = true;
      stage.destroy();
    };
  }, []);

  useEffect(() => {
    stage.setSpine(spine);
  }, [spine]);

  return <div ref={hostRef} className="absolute inset-0 z-0" aria-hidden />;
}
