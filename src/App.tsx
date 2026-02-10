import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useTranslation } from 'react-i18next';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { AnimationControls } from './components/AnimationControls';
import { InfoPanel } from './components/InfoPanel';
import { CommandPalette } from './components/CommandPalette';
import { VersionDisplay } from './components/VersionDisplay';
import { LanguageModal } from './components/LanguageModal';
import { UrlInputModal } from './components/UrlInputModal';
import { BenchmarkPanel } from './components/BenchmarkPanel';
import { MeshOptimizerPanel } from './components/MeshOptimizerPanel';
import { useToast } from './hooks/ToastContext';
import { useSafeLocalStorage } from './hooks/useSafeLocalStorage';
import { usePixiApp } from './hooks/usePixiApp';
import { useSpineApp } from './hooks/useSpineApp';
import { useUrlLoad } from './hooks/useUrlLoad';
import { useLoadingState } from './hooks/useLoadingState';
import { useCommandRegistration } from './hooks/useCommandRegistration';
import { useUrlHash } from './hooks/useUrlHash';
import { useAppEventHandlers } from './hooks/useAppEventHandlers';
import { commandRegistry } from './utils/commandRegistry';
import { FileProcessor } from './core/utils/fileProcessor';
import {
  StoredAsset,
  assetToFiles,
  saveAsset,
  listAssets,
  deleteAsset,
  deriveAssetName
} from './core/storage/assetStore';

type ToolMode = 'benchmark' | 'optimizer';
type OnboardingStep = 'language' | 'intro';

const ONBOARDING_KEY = 'spine-workbench-onboarding-done-v1';
const DEFAULT_ASSET_KEY = 'spine-workbench-default-seeded-v1';

const languageOptions = [
  { code: 'en', labelKey: 'dashboard.languages.en' },
  { code: 'ru', labelKey: 'dashboard.languages.ru' },
  { code: 'zh', labelKey: 'dashboard.languages.zh' },
  { code: 'uk', labelKey: 'dashboard.languages.uk' },
  { code: 'fr', labelKey: 'dashboard.languages.fr' },
  { code: 'de', labelKey: 'dashboard.languages.de' },
  { code: 'pt', labelKey: 'dashboard.languages.pt' },
  { code: 'es', labelKey: 'dashboard.languages.es' },
];

const partnerTools = [
  { labelKey: 'dashboard.links.partner.spineEditor', href: 'https://esotericsoftware.com/spine-editor' },
  { labelKey: 'dashboard.links.partner.spineRuntimes', href: 'https://esotericsoftware.com/spine-runtimes' },
  { labelKey: 'dashboard.links.partner.texturePacker', href: 'https://www.codeandweb.com/texturepacker' }
];

const guides = [
  { labelKey: 'dashboard.links.guides.performanceScoring', href: 'https://github.com/schmooky/spine-benchmark/blob/main/README.md#performance-scoring-algorithm' },
  { labelKey: 'dashboard.links.guides.prepareExports', href: 'https://github.com/schmooky/spine-benchmark/blob/main/README.md#usage' },
  { labelKey: 'dashboard.links.guides.optimizationTips', href: 'https://esotericsoftware.com/spine-optimization' }
];

const communities = [
  { labelKey: 'dashboard.links.community.telegram', href: 'https://t.me/spine_benchmark' },
  { labelKey: 'dashboard.links.community.forum', href: 'https://en.esotericsoftware.com/forum/' },
  { labelKey: 'dashboard.links.community.issues', href: 'https://github.com/schmooky/spine-benchmark/issues' }
];

function formatBytes(bytes: number, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (bytes < 1024) return `${bytes} ${t('dashboard.units.byte')}`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ${t('dashboard.units.kilobyte')}`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} ${t('dashboard.units.megabyte')}`;
}

function filesToFileList(files: File[]): FileList {
  const dataTransfer = new DataTransfer();
  files.forEach((file) => dataTransfer.items.add(file));
  return dataTransfer.files;
}

