import React from 'react';
import { DrawCallInspectorPanel } from '../components/DrawCallInspectorPanel';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { ToolRouteControls } from '../components/ToolRouteControls';

export function DrawCallInspectorRouteView() {
  const {
    selectedAsset,
    selectedAtlasName,
    assets,
    selectedAssetId,
    setSelectedAssetId,
    atlasOptions,
    setSelectedAtlasName,
    uploadBundleFiles,
  } = useWorkbench();

  return (
    <>
      <ToolRouteControls
        assets={assets}
        selectedAssetId={selectedAssetId}
        setSelectedAssetId={(id) => setSelectedAssetId(id)}
        atlasOptions={atlasOptions}
        selectedAtlasName={selectedAtlasName}
        setSelectedAtlasName={setSelectedAtlasName}
        onUploadBundle={uploadBundleFiles}
      />
      <DrawCallInspectorPanel asset={selectedAsset} atlasFileName={selectedAtlasName} />
    </>
  );
}
