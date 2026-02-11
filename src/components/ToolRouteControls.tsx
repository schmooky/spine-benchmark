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
  const [isDragOver, setIsDragOver] = useState(false);
  const skeletonInputRef = useRef<HTMLInputElement>(null);
  const atlasInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) || null,
    [assets, selectedAssetId]
  );
  const pendingSkeletonFile = useMemo(
    () => pendingFiles.find((file) => /\.(json|skel)$/i.test(file.name)) || null,
    [pendingFiles]
  );
  const pendingAtlasFile = useMemo(
    () => pendingFiles.find((file) => /\.(atlas|atlas\.txt)$/i.test(file.name)) || null,
    [pendingFiles]
  );
  const pendingTextureFiles = useMemo(
    () => pendingFiles.filter((file) => (file.type || '').startsWith('image/') || /\.(png|jpg|jpeg|webp|gif|avif)$/i.test(file.name)),
    [pendingFiles]
  );
  const completeness = useMemo(() => getAssetBundleCompleteness(pendingFiles), [pendingFiles]);
  const availableImageNames = useMemo(
    () => new Set(pendingTextureFiles.map((file) => file.name.toLowerCase())),
    [pendingTextureFiles]
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

  const removeFile = (fileName: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.name !== fileName));
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
    setIsDragOver(false);
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

            {/* Asset picker section */}
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

            {/* Import divider */}
            <div className="spine-import-divider">
              <span>{t('toolRouteControls.actions.import')}</span>
            </div>

            {/* Drop zone */}
            <div
              className={`spine-import-dropzone${isDragOver ? ' drag-over' : ''}`}
              onDrop={handleDrop}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsDragOver(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsDragOver(false);
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="spine-import-dropzone-title">{t('toolRouteControls.dropzone.title')}</p>
              <p className="spine-import-dropzone-hint">{t('toolRouteControls.dropzone.hint')}</p>
            </div>

            {/* File slots */}
            <div className="spine-file-slots">
              {/* Skeleton slot */}
              <div className="spine-file-slot">
                <div className={`spine-file-slot-icon${pendingSkeletonFile ? ' filled' : ''}`}>
                  {pendingSkeletonFile ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                  )}
                </div>
                <div className="spine-file-slot-info">
                  <span className="spine-file-slot-label">{t('toolRouteControls.fileSlots.skeleton')}</span>
                  {pendingSkeletonFile && <span className="spine-file-slot-name">{pendingSkeletonFile.name}</span>}
                </div>
                <div className="spine-file-slot-actions">
                  {pendingSkeletonFile ? (
                    <button type="button" className="mini-btn danger" onClick={() => removeFile(pendingSkeletonFile.name)}>
                      {t('toolRouteControls.fileSlots.remove')}
                    </button>
                  ) : (
                    <button type="button" className="mini-btn" onClick={() => skeletonInputRef.current?.click()}>
                      {t('toolRouteControls.fileSlots.select')}
                    </button>
                  )}
                </div>
              </div>

              {/* Atlas slot */}
              <div className="spine-file-slot">
                <div className={`spine-file-slot-icon${pendingAtlasFile ? ' filled' : ''}`}>
                  {pendingAtlasFile ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                  )}
                </div>
                <div className="spine-file-slot-info">
                  <span className="spine-file-slot-label">{t('toolRouteControls.fileSlots.atlas')}</span>
                  {pendingAtlasFile && <span className="spine-file-slot-name">{pendingAtlasFile.name}</span>}
                </div>
                <div className="spine-file-slot-actions">
                  {pendingAtlasFile ? (
                    <button type="button" className="mini-btn danger" onClick={() => removeFile(pendingAtlasFile.name)}>
                      {t('toolRouteControls.fileSlots.remove')}
                    </button>
                  ) : (
                    <button type="button" className="mini-btn" onClick={() => atlasInputRef.current?.click()}>
                      {t('toolRouteControls.fileSlots.select')}
                    </button>
                  )}
                </div>
              </div>

              {/* Textures slot */}
              <div className="spine-file-slot spine-file-slot-textures">
                <div className={`spine-file-slot-icon${pendingTextureFiles.length > 0 && missingAtlasImages.length === 0 ? ' filled' : ''}`}>
                  {pendingTextureFiles.length > 0 && missingAtlasImages.length === 0 ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                  )}
                </div>
                <div className="spine-file-slot-info">
                  <span className="spine-file-slot-label">{t('toolRouteControls.fileSlots.textures')}</span>
                </div>
                <div className="spine-file-slot-actions">
                  <button type="button" className="mini-btn" onClick={() => imagesInputRef.current?.click()}>
                    {t('toolRouteControls.fileSlots.select')}
                  </button>
                </div>
              </div>

              {/* Required texture badges */}
              {requiredAtlasImages.length > 0 && (
                <div className="spine-texture-badges-section">
                  <span className="spine-texture-badges-label">{t('toolRouteControls.fileSlots.requiredByAtlas')}</span>
                  <div className="spine-texture-badges">
                    {requiredAtlasImages.map((name) => (
                      <span
                        key={name}
                        className={`spine-texture-badge ${availableImageNames.has(name.toLowerCase()) ? 'found' : 'missing'}`}
                      >
                        {availableImageNames.has(name.toLowerCase()) ? (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        ) : (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        )}
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Uploaded texture files */}
              {pendingTextureFiles.length > 0 && (
                <div className="spine-texture-files">
                  {pendingTextureFiles.map((file) => (
                    <div key={file.name} className="spine-texture-file">
                      <span>{file.name}</span>
                      <button type="button" className="spine-texture-file-remove" onClick={() => removeFile(file.name)}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Hidden file inputs */}
            <input ref={skeletonInputRef} type="file" multiple className="hidden-input" accept=".json,.skel" onChange={handleInputFiles} />
            <input ref={atlasInputRef} type="file" multiple className="hidden-input" accept=".atlas,.txt" onChange={handleInputFiles} />
            <input ref={imagesInputRef} type="file" multiple className="hidden-input" accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.avif" onChange={handleInputFiles} />

            {/* Error display */}
            {uploadError && (
              <div className="spine-import-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                <span>{uploadError}</span>
              </div>
            )}

            {/* Footer */}
            <div className="tool-modal-footer">
              <button type="button" className="secondary-btn" onClick={() => { setPendingFiles([]); setUploadError(null); }}>
                {t('toolRouteControls.actions.cancel')}
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={handleSubmitBundle}
                disabled={!isPendingBundleComplete || isUploading}
              >
                {isUploading ? t('toolRouteControls.actions.importing') : t('toolRouteControls.actions.import')}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
};