const App: React.FC = () => {
  const { t, i18n } = useTranslation();
  const pixiContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backgroundColor, setBackgroundColor] = useSafeLocalStorage('spine-benchmark-bg-color', '#282b30');
  const [activeTool, setActiveTool] = useState<ToolMode>('benchmark');
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [isDropLoading, setIsDropLoading] = useState(false);
  const [assets, setAssets] = useState<StoredAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [hasAutoLoadedAsset, setHasAutoLoadedAsset] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('language');

  const { addToast } = useToast();
  const { updateHash, getStateFromHash, onHashChange } = useUrlHash();
  const { handleKeyDown, handleContextMenu, handleWheel } = useAppEventHandlers();

  const app = usePixiApp({ containerRef: pixiContainerRef, backgroundColor });

  const {
    spineInstance,
    loadSpineFiles,
    loadSpineFromUrls,
    isLoading: spineLoading,
    benchmarkData,
    meshesVisible,
    physicsVisible,
    ikVisible,
    toggleMeshes,
    togglePhysics,
    toggleIk,
    getCameraContainer,
  } = useSpineApp(app);

  const { urlLoadStatus, handleUrlLoad } = useUrlLoad({ app, loadSpineFromUrls });
  const { isAnyLoading, loadingMessage } = useLoadingState(isDropLoading, spineLoading, urlLoadStatus);

  const selectedAsset = useMemo(() => {
    if (!selectedAssetId) return null;
    return assets.find((asset) => asset.id === selectedAssetId) || null;
  }, [assets, selectedAssetId]);

  const startGuidedTour = useCallback(() => {
    setActiveTool('benchmark');
    setTimeout(() => {
      const guided = driver({
        showProgress: true,
        allowClose: true,
        animate: true,
        stagePadding: 8,
        nextBtnText: t('dashboard.tour.next'),
        prevBtnText: t('dashboard.tour.back'),
        doneBtnText: t('dashboard.tour.done'),
        steps: [
          {
            popover: {
              title: t('dashboard.tour.steps.welcome.title'),
              description: t('dashboard.tour.steps.welcome.description'),
              side: 'bottom',
              align: 'start'
            }
          },
          {
            element: '[data-tour="tool-switcher"]',
            popover: {
              title: t('dashboard.tour.steps.toolCollection.title'),
              description: t('dashboard.tour.steps.toolCollection.description'),
              side: 'right'
            }
          },
          {
            element: '[data-tour="asset-library"]',
            popover: {
              title: t('dashboard.tour.steps.assetLibrary.title'),
              description: t('dashboard.tour.steps.assetLibrary.description'),
              side: 'right'
            }
          },
          {
            element: '[data-tour="import-assets-btn"]',
            popover: {
              title: t('dashboard.tour.steps.importAssets.title'),
              description: t('dashboard.tour.steps.importAssets.description'),
              side: 'bottom'
            }
          },
          {
            element: '[data-tour="canvas-dropzone"]',
            popover: {
              title: t('dashboard.tour.steps.viewer.title'),
              description: t('dashboard.tour.steps.viewer.description'),
              side: 'left'
            }
          },
          {
            element: '[data-tour="asset-review"]',
            popover: {
              title: t('dashboard.tour.steps.assetReview.title'),
              description: t('dashboard.tour.steps.assetReview.description'),
              side: 'left'
            }
          },
          {
            element: '[data-tour="partner-links"]',
            popover: {
              title: t('dashboard.tour.steps.guidesCommunity.title'),
              description: t('dashboard.tour.steps.guidesCommunity.description'),
              side: 'right'
            }
          }
        ]
      });
      guided.drive();
    }, 250);
  }, [t]);

  const refreshAssets = useCallback(async () => {
    try {
      const stored = await listAssets();
      setAssets(stored);
      setSelectedAssetId((current) => current ?? stored[0]?.id ?? null);
    } catch (error) {
      addToast(t('error.loadingError', { 0: t('dashboard.messages.loadAssetsFailed') }), 'error');
    }
  }, [addToast, t]);

  useEffect(() => {
    refreshAssets();
  }, [refreshAssets]);

  useEffect(() => {
    const isOnboarded = localStorage.getItem(ONBOARDING_KEY) === '1';
    if (!isOnboarded) {
      setShowWelcome(true);
      setOnboardingStep('language');
    }
  }, []);

  const seedDefaultAsset = useCallback(async () => {
    const alreadySeeded = localStorage.getItem(DEFAULT_ASSET_KEY) === '1';
    if (alreadySeeded) {
      return;
    }

    try {
      const existing = await listAssets();
      if (existing.length > 0) {
        localStorage.setItem(DEFAULT_ASSET_KEY, '1');
        return;
      }

      const paths = [
        '/examples/test/skeleton.json',
        '/examples/test/skeletons.atlas',
        '/examples/test/skeletons.webp'
      ];

      const files: File[] = [];
      for (const path of paths) {
        const response = await fetch(path);
        if (!response.ok) {
          throw new Error(`Failed to fetch ${path}`);
        }
        const blob = await response.blob();
        const fileName = path.split('/').pop() || 'asset.bin';
        files.push(new File([blob], fileName, { type: blob.type }));
      }

      await saveAsset(files, t('dashboard.defaultAssetName'));
      localStorage.setItem(DEFAULT_ASSET_KEY, '1');
      await refreshAssets();
    } catch (error) {
      addToast(t('dashboard.messages.seedDefaultFailed'), 'warning');
    }
  }, [addToast, refreshAssets, t]);

  useEffect(() => {
    void seedDefaultAsset();
  }, [seedDefaultAsset]);

  useEffect(() => {
    const hashState = getStateFromHash();
    if (hashState.benchmarkInfo) {
      setShowBenchmark(true);
    }
  }, [getStateFromHash]);

  useEffect(() => {
    const cleanup = onHashChange((hashState) => {
      setShowBenchmark(hashState.benchmarkInfo);
    });
    return cleanup;
  }, [onHashChange]);

  useEffect(() => {
    const currentHashState = getStateFromHash();
    if (currentHashState.benchmarkInfo !== showBenchmark) {
      updateHash({ benchmarkInfo: showBenchmark });
    }
  }, [showBenchmark, updateHash, getStateFromHash]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, [handleContextMenu]);

  useEffect(() => {
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const fileProcessorRef = useRef<FileProcessor | null>(null);
  useEffect(() => {
    fileProcessorRef.current = app ? new FileProcessor(app) : null;
  }, [app]);

  const persistAsset = useCallback(
    async (files: FileList, customName?: string) => {
      const asset = await saveAsset(Array.from(files), customName || deriveAssetName(files));
      await refreshAssets();
      setSelectedAssetId(asset.id);
    },
    [refreshAssets]
  );

  const handleSpineFiles = useCallback(
    async (files: FileList, options?: { persist?: boolean; assetName?: string }) => {
      if (!fileProcessorRef.current) {
        addToast(t('error.failedToInitialize', { 0: t('dashboard.messages.notInitialized') }), 'error');
        return;
      }

      try {
        const processedFiles = await fileProcessorRef.current.handleSpineFiles(files);
        fileProcessorRef.current.validateFiles(processedFiles);
        await loadSpineFiles(processedFiles);

        if (options?.persist !== false) {
          await persistAsset(processedFiles, options?.assetName);
        }

        if (activeTool !== 'benchmark') {
          setActiveTool('benchmark');
        }
      } catch (error) {
        addToast(
          t('error.loadingError', { 0: error instanceof Error ? error.message : t('dashboard.messages.unknownError') }),
          'error'
        );
      }
    },
    [loadSpineFiles, addToast, t, persistAsset, activeTool]
  );

  const loadStoredAsset = useCallback(
    async (asset: StoredAsset) => {
      const files = assetToFiles(asset);
      await handleSpineFiles(filesToFileList(files), { persist: false });
      setSelectedAssetId(asset.id);
      setActiveTool('benchmark');
    },
    [handleSpineFiles]
  );

  useEffect(() => {
    if (!app || !selectedAsset || hasAutoLoadedAsset || spineInstance || isAnyLoading) {
      return;
    }

    void loadStoredAsset(selectedAsset)
      .then(() => setHasAutoLoadedAsset(true))
      .catch(() => {
        addToast(t('dashboard.messages.autoLoadFailed'), 'warning');
        setHasAutoLoadedAsset(true);
      });
  }, [app, selectedAsset, hasAutoLoadedAsset, spineInstance, isAnyLoading, loadStoredAsset, addToast, t]);

  const handleDeleteAsset = useCallback(
    async (assetId: string) => {
      try {
        await deleteAsset(assetId);
        const next = assets.filter((asset) => asset.id !== assetId);
        setAssets(next);
        if (selectedAssetId === assetId) {
          setSelectedAssetId(next[0]?.id ?? null);
        }
      } catch (error) {
        addToast(t('error.loadingError', { 0: t('dashboard.messages.deleteAssetFailed') }), 'error');
      }
    },
    [assets, selectedAssetId, addToast, t]
  );

  const handleUploadFromInput = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        await handleSpineFiles(files);
      }
      event.target.value = '';
    },
    [handleSpineFiles]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.classList.remove('highlight');

      if (!fileProcessorRef.current) {
        addToast(t('error.failedToInitialize', { 0: t('dashboard.messages.notInitialized') }), 'error');
        return;
      }

      try {
        setIsDropLoading(true);
        const items = e.dataTransfer?.items;
        if (!items || items.length === 0) {
          if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) {
            addToast(t('error.noFilesDropped'), 'error');
            return;
          }
          await handleSpineFiles(e.dataTransfer.files);
          return;
        }

        const fileList = await fileProcessorRef.current.processItems(Array.from(items));
        if (fileList.length === 0) {
          addToast(t('error.noValidFiles'), 'error');
          return;
        }

        const files = fileProcessorRef.current.convertToFileList(fileList);
        await handleSpineFiles(files);
      } catch (error) {
        addToast(
          t('error.processingError', { 0: error instanceof Error ? error.message : t('dashboard.messages.unknownError') }),
          'error'
        );
      } finally {
        setIsDropLoading(false);
      }
    },
    [addToast, t, handleSpineFiles]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('highlight');
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('highlight');
  };

  const openGitHubReadme = useCallback(() => {
    window.open('https://github.com/schmooky/spine-benchmark/blob/main/README.md', '_blank');
  }, []);

  const setShowBenchmarkWithHash = useCallback(
    (show: boolean) => {
      setShowBenchmark(show);
      updateHash({ benchmarkInfo: show });
    },
    [updateHash]
  );

  const handleWelcomeLanguageSelect = useCallback(
    async (languageCode: string) => {
      await i18n.changeLanguage(languageCode);
      setOnboardingStep('intro');
    },
    [i18n]
  );

  const finishOnboarding = useCallback(
    (withGuide: boolean) => {
      localStorage.setItem(ONBOARDING_KEY, '1');
      setShowWelcome(false);
      if (withGuide) {
        startGuidedTour();
      }
    },
    [startGuidedTour]
  );

  useCommandRegistration({
    spineInstance,
    setShowBenchmark: setShowBenchmarkWithHash,
    openGitHubReadme,
    setShowLanguageModal,
    meshesVisible,
    physicsVisible,
    ikVisible,
    toggleMeshes,
    togglePhysics,
    toggleIk,
    getCameraContainer,
  });

  useEffect(() => {
    if (app) {
      commandRegistry.register({
        id: 'file.load-from-url',
        title: t('commands.file.loadFromUrl'),
        category: 'file',
        description: t('commands.file.loadFromUrlDescription'),
        keywords: ['load', 'url', 'remote', 'cdn', 's3', 'http'],
        execute: () => setShowUrlModal(true)
      });
    }

    return () => {
      commandRegistry.unregister('file.load-from-url');
    };
  }, [app, t]);

  return (
    <div className="app-container app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-header">
          <h1>{t('dashboard.brand.title')}</h1>
          <p>{t('dashboard.brand.subtitle')}</p>
        </div>

        <section className="sidebar-section" data-tour="tool-switcher">
          <h2>{t('dashboard.sections.tools')}</h2>
          <div className="tool-switcher">
            <button
              type="button"
              className={`tool-chip ${activeTool === 'benchmark' ? 'active' : ''}`}
              onClick={() => setActiveTool('benchmark')}
            >
              {t('dashboard.tools.benchmark')}
            </button>
            <button
              type="button"
              className={`tool-chip ${activeTool === 'optimizer' ? 'active' : ''}`}
              onClick={() => setActiveTool('optimizer')}
            >
              {t('dashboard.tools.meshOptimizer')}
            </button>
          </div>
        </section>

        <section className="sidebar-section" data-tour="asset-library">
          <div className="section-header-row">
            <h2>{t('dashboard.sections.assetLibrary')}</h2>
            <button
              className="secondary-btn"
              type="button"
              data-tour="import-assets-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              {t('dashboard.actions.import')}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden-input"
            onChange={handleUploadFromInput}
          />

          <div className="asset-list">
            {assets.length === 0 && <p className="subtle-text">{t('dashboard.messages.noAssets')}</p>}
            {assets.map((asset) => (
              <article
                key={asset.id}
                className={`asset-card ${selectedAssetId === asset.id ? 'active' : ''}`}
                onClick={() => setSelectedAssetId(asset.id)}
              >
                <div>
                  <h3>{asset.name}</h3>
                  <p>{t('dashboard.assetCard.summary', { count: asset.fileCount, size: formatBytes(asset.totalBytes, t) })}</p>
                </div>
                <div className="asset-card-actions">
                  <button type="button" className="mini-btn" onClick={(event) => {
                    event.stopPropagation();
                    void loadStoredAsset(asset);
                  }}>
                    {t('dashboard.actions.load')}
                  </button>
                  <button type="button" className="mini-btn danger" onClick={(event) => {
                    event.stopPropagation();
                    void handleDeleteAsset(asset.id);
                  }}>
                    {t('dashboard.actions.delete')}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="sidebar-section quick-links" data-tour="partner-links">
          <h2>{t('dashboard.sections.partnerTools')}</h2>
          {partnerTools.map((item) => (
            <a key={item.labelKey} href={item.href} target="_blank" rel="noreferrer">{t(item.labelKey)}</a>
          ))}
        </section>

        <section className="sidebar-section quick-links">
          <h2>{t('dashboard.sections.guides')}</h2>
          {guides.map((item) => (
            <a key={item.labelKey} href={item.href} target="_blank" rel="noreferrer">{t(item.labelKey)}</a>
          ))}
        </section>

        <section className="sidebar-section quick-links">
          <h2>{t('dashboard.sections.community')}</h2>
          {communities.map((item) => (
            <a key={item.labelKey} href={item.href} target="_blank" rel="noreferrer">{t(item.labelKey)}</a>
          ))}
          <button type="button" className="secondary-btn sidebar-tour-btn" onClick={startGuidedTour}>
            {t('dashboard.actions.startTour')}
          </button>
        </section>
      </aside>

      <main className="workspace-main">
        <header className="workspace-header" data-tour="workspace-header">
          <div>
            <h2>{activeTool === 'benchmark' ? t('dashboard.workspace.benchmarkTitle') : t('dashboard.workspace.optimizerTitle')}</h2>
            <p>
              {selectedAsset
                ? t('dashboard.workspace.selectedAsset', { name: selectedAsset.name, count: selectedAsset.fileCount })
                : t('dashboard.workspace.empty')}
            </p>
          </div>
          <button className="secondary-btn" type="button" onClick={() => setShowUrlModal(true)}>
            {t('dashboard.actions.loadFromUrl')}
          </button>
        </header>

        {activeTool === 'benchmark' ? (
          <div className="benchmark-layout">
            <div
              className="canvas-container"
              data-tour="canvas-dropzone"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div ref={pixiContainerRef} className="pixi-host" />

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

            <aside className="asset-review-pane" data-tour="asset-review">
              <h3>{t('dashboard.workspace.assetReview')}</h3>
              {!selectedAsset && <p className="subtle-text">{t('dashboard.workspace.selectForReview')}</p>}
              {selectedAsset && (
                <>
                  <p className="subtle-text">{t('dashboard.workspace.updatedAt', { date: new Date(selectedAsset.updatedAt).toLocaleString() })}</p>
                  <div className="review-list">
                    {selectedAsset.files.map((file) => (
                      <div className="review-row" key={`${selectedAsset.id}-${file.name}`}>
                        <span>{file.name}</span>
                        <span>{file.type || t('dashboard.workspace.binaryType')}</span>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="primary-btn" onClick={() => void loadStoredAsset(selectedAsset)}>
                    {t('dashboard.actions.reloadSelected')}
                  </button>
                </>
              )}
            </aside>

            <div className={`controls-container ${spineInstance ? 'visible' : 'hidden'}`}>
              {spineInstance && (
                <AnimationControls
                  spineInstance={spineInstance}
                />
              )}
            </div>
          </div>
        ) : (
          <MeshOptimizerPanel
            asset={selectedAsset}
            onLoadOptimized={async (files) => {
              await handleSpineFiles(filesToFileList(files));
            }}
          />
        )}
      </main>

      {activeTool === 'benchmark' && (
        <BenchmarkPanel
          benchmarkData={benchmarkData}
          showBenchmark={showBenchmark}
          setShowBenchmark={setShowBenchmarkWithHash}
        />
      )}

      {showBenchmark && benchmarkData && activeTool === 'benchmark' && (
        <InfoPanel
          data={benchmarkData}
          onClose={() => setShowBenchmarkWithHash(false)}
        />
      )}

      {showWelcome && (
        <div className="welcome-backdrop">
          <div className="welcome-card">
            {onboardingStep === 'language' ? (
              <>
                <h2>{t('dashboard.onboarding.languageTitle')}</h2>
                <p>{t('dashboard.onboarding.languageDescription')}</p>
                <div className="welcome-language-grid">
                  {languageOptions.map((language) => (
                    <button
                      key={language.code}
                      type="button"
                      className={`welcome-language-btn ${i18n.language === language.code ? 'active' : ''}`}
                      onClick={() => void handleWelcomeLanguageSelect(language.code)}
                    >
                      {t(language.labelKey)}
                    </button>
                  ))}
                </div>
                <div className="welcome-actions">
                  <button className="secondary-btn" type="button" onClick={() => setOnboardingStep('intro')}>
                    {t('dashboard.actions.continue')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>{t('dashboard.onboarding.welcomeTitle')}</h2>
                <p>
                  {t('dashboard.onboarding.welcomeDescription')}
                </p>
                <div className="welcome-actions">
                  <button className="primary-btn" type="button" onClick={() => finishOnboarding(true)}>
                    {t('dashboard.actions.startTour')}
                  </button>
                  <button className="secondary-btn" type="button" onClick={() => finishOnboarding(false)}>
                    {t('dashboard.actions.skipForNow')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <ToastContainer
        position="top-center"
        autoClose={2000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />

      <CommandPalette />

      <VersionDisplay
        appVersion="1.2.0"
        spineVersion="4.2.*"
      />

      <LanguageModal
        isOpen={showLanguageModal}
        onClose={() => setShowLanguageModal(false)}
      />

      <UrlInputModal
        isOpen={showUrlModal}
        onClose={() => setShowUrlModal(false)}
        onLoad={handleUrlLoad}
      />
    </div>
  );
};

export default App;
