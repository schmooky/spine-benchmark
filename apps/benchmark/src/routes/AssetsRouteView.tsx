import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { ToolRouteControls } from '../components/ToolRouteControls';
import { AnimationControls } from '../components/AnimationControls';
import { CanvasStatsOverlay } from '../components/CanvasStatsOverlay';
import { reparentPixiCanvas } from '../hooks/usePixiApp';

export function AssetsRouteView() {
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
    assets,
    selectedAssetId,
    setSelectedAssetId,
    atlasOptions,
    selectedAtlasName,
    setSelectedAtlasName,
    handleDeleteAsset,
    loadCurrentAssetIntoBenchmark,
    uploadBundleFiles,
    formatBytes,
    setShowUrlModal,
  } = useWorkbench();

  useEffect(() => {
    if (pixiContainerRef.current) {
      reparentPixiCanvas(pixiContainerRef.current);
    }
  });

  const handleLoadSelected = async () => {
    setIsLoadingSelected(true);
    try {
      await loadCurrentAssetIntoBenchmark();
    } finally {
      setIsLoadingSelected(false);
    }
  };

  return (
    <div className="assets-layout">
      {/* Left panel — asset management */}
      <div className="assets-panel" data-tour="asset-library">
        <div className="route-section-header">
          <h3>{t('dashboard.sections.assetLibrary')}</h3>
        </div>

        <ToolRouteControls
          assets={assets}
          selectedAssetId={selectedAssetId}
          setSelectedAssetId={setSelectedAssetId}
          atlasOptions={atlasOptions}
          selectedAtlasName={selectedAtlasName}
          setSelectedAtlasName={setSelectedAtlasName}
          onUploadBundle={uploadBundleFiles}
          onLoadSelected={handleLoadSelected}
          isLoadingSelected={isLoadingSelected}
          triggerLabel={t('dashboard.actions.import')}
        />

        <button className="secondary-btn" type="button" onClick={() => setShowUrlModal(true)}>
          {t('dashboard.actions.loadFromUrl')}
        </button>

        <div className="asset-grid route-asset-grid">
          {assets.length === 0 && <p className="subtle-text">{t('dashboard.messages.noAssets')}</p>}
          {assets.map((asset) => (
            <article
              key={asset.id}
              className={`asset-card ${selectedAssetId === asset.id ? 'active' : ''}`}
              onClick={() => setSelectedAssetId(asset.id)}
            >
              <div className="asset-thumb">
                {asset.previewImageDataUrl ? <img src={asset.previewImageDataUrl} alt={asset.name} /> : <span>{asset.name.slice(0, 1).toUpperCase()}</span>}
              </div>
              <div>
                <h3>{asset.name}</h3>
                <p>{t('dashboard.assetCard.summary', { count: asset.fileCount, size: formatBytes(asset.totalBytes) })}</p>
                {asset.description && <p className="asset-description">{asset.description}</p>}
              </div>
              <div className="asset-card-actions">
                <button
                  type="button"
                  className="mini-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleLoadSelected();
                  }}
                >
                  {t('dashboard.actions.load')}
                </button>
                <button
                  type="button"
                  className="mini-btn danger"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDeleteAsset(asset.id);
                  }}
                >
                  {t('dashboard.actions.delete')}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Right panel — live spine preview */}
      <div className="tool-canvas assets-canvas">
        <div
          className="canvas-container"
          data-tour="canvas-dropzone"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div ref={pixiContainerRef} className="pixi-host" />
          <div className="canvas-grid-overlay" />
          <CanvasStatsOverlay spineInstance={spineInstance} />

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
    </div>
  );
}
