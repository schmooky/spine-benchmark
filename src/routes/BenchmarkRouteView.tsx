import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimationControls } from '../components/AnimationControls';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { ToolRouteControls } from '../components/ToolRouteControls';

export function BenchmarkRouteView() {
  const { t } = useTranslation();
  const [isLoadingSelected, setIsLoadingSelected] = useState(false);
  const {
    spineInstance,
    urlLoadStatus,
    isAnyLoading,
    loadingMessage,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    pixiContainerRef,
    pixelFootprint,
    assets,
    selectedAssetId,
    setSelectedAssetId,
    atlasOptions,
    selectedAtlasName,
    setSelectedAtlasName,
    loadCurrentAssetIntoBenchmark,
    uploadBundleFiles,
  } = useWorkbench();

  const handleLoadSelected = async () => {
    setIsLoadingSelected(true);
    try {
      await loadCurrentAssetIntoBenchmark();
    } finally {
      setIsLoadingSelected(false);
    }
  };

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
        onLoadSelected={handleLoadSelected}
        isLoadingSelected={isLoadingSelected}
      />

      <div className="benchmark-layout">
        <div
          className="canvas-container"
          data-tour="canvas-dropzone"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div ref={pixiContainerRef} className="pixi-host" />
          <div className="canvas-grid-overlay" />
          {pixelFootprint && (
            <div className="pixel-footprint-overlay">
              <span>{t('dashboard.workspace.pixelFootprint', { width: pixelFootprint.width, height: pixelFootprint.height })}</span>
              <strong>{t('dashboard.workspace.canvasCoverage', { coverage: pixelFootprint.coverage })}</strong>
            </div>
          )}

          {!spineInstance && urlLoadStatus !== 'loading' && (
            <div className="drop-area">
              <p>{t('dashboard.workspace.dropArea')}</p>
            </div>
          )}

          {isAnyLoading && (
            <div className="loading-indicator">
              <p>{loadingMessage}</p>
            </div>
          )}
        </div>

        <div className={`controls-container ${spineInstance ? 'visible' : 'hidden'}`}>
          {spineInstance && <AnimationControls spineInstance={spineInstance} />}
        </div>
      </div>
    </>
  );
}
