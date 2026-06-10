import { useState } from "react";
import { Shirt, Check } from "lucide-react";

import { useSkeletonStore } from "@/entities/skeleton";
import { usePlaybackStore } from "@/entities/playback";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { cn } from "@/shared/lib/utils";

/**
 * Skin picker as a modal (not a dropdown). The trigger shows the current skin;
 * opening it lists every skin and applies the chosen one to the live skeleton.
 */
export function SkinDialog({ skins }: { skins: string[] }) {
  const selectedSkin = usePlaybackStore((s) => s.selectedSkin);
  const [open, setOpen] = useState(false);

  const pick = (name: string) => {
    const sp = useSkeletonStore.getState().spine;
    if (sp) {
      sp.skeleton.setSkinByName(name);
      sp.skeleton.setSlotsToSetupPose();
    }
    usePlaybackStore.getState().setSelectedSkin(name);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" className="gap-2">
          <Shirt className="size-4 text-primary" />
          <span className="max-w-28 truncate">{selectedSkin ?? "Skin"}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Skins</DialogTitle>
          <DialogDescription>
            Choose a skin to apply to the skeleton.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-2 pr-3">
            {skins.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => pick(name)}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  selectedSkin === name
                    ? "border-primary/50 bg-primary/15"
                    : "border-border hover:bg-accent",
                )}
              >
                <span className="truncate">{name}</span>
                {selectedSkin === name && (
                  <Check className="size-4 shrink-0 text-primary" />
                )}
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
