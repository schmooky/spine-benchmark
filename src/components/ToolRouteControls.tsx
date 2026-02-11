import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StoredAsset } from '../core/storage/assetStore';
import { assertCompleteAssetBundle, getAssetBundleCompleteness } from '../core/storage/assetStore';

interface ToolRouteControlsProps {
  assets: StoredAsset[];
  selectedAssetId: string | null;
  setSelectedAssetId: (id: string) => void;
  atlasOptions: string[];
  selectedAtlasName: string | null;
  setSelectedAtlasName: (name: string) => void;
  onUploadBundle: (files: File[]) => Promise<void>;
  onLoadSelected?: () => Promise<void> | void;
  isLoadingSelected?: boolean;
  triggerLabel?: string;
}

export const ToolRouteControls: React.FC<ToolRouteControlsProps> = ({
  assets,
  selectedAssetId,
  setSelectedAssetId,
  atlasOptions,
  selectedAtlasName,
  setSelectedAtlasName,
  onUploadBundle,
  onLoadSelected,
  isLoadingSelected = false,
  triggerLabel,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [requiredAtlasImages, setRequiredAtlasImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const allInputRef = useRef<HTMLInputElement>(null);
  const skeletonInputRef = useRef<HTMLInputElement>(null);
  const atlasInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) || null,
    [assets, selectedAssetId]
  );
  const pendingAtlasFile = useMemo(
    () => pendingFiles.find((file) => /\.(atlas|atlas\.txt)$/i.test(file.name)) || null,
    [pendingFiles]
  );
  const completeness = useMemo(() => getAssetBundleCompleteness(pendingFiles), [pendingFiles]);
  const availableImageNames = useMemo(
    () => new Set(pendingFiles.filter((file) => (file.type || '').startsWith('image/') || /\.(png|jpg|jpeg|webp|gif|avif)$/i.test(file.name)).map((file) => file.name.toLowerCase())),
    [pendingFiles]
  );
  const missingAtlasImages = useMemo(
    () => requiredAtlasImages.filter((name) => !availableImageNames.has(name.toLowerCase())),
    [requiredAtlasImages, availableImageNames]
  );
  const isPendingBundleComplete = completeness.hasSkeleton && completeness.hasAtlas && completeness.hasImages && missingAtlasImages.length === 0;

  const mergeFiles = (files: File[]) => {
    if (!files.length) return;
    setPendingFiles((prev) => {
      const map = new Map(prev.map((file) => [file.name, file] as const));
      files.forEach((file) => map.set(file.name, file));
      return Array.from(map.values());
    });
    setUploadError(null);
  };

  const extractAtlasPageNames = (atlasText: string): string[] => {
    const lines = atlasText.split(/\r?\n/);
    const pages: string[] = [];
    const metadataKeys = new Set(['size', 'format', 'filter', 'repeat', 'pma', 'scale']);
    let currentCandidate: string | null = null;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!line) {
        currentCandidate = null;
        continue;
      }
      if (line.includes(':')) continue;

      const next = lines.slice(i + 1).map((item) => item.trim()).find(Boolean) ?? '';
      if (next.includes(':')) {
        const key = next.split(':')[0].trim();
        if (metadataKeys.has(key)) {
          currentCandidate = line;
          if (!pages.includes(currentCandidate)) pages.push(currentCandidate);
        }
      }
    }
    return pages;
  };

  useEffect(() => {
    let active = true;
    if (!pendingAtlasFile) {
      setRequiredAtlasImages([]);
      return;
    }
    pendingAtlasFile
      .text()
      .then((text) => {
        if (!active) return;
        setRequiredAtlasImages(extractAtlasPageNames(text));
      })
      .catch(() => {
        if (!active) return;
        setRequiredAtlasImages([]);
      });
    return () => {
      active = false;
    };
  }, [pendingAtlasFile]);

  const handleInputFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    mergeFiles(files);
    event.target.value = '';
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
    mergeFiles(files);
  };

  const handleSubmitBundle = async () => {
    try {
      assertCompleteAssetBundle(pendingFiles);
      if (missingAtlasImages.length > 0) {
        throw new Error(t('toolRouteControls.errors.missingAtlasImages', { count: missingAtlasImages.length }));
      }
    } catch (caughtError) {
      setUploadError(caughtError instanceof Error ? caughtError.message : t('toolRouteControls.errors.incompleteBundle'));
      return;
    }

    setIsUploading(true);
    try {
      await onUploadBundle(pendingFiles);
      setPendingFiles([]);
      setRequiredAtlasImages([]);
      setUploadError(null);
      setIsOpen(false);
    } catch (caughtError) {
      setUploadError(caughtError instanceof Error ? caughtError.message : t('toolRouteControls.errors.uploadFailed'));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <section className="tool-route-inline">
        <div className="tool-route-actions">
          <button type="button" className="secondary-btn" onClick={() => setIsOpen(true)}>
            {triggerLabel || t('toolRouteControls.actions.openPicker')}
          </button>
          {onLoadSelected && (
            <button type="button" className="primary-btn" onClick={() => void onLoadSelected()} disabled={isLoadingSelected}>
              {isLoadingSelected ? t('toolRouteControls.actions.loading') : t('toolRouteControls.actions.loadSelected')}
            </button>
          )}
        </div>
        <p className="subtle-text">
          {selectedAsset
            ? t('toolRouteControls.summary', { asset: selectedAsset.name, atlas: selectedAtlasName || t('toolRouteControls.values.noAtlas') })
            : t('toolRouteControls.values.noAssets')}
        </p>
      </section>

      {isOpen && (
        <div className="tool-picker-modal-backdrop" onClick={() => setIsOpen(false)}>
          <section className="tool-picker-modal" onClick={(event) => event.stopPropagation()}>
            <div className="route-section-header">
              <h3>{t('toolRouteControls.title')}</h3>
              <button type="button" className="secondary-btn" onClick={() => setIsOpen(false)}>
                {t('toolRouteControls.actions.close')}
              </button>
            </div>

            <div className="tool-route-grid">
              <label className="tool-route-field">
                <span>{t('toolRouteControls.labels.asset')}</span>
                <div className="tool-asset-list">
                  {assets.length === 0 && <p className="subtle-text">{t('toolRouteControls.values.noAssets')}</p>}
                  {assets.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      className={`tool-asset-item ${selectedAssetId === asset.id ? 'active' : ''}`}
                      onClick={() => setSelectedAssetId(asset.id)}
                    >
                      {asset.name}
                    </button>
                  ))}
                </div>
              </label>

              <label className="tool-route-field">
                <span>{t('toolRouteControls.labels.atlas')}</span>
                <select
                  value={selectedAtlasName ?? ''}
                  onChange={(event) => setSelectedAtlasName(event.target.value)}
                  disabled={atlasOptions.length === 0}
                >
                  {atlasOptions.length === 0 ? (
                    <option value="">{t('toolRouteControls.values.noAtlas')}</option>
                  ) : (
                    atlasOptions.map((atlasName) => (
                      <option key={atlasName} value={atlasName}>
                        {atlasName}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>

            <div
              className="tool-drop-zone"
              onDrop={handleDrop}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              <p>{t('toolRouteControls.dropHint')}</p>
              <div className="tool-drop-actions">
                <button type="button" className="secondary-btn" onClick={() => allInputRef.current?.click()}>
                  {t('toolRouteControls.actions.addAll')}
                </button>
                <button type="button" className="secondary-btn" onClick={() => skeletonInputRef.current?.click()}>
                  {t('toolRouteControls.actions.addSkeleton')}
                </button>
                <button type="button" className="secondary-btn" onClick={() => atlasInputRef.current?.click()}>
                  {t('toolRouteControls.actions.addAtlas')}
                </button>
                <button type="button" className="secondary-btn" onClick={() => imagesInputRef.current?.click()}>
                  {t('toolRouteControls.actions.addImages')}
                </button>
              </div>
            </div>

            <input ref={allInputRef} type="file" multiple className="hidden-input" onChange={handleInputFiles} />
            <input ref={skeletonInputRef} type="file" multiple className="hidden-input" accept=".json,.skel" onChange={handleInputFiles} />
            <input ref={atlasInputRef} type="file" multiple className="hidden-input" accept=".atlas,.txt" onChange={handleInputFiles} />
            <input ref={imagesInputRef} type="file" multiple className="hidden-input" accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.avif" onChange={handleInputFiles} />

            <div className="tool-bundle-status">
              <p>{t('toolRouteControls.status.filesAdded', { count: pendingFiles.length })}</p>
              <p>{completeness.hasSkeleton ? t('toolRouteControls.status.skeletonReady') : t('toolRouteControls.status.skeletonMissing')}</p>
              <p>{completeness.hasAtlas ? t('toolRouteControls.status.atlasReady') : t('toolRouteControls.status.atlasMissing')}</p>
              <p>{completeness.hasImages ? t('toolRouteControls.status.imagesReady') : t('toolRouteControls.status.imagesMissing')}</p>
              {requiredAtlasImages.length > 0 && (
                <p>
                  {missingAtlasImages.length === 0
                    ? t('toolRouteControls.status.atlasImagesResolved', { count: requiredAtlasImages.length })
                    : t('toolRouteControls.status.atlasImagesMissing', { count: missingAtlasImages.length })}
                </p>
              )}
              {uploadError && <p className="error-text">{uploadError}</p>}
            </div>

            <div className="tool-modal-footer">
              <button type="button" className="secondary-btn" onClick={() => setPendingFiles([])}>
                {t('toolRouteControls.actions.clear')}
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={handleSubmitBundle}
                disabled={!isPendingBundleComplete || isUploading}
              >
                {isUploading ? t('toolRouteControls.actions.uploading') : t('toolRouteControls.actions.uploadBundle')}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
};
