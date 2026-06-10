import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Boxes, UploadCloud, Trash2 } from "lucide-react";

import { useLoadSkeleton } from "@/features/load-skeleton";
import { useLibraryStore } from "@/entities/library";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/shared/ui/drawer";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { formatBytes, relativeTime } from "@/shared/lib/format";

/**
 * Library tool - a bottom shadcn Drawer of previously-uploaded spine bundles,
 * persisted in IndexedDB. Click one to re-load it through the usual
 * load -> measure -> materialize flow; trash it to forget it. Empty until the
 * first drop, where it points the user at drag-and-drop.
 */
export function LibraryDrawer() {
  const navigate = useNavigate();
  const { loadSaved } = useLoadSkeleton();
  const bundles = useLibraryStore((s) => s.bundles);
  const refresh = useLibraryStore((s) => s.refresh);
  const remove = useLibraryStore((s) => s.remove);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const close = () => navigate("/");

  return (
    <Drawer open onOpenChange={(open) => !open && close()}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-4xl">
          <DrawerHeader>
            <DrawerTitle>Library</DrawerTitle>
            <DrawerDescription>
              {bundles.length > 0
                ? "Your previously uploaded spines, saved on this device."
                : "Nothing saved yet."}
            </DrawerDescription>
          </DrawerHeader>

          {bundles.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 pb-10 pt-4 text-center">
              <div className="flex size-12 items-center justify-center rounded-full border border-border bg-card/40">
                <UploadCloud className="size-6 text-primary" />
              </div>
              <p className="max-w-sm text-sm text-muted-foreground">
                Drop a Spine bundle -{" "}
                <code className="text-foreground/80">.json</code>/
                <code className="text-foreground/80">.skel</code> +{" "}
                <code className="text-foreground/80">.atlas</code> + textures -
                anywhere on the stage. It loads, and is saved here for next time.
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[46vh] px-4 pb-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {bundles.map((b) => (
                  <div
                    key={b.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      close();
                      void loadSaved(b);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        close();
                        void loadSaved(b);
                      }
                    }}
                    className="group relative flex cursor-pointer flex-col items-start gap-2 rounded-xl border border-border bg-card/60 p-4 text-left transition-all hover:border-primary/50 hover:bg-accent"
                  >
                    <button
                      type="button"
                      aria-label={`Delete ${b.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void remove(b.id);
                      }}
                      className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="size-4" />
                    </button>

                    <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-primary transition-colors group-hover:bg-primary/15">
                      <Boxes className="size-5" />
                    </div>
                    <div className="truncate font-medium leading-tight">
                      {b.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {relativeTime(b.savedAt)} · {b.fileNames.length} files ·{" "}
                      {formatBytes(b.bytes)}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
