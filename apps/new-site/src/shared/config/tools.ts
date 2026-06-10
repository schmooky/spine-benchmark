import {
  Activity,
  Bone,
  Gauge,
  Layers,
  LibraryBig,
  Spline,
  type LucideIcon,
} from "lucide-react";

export interface ToolDef {
  id: string;
  path: string;
  label: string;
  icon: LucideIcon;
  /** if true, the tool is disabled until a skeleton is loaded */
  requiresSkeleton: boolean;
}

/** The left rail, in order. Each is a route; the route renders the tool's
 *  surface (bottom drawer, right panel) and/or activates a stage overlay. */
export const TOOLS: ToolDef[] = [
  {
    id: "library",
    path: "/library",
    label: "Library - load a spine",
    icon: LibraryBig,
    requiresSkeleton: false,
  },
  {
    id: "animations",
    path: "/animations",
    label: "Animations & heatmap",
    icon: Activity,
    requiresSkeleton: true,
  },
  {
    id: "mixer",
    path: "/mixer",
    label: "Track mixer (layering)",
    icon: Layers,
    requiresSkeleton: true,
  },
  {
    id: "bones",
    path: "/bones",
    label: "Skeleton & bones",
    icon: Bone,
    requiresSkeleton: true,
  },
  {
    id: "mesh",
    path: "/mesh",
    label: "Meshes & weights",
    icon: Spline,
    requiresSkeleton: true,
  },
  {
    id: "info",
    path: "/info",
    label: "Metrics",
    icon: Gauge,
    requiresSkeleton: true,
  },
];
