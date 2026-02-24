import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { ToolRouteControls } from '../components/ToolRouteControls';
import { AnimationControls } from '../components/AnimationControls';
import { CanvasStatsOverlay } from '../components/CanvasStatsOverlay';
import { reparentPixiCanvas } from '../hooks/usePixiApp';
import { RouteHeaderCard } from '../components/RouteHeaderCard';

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
    handleDeleteAsset,
    loadStoredAsset,
    uploadBundleFiles,
    formatBytes,
    loadFromUrls,
  } = useWorkbench();

  useEffect(() => {
    if (pixiContainerRef.current) {
      reparentPixiCanvas(pixiContainerRef.current);
    }
  });

  const handlePickAsset = async (assetId: string) => {
    const asset = assets.find((entry) => entry.id === assetId);
    if (!asset) return;
    setIsLoadingSelected(true);
    try {
      setSelectedAssetId(assetId);
      await loadStoredAsset(asset);
    } finally {
      setIsLoadingSelected(false);
    }
  };

  return (
    <div className="route-workspace">
      <RouteHeaderCard
        title={t('dashboard.sections.assetLibrary')}
        subtitle={t('assets.subtitle')}
      />

      <ToolRouteControls
        minimal
        assets={assets}
        selectedAssetId={selectedAssetId}
        setSelectedAssetId={setSelectedAssetId}
        onUploadBundle={uploadBundleFiles}
        onPickAsset={handlePickAsset}
        onLoadFromUrl={loadFromUrls}
        isLoadingSelected={isLoadingSelected}
      />

      <div className="assets-layout">
      {/* Left panel — asset management */}
      <div className="tool-panel assets-panel" data-tour="asset-library">
        <div className="route-section-header">
          <h3>{t('dashboard.sections.assetLibrary')}</h3>
        </div>

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
                    void handlePickAsset(asset.id);
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
    </div>
  );
}
