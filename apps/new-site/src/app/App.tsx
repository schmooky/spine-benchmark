import { Routes, Route, Navigate } from "react-router-dom";

import { useSessionStore } from "@/entities/session";
import { LoginPage } from "@/pages/login";
import { WorkspaceLayout } from "@/pages/workspace";
import {
  LibraryDrawer,
  InfoDrawer,
  BonesTool,
  MeshTool,
  AnimationsDrawer,
} from "@/widgets/tools";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { Toaster } from "@/shared/ui/sonner";

/**
 * Auth gate + routes. The workspace is one persistent layout; each tool is a
 * nested route that renders its surface through the layout's <Outlet />. The
 * stage never unmounts across tool changes.
 */
export function App() {
  const authed = useSessionStore((s) => s.status === "authenticated");

  return (
    <TooltipProvider delayDuration={200}>
      {authed ? (
        <Routes>
          <Route element={<WorkspaceLayout />}>
            <Route index element={null} />
            <Route path="library" element={<LibraryDrawer />} />
            <Route path="animations" element={<AnimationsDrawer />} />
            <Route path="info" element={<InfoDrawer />} />
            <Route path="bones" element={<BonesTool />} />
            <Route path="mesh" element={<MeshTool />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      ) : (
        <LoginPage />
      )}
      <Toaster />
    </TooltipProvider>
  );
}
