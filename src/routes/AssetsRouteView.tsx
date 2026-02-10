import React from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkbench } from '../workbench/WorkbenchContext';

export function AssetsRouteView() {
  const { t } = useTranslation();
  const {
    assets,
    selectedAssetId,
    setSelectedAssetId,
    handleDeleteAsset,
    loadStoredAsset,
    fileInputRef,
    handleUploadFromInput,
    formatBytes,
  } = useWorkbench();

  return (
    <section className="route-section" data-tour="asset-library">
      <div className="route-section-header">
        <h3>{t('dashboard.sections.assetLibrary')}</h3>
        <button className="secondary-btn" type="button" data-tour="import-assets-btn" onClick={() => fileInputRef.current?.click()}>
          {t('dashboard.actions.import')}
        </button>
      </div>
      <input ref={fileInputRef} type="file" multiple className="hidden-input" onChange={handleUploadFromInput} />

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
            </div>
            <div className="asset-card-actions">
              <button
                type="button"
                className="mini-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  void loadStoredAsset(asset);
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
