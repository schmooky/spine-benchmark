import React from 'react';
import { AtlasRepackPanel } from '../components/AtlasRepackPanel';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { ToolRouteControls } from '../components/ToolRouteControls';

export function AtlasRepackRouteView() {
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
      <AtlasRepackPanel asset={selectedAsset} atlasFileName={selectedAtlasName} />
    </>
  );
}
