import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import { useSessionStore } from "@/entities/session";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

/**
 * The welcome greeting, as a shadcn Dialog so it matches the design system.
 * Opens once right after login. driver.js stays in the deps for when we want a
 * real, element-anchored multi-step tour later - this is just the hello.
 */
export function WelcomeDialog() {
  const status = useSessionStore((s) => s.status);
  const tourCompleted = useSessionStore((s) => s.tourCompleted);
  const completeTour = useSessionStore((s) => s.completeTour);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (status !== "authenticated" || tourCompleted) return;
    // let the workspace paint before the greeting floats in
    const t = window.setTimeout(() => setOpen(true), 300);
    return () => window.clearTimeout(t);
  }, [status, tourCompleted]);

  const dismiss = () => {
    setOpen(false);
    completeTour();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex size-12 items-center justify-center rounded-xl border border-border bg-secondary">
            <Sparkles className="size-6 text-primary" />
          </div>
          <DialogTitle className="text-xl">
            Welcome to the Spine Workbench
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            This is your stage. Drop a Spine bundle -{" "}
            <code className="text-foreground/80">.json</code>/
            <code className="text-foreground/80">.skel</code> +{" "}
            <code className="text-foreground/80">.atlas</code> + textures -
            anywhere on the grid and it&apos;ll materialize at true 1:1 scale,
            measured and ready to inspect.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={dismiss} className="w-full sm:w-auto">
            Let&apos;s go
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
