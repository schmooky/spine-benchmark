import React from 'react';
import { PhysicsBakerPanel } from '../components/PhysicsBakerPanel';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { ToolRouteControls } from '../components/ToolRouteControls';

export function PhysicsBakerRouteView() {
  const {
    selectedAsset,
    onLoadOptimizedFiles,
    assets,
    selectedAssetId,
    setSelectedAssetId,
    atlasOptions,
    selectedAtlasName,
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
      <PhysicsBakerPanel asset={selectedAsset} onLoadBaked={onLoadOptimizedFiles} />
    </>
  );
}
