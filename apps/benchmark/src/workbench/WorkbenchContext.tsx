import React, { createContext, useContext } from 'react';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { SpineAnalysisResult } from '../core/SpineAnalyzer';
import { StoredAsset } from '../core/storage/assetStore';

export interface RouteSelectionState {
  sourceRoute: 'benchmark' | 'mesh-optimizer' | 'draw-call-inspector' | 'atlas-repack' | 'physics-baker' | 'comparison' | 'animation-heatmap' | null;
  slotIndex: number | null;
  slotName: string | null;
  attachmentName: string | null;
  atlasPage: string | null;
  updatedAt: number;
}

export interface WorkbenchContextValue {
  spineInstance: Spine | null;
  benchmarkData: SpineAnalysisResult | null;
  showBenchmark: boolean;
  setShowBenchmarkWithHash: (show: boolean) => void;
  pixiContainerRef: React.RefObject<HTMLDivElement | null>;
  urlLoadStatus: 'idle' | 'loading' | 'success' | 'error';
  isAnyLoading: boolean;
  loadingMessage: string;
  handleDrop: (event: React.DragEvent<HTMLDivElement>) => Promise<void>;
  handleDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  pixelFootprint: { width: number; height: number; coverage: number } | null;
  selectedAsset: StoredAsset | null;
  atlasOptions: string[];
  selectedAtlasName: string | null;
  setSelectedAtlasName: React.Dispatch<React.SetStateAction<string | null>>;
  loadStoredAsset: (asset: StoredAsset) => Promise<void>;
  loadCurrentAssetIntoBenchmark: () => Promise<void>;
  assets: StoredAsset[];
  selectedAssetId: string | null;
  setSelectedAssetId: React.Dispatch<React.SetStateAction<string | null>>;
  handleDeleteAsset: (assetId: string) => Promise<void>;
  handleUploadFromInput: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  formatBytes: (bytes: number) => string;
  onLoadOptimizedFiles: (files: File[]) => Promise<void>;
  uploadBundleFiles: (files: File[]) => Promise<void>;
  setShowUrlModal: React.Dispatch<React.SetStateAction<boolean>>;
  loadFromUrls: (
    jsonUrl: string,
    atlasUrl: string,
    options?: { imageUrls?: string[] },
  ) => Promise<void>;
  toggleMeshes: (visible?: boolean) => void;
  togglePhysics: (visible?: boolean) => void;
  toggleIk: (visible?: boolean) => void;
  toggleTransformConstraints: (visible?: boolean) => void;
  togglePathConstraints: (visible?: boolean) => void;
  meshesVisible: boolean;
  partnerTools: Array<{ labelKey: string; href: string }>;
  documentationLinks: Array<{ labelKey: string; href: string }>;
  saveAndLoadOptimizedAsset: (files: File[], name: string, description: string) => Promise<void>;
  setHighlightedMeshSlot: (slotName: string | null) => void;
  setSlotHighlight: (slotIndex: number | null) => void;
  viewportBackground: string;
  setViewportBackground: React.Dispatch<React.SetStateAction<string>>;
  meshHighlightColor: string;
  setMeshHighlightColor: React.Dispatch<React.SetStateAction<string>>;
  meshHighlightLineWidth: number;
  setMeshHighlightLineWidth: React.Dispatch<React.SetStateAction<number>>;
  routeSelection: RouteSelectionState;
  setRouteSelection: React.Dispatch<React.SetStateAction<RouteSelectionState>>;
  lastLoadError: string | null;
  clearLastLoadError: () => void;
}

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export function WorkbenchProvider({
  value,
  children,
}: {
  value: WorkbenchContextValue;
  children: React.ReactNode;
}) {
  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench(): WorkbenchContextValue {
  const context = useContext(WorkbenchContext);
  if (!context) {
    throw new Error('useWorkbench must be used within WorkbenchProvider');
  }
  return context;
}
