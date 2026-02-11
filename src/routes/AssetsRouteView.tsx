import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { ToolRouteControls } from '../components/ToolRouteControls';

export function AssetsRouteView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    assets,
    selectedAssetId,
    setSelectedAssetId,
    atlasOptions,
    selectedAtlasName,
    setSelectedAtlasName,
    handleDeleteAsset,
    loadStoredAsset,
    uploadBundleFiles,
    formatBytes,
  } = useWorkbench();

  return (
    <section className="route-section" data-tour="asset-library">
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
        triggerLabel={t('dashboard.actions.import')}
      />

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
                  void loadStoredAsset(asset).then(() => navigate({ to: '/tools/benchmark' }));
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
    </section>
  );
}
