import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StoredAsset } from '../core/storage/assetStore';
import { assertCompleteAssetBundle, getAssetBundleCompleteness } from '../core/storage/assetStore';
import { FolderOpenIcon, RabbitIcon } from './Icons';
import { buildSmartAssetLink } from '../utils/smartLink';
import { parseImageUrlList } from '../utils/remoteAssetBundle';

interface ToolRouteControlsProps {
  assets: StoredAsset[];
  selectedAssetId: string | null;
  setSelectedAssetId: (id: string) => void;
  onUploadBundle?: (files: File[]) => Promise<void>;
  onPickAsset?: (assetId: string) => Promise<void> | void;
  onLoadFromUrl?: (
    jsonUrl: string,
    atlasUrl: string,
    options?: { imageUrls?: string[] },
  ) => Promise<void> | void;
  isLoadingSelected?: boolean;
  triggerLabel?: string;
  minimal?: boolean;
}

export const ToolRouteControls: React.FC<ToolRouteControlsProps> = ({
  assets,
  selectedAssetId,
  setSelectedAssetId,
  onUploadBundle,
  onPickAsset,
  onLoadFromUrl,
  isLoadingSelected = false,
  triggerLabel,
  minimal = false,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [requiredAtlasImages, setRequiredAtlasImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState<'library' | 'import'>('library');
  const [importSource, setImportSource] = useState<'file' | 'url'>('file');
  const [jsonUrl, setJsonUrl] = useState('');
  const [atlasUrl, setAtlasUrl] = useState('');
  const [imageUrlsText, setImageUrlsText] = useState('');
  const [isLoadingFromUrl, setIsLoadingFromUrl] = useState(false);
  const [smartLinkState, setSmartLinkState] = useState<'idle' | 'copied' | 'error'>('idle');
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
    () => pendingFiles.filter((file) => (file.type || '').startsWith('image/') || /\.(png|jpg|jpeg|webp|gif|avif|ktx2|basis)$/i.test(file.name)),
    [pendingFiles]
  );
  const completeness = useMemo(() => getAssetBundleCompleteness(pendingFiles), [pendingFiles]);
  const availableImageNames = useMemo(
    () => new Set(pendingTextureFiles.map((file) => file.name.toLowerCase())),
    [pendingTextureFiles]
  );
  const availableImageBaseNames = useMemo(
    () => new Set(pendingTextureFiles.map((file) => {
      const dot = file.name.lastIndexOf('.');
      return (dot > 0 ? file.name.substring(0, dot) : file.name).toLowerCase();
    })),
    [pendingTextureFiles]
  );
  const isAtlasImageAvailable = (name: string): boolean => {
    if (availableImageNames.has(name.toLowerCase())) return true;
    // Allow extension substitution (atlas says .png, file is .ktx2 / .basis / .webp etc.)
    const dot = name.lastIndexOf('.');
    const baseName = (dot > 0 ? name.substring(0, dot) : name).toLowerCase();
    return availableImageBaseNames.has(baseName);
  };
  const missingAtlasImages = useMemo(
    () => requiredAtlasImages.filter((name) => !isAtlasImageAvailable(name)),
    [requiredAtlasImages, availableImageNames, availableImageBaseNames]
  );
  const isPendingBundleComplete = completeness.hasSkeleton && completeness.hasAtlas && completeness.hasImages && missingAtlasImages.length === 0;
  const selectedAssetMeta = selectedAsset
    ? `${selectedAsset.fileCount} files`
    : t('toolRouteControls.values.noAssets');
  const parsedImageUrls = useMemo(() => parseImageUrlList(imageUrlsText), [imageUrlsText]);

  const handleAssetPick = async (assetId: string) => {
    if (isLoadingSelected) return;
    setSelectedAssetId(assetId);
    setIsOpen(false);
    try {
      await onPickAsset?.(assetId);
    } catch (error) {
      console.error('Failed to load selected asset from picker', error);
    }
  };

  const handleLoadFromUrl = async () => {
    if (!onLoadFromUrl) return;
    if (!jsonUrl.trim() || !atlasUrl.trim()) return;
    setIsLoadingFromUrl(true);
    try {
      await onLoadFromUrl(jsonUrl.trim(), atlasUrl.trim(), {
        imageUrls: parsedImageUrls,
      });
      setJsonUrl('');
      setAtlasUrl('');
      setImageUrlsText('');
      setSmartLinkState('idle');
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to load from URL', error);
    } finally {
      setIsLoadingFromUrl(false);
    }
  };

  const handleCopySmartLink = async () => {
    if (!jsonUrl.trim() || !atlasUrl.trim()) return;
    try {
      const link = await buildSmartAssetLink(
        {
          v: 1,
          j: jsonUrl.trim(),
          a: atlasUrl.trim(),
          i: parsedImageUrls.length > 0 ? parsedImageUrls : undefined,
        },
        window.location.href,
      );
      await navigator.clipboard.writeText(link);
      setSmartLinkState('copied');
    } catch (error) {
      console.error('Failed to copy smart link', error);
      setSmartLinkState('error');
    }
  };

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

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(assets.length > 0 ? 'library' : 'import');
    setImportSource('file');
  }, [isOpen, assets.length]);

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
      await onUploadBundle?.(pendingFiles);
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
      <section className={`tool-route-inline${minimal ? ' tool-route-minimal tool-route-inline-editorial' : ''}`}>
        <div className="tool-route-actions">
          <button
            type="button"
            className="secondary-btn tool-route-btn tool-route-btn-open"
            onClick={() => setIsOpen(true)}
          >
            {minimal && <FolderOpenIcon className="tool-route-btn-icon" size={14} />}
            <span>{triggerLabel || t('toolRouteControls.actions.openPicker')}</span>
          </button>
        </div>
        <div className="tool-route-inline-meta">
          <span className="tool-route-pill tool-route-pill-asset">
            {minimal && (
              <span className="tool-route-pill-icon" aria-hidden="true">
                <RabbitIcon size={14} />
              </span>
            )}
            <span className="tool-route-pill-label">
              {selectedAsset ? selectedAsset.name : t('toolRouteControls.values.noAssets')}
            </span>
          </span>
          <span className="tool-route-pill subtle tool-route-pill-meta">
            <span className="tool-route-pill-label">{selectedAssetMeta}</span>
          </span>
        </div>
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

            <div className="tool-modal-tabs" role="tablist" aria-label="Asset options">
              <button
                type="button"
                role="tab"
                className={`tool-modal-tab ${activeTab === 'library' ? 'active' : ''}`}
                aria-selected={activeTab === 'library'}
                onClick={() => setActiveTab('library')}
              >
                {t('dashboard.sections.assetLibrary')}
              </button>
              <button
                type="button"
                role="tab"
                className={`tool-modal-tab ${activeTab === 'import' ? 'active' : ''}`}
                aria-selected={activeTab === 'import'}
                onClick={() => setActiveTab('import')}
              >
                {t('toolRouteControls.actions.import')}
              </button>
            </div>

            <div className="tool-picker-modal-body">
              {activeTab === 'library' && (
                <>
                  <div className="tool-asset-grid">
                    {assets.length === 0 && <p className="subtle-text">{t('toolRouteControls.values.noAssets')}</p>}
                    {assets.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        className={`asset-card tool-asset-card ${selectedAssetId === asset.id ? 'active' : ''}`}
                        onClick={() => void handleAssetPick(asset.id)}
                        disabled={isLoadingSelected}
                      >
                        <div className="asset-thumb">
                          {asset.previewImageDataUrl ? (
                            <img src={asset.previewImageDataUrl} alt={asset.name} />
                          ) : (
                            <span>{asset.name.slice(0, 1).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="tool-asset-card-copy">
                          <h3>{asset.name}</h3>
                          <p>{asset.fileCount} files</p>
                        </div>
                      </button>
                    ))}
                  </div>
                  {assets.length === 0 && (
                    <div className="tool-library-empty-actions">
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={() => {
                          setActiveTab('import');
                          setImportSource('file');
                        }}
                      >
                        {t('toolRouteControls.actions.import')}
                      </button>
                    </div>
                  )}
                </>
              )}

              {activeTab === 'import' && (
                <>
                  <div className="tool-import-tabs" role="tablist" aria-label="Import source">
                    <button
                      type="button"
                      role="tab"
                      className={`tool-import-tab ${importSource === 'file' ? 'active' : ''}`}
                      aria-selected={importSource === 'file'}
                      onClick={() => setImportSource('file')}
                    >
                      From File
                    </button>
                    {onLoadFromUrl && (
                      <button
                        type="button"
                        role="tab"
                        className={`tool-import-tab ${importSource === 'url' ? 'active' : ''}`}
                        aria-selected={importSource === 'url'}
                        onClick={() => setImportSource('url')}
                      >
                        From URL
                      </button>
                    )}
                  </div>

                  {onLoadFromUrl && importSource === 'url' && (
                    <>
                      <div className="spine-import-divider">
                        <span>{t('ui.loadFromUrl')}</span>
                      </div>
                      <div className="tool-url-form">
                        <div className="form-group">
                          <label htmlFor="tool-json-url">{t('ui.urlModal.jsonLabel')}</label>
                          <input
                            id="tool-json-url"
                            type="url"
                            value={jsonUrl}
                            onChange={(event) => setJsonUrl(event.target.value)}
                            placeholder={t('ui.urlModal.jsonPlaceholder')}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="tool-atlas-url">{t('ui.urlModal.atlasLabel')}</label>
                          <input
                            id="tool-atlas-url"
                            type="url"
                            value={atlasUrl}
                            onChange={(event) => setAtlasUrl(event.target.value)}
                            placeholder={t('ui.urlModal.atlasPlaceholder')}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="tool-image-urls">Image URLs (one per line, optional)</label>
                          <textarea
                            id="tool-image-urls"
                            className="tool-url-textarea"
                            value={imageUrlsText}
                            onChange={(event) => setImageUrlsText(event.target.value)}
                            placeholder={`https://cdn.example.com/page-1.png\nhttps://cdn.example.com/page-2.png`}
                          />
                        </div>
                        <div className="tool-url-actions">
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => {
                              setJsonUrl('');
                              setAtlasUrl('');
                              setImageUrlsText('');
                              setSmartLinkState('idle');
                            }}
                            disabled={isLoadingFromUrl || (!jsonUrl && !atlasUrl && !imageUrlsText)}
                          >
                            {t('ui.cancel')}
                          </button>
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => void handleCopySmartLink()}
                            disabled={isLoadingFromUrl || !jsonUrl.trim() || !atlasUrl.trim()}
                          >
                            Copy smart link
                          </button>
                          <button
                            type="button"
                            className="primary-btn"
                            onClick={() => void handleLoadFromUrl()}
                            disabled={isLoadingFromUrl || !jsonUrl.trim() || !atlasUrl.trim()}
                          >
                            {isLoadingFromUrl ? t('toolRouteControls.actions.loading') : t('ui.load')}
                          </button>
                        </div>
                        {smartLinkState !== 'idle' && (
                          <p className={`tool-url-status ${smartLinkState}`}>
                            {smartLinkState === 'copied' ? 'Smart link copied.' : 'Could not copy smart link.'}
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  {importSource === 'file' && (
                    <>
                      <div className="spine-import-divider">
                        <span>{t('toolRouteControls.actions.import')}</span>
                      </div>

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

                      <div className="spine-file-slots">
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

                        {requiredAtlasImages.length > 0 && (
                          <div className="spine-texture-badges-section">
                            <span className="spine-texture-badges-label">{t('toolRouteControls.fileSlots.requiredByAtlas')}</span>
                            <div className="spine-texture-badges">
                              {requiredAtlasImages.map((name) => {
                                const found = isAtlasImageAvailable(name);
                                return (
                                  <span
                                    key={name}
                                    className={`spine-texture-badge ${found ? 'found' : 'missing'}`}
                                  >
                                    {found ? (
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                    ) : (
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                    )}
                                    {name}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

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
                      {uploadError && (
                        <div className="spine-import-error">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                          <span>{uploadError}</span>
                        </div>
                      )}

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
                    </>
                  )}
                </>
              )}
            </div>

            <input ref={skeletonInputRef} type="file" multiple className="hidden-input" accept=".json,.skel" onChange={handleInputFiles} />
            <input ref={atlasInputRef} type="file" multiple className="hidden-input" accept=".atlas,.txt" onChange={handleInputFiles} />
            <input ref={imagesInputRef} type="file" multiple className="hidden-input" accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.avif,.ktx2,.basis" onChange={handleInputFiles} />
          </section>
        </div>
      )}
    </>
  );
};
