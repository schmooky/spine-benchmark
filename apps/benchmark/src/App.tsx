import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useTranslation } from 'react-i18next';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { CommandPalette } from './components/CommandPalette';
import { VersionDisplay } from './components/VersionDisplay';
import { LanguageModal } from './components/LanguageModal';
import { UrlInputModal } from './components/UrlInputModal';
import { Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
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
import { RouteSelectionState, WorkbenchProvider } from './workbench/WorkbenchContext';

type OnboardingStep = 'language' | 'intro';

const ONBOARDING_KEY = 'spine-workbench-onboarding-done-v1';
const DEFAULT_ASSET_KEY = 'spine-workbench-default-seeded-v1';
const DEFAULT_ROUTE_SELECTION: RouteSelectionState = {
  sourceRoute: null,
  slotIndex: null,
  slotName: null,
  attachmentName: null,
  atlasPage: null,
  updatedAt: 0,
};

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

const documentationLinks = [
  { labelKey: 'dashboard.links.guides.performanceScoring', href: 'https://github.com/schmooky/spine-benchmark/blob/main/README.md#performance-scoring-algorithm' },
  { labelKey: 'dashboard.links.guides.prepareExports', href: 'https://github.com/schmooky/spine-benchmark/blob/main/README.md#usage' },
  { labelKey: 'dashboard.links.guides.optimizationTips', href: 'https://esotericsoftware.com/spine-optimization' }
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

function filterAssetFilesByAtlas(files: File[], selectedAtlasName?: string | null): File[] {
  if (!selectedAtlasName) return files;
  const atlasFiles = files.filter((file) => file.name.endsWith('.atlas'));
  if (atlasFiles.length <= 1) return files;
  return files.filter((file) => !file.name.endsWith('.atlas') || file.name === selectedAtlasName);
}

const App: React.FC = () => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const pixiContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backgroundColor, setBackgroundColor] = useSafeLocalStorage('spine-benchmark-bg-color', '#282b30');
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [isDropLoading, setIsDropLoading] = useState(false);
  const [assets, setAssets] = useState<StoredAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedAtlasName, setSelectedAtlasName] = useState<string | null>(null);
  const [hasAutoLoadedAsset, setHasAutoLoadedAsset] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('language');
  const [pixelFootprint, setPixelFootprint] = useState<{ width: number; height: number; coverage: number } | null>(null);
  const [routeSelection, setRouteSelection] = useState<RouteSelectionState>(DEFAULT_ROUTE_SELECTION);
  const [lastLoadError, setLastLoadError] = useState<string | null>(null);

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
    transformConstraintsVisible,
    pathConstraintsVisible,
    toggleMeshes,
    togglePhysics,
    toggleIk,
    toggleTransformConstraints,
    togglePathConstraints,
    getCameraContainer,
    setHighlightedMeshSlot,
    setSlotHighlight,
  } = useSpineApp(app);

  const { urlLoadStatus, handleUrlLoad } = useUrlLoad({ app, loadSpineFromUrls });
  const { isAnyLoading, loadingMessage } = useLoadingState(isDropLoading, spineLoading, urlLoadStatus);

  const selectedAsset = useMemo(() => {
    if (!selectedAssetId) return null;
    return assets.find((asset) => asset.id === selectedAssetId) || null;
  }, [assets, selectedAssetId]);

  const atlasOptions = useMemo(() => {
    if (!selectedAsset) return [];
    return selectedAsset.files.filter((file) => file.name.endsWith('.atlas')).map((file) => file.name);
  }, [selectedAsset]);

  const pathname = location.pathname;

  const startGuidedTour = useCallback(() => {
    void navigate({ to: '/tools/benchmark' });
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
  }, [navigate, t]);

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

  useEffect(() => {
    if (!app || !spineInstance) {
      setPixelFootprint(null);
      return;
    }

    let lastUpdate = 0;
    const updateFootprint = () => {
      const now = performance.now();
      if (now - lastUpdate < 180) return;
      lastUpdate = now;

      const bounds = spineInstance.getBounds();
      const width = Math.max(0, Math.round(bounds.width));
      const height = Math.max(0, Math.round(bounds.height));
      const canvasArea = Math.max(1, app.screen.width * app.screen.height);
      const coverage = Math.min(100, Number((((width * height) / canvasArea) * 100).toFixed(1)));

      setPixelFootprint((prev) => {
        if (prev && prev.width === width && prev.height === height && prev.coverage === coverage) {
          return prev;
        }
        return { width, height, coverage };
      });
    };

    updateFootprint();
    app.ticker.add(updateFootprint);
    return () => {
      app.ticker.remove(updateFootprint);
    };
  }, [app, spineInstance]);

  useEffect(() => {
    if (!atlasOptions.length) {
      setSelectedAtlasName(null);
      return;
    }
    if (!selectedAtlasName || !atlasOptions.includes(selectedAtlasName)) {
      setSelectedAtlasName(atlasOptions[0]);
    }
  }, [atlasOptions, selectedAtlasName]);

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
    async (files: FileList, options?: { persist?: boolean; assetName?: string; skipNavigate?: boolean }) => {
      if (!fileProcessorRef.current) {
        const message = t('error.failedToInitialize', { 0: t('dashboard.messages.notInitialized') });
        addToast(message, 'error');
        setLastLoadError(message);
        return;
      }

      try {
        const processedFiles = await fileProcessorRef.current.handleSpineFiles(files);
        fileProcessorRef.current.validateFiles(processedFiles);
        await loadSpineFiles(processedFiles);
        setLastLoadError(null);
        setRouteSelection(DEFAULT_ROUTE_SELECTION);

        if (options?.persist !== false) {
          await persistAsset(processedFiles, options?.assetName);
        }

        if (!options?.skipNavigate) {
          void navigate({ to: '/tools/benchmark' });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : t('dashboard.messages.unknownError');
        setLastLoadError(message);
        addToast(
          t('error.loadingError', { 0: message }),
          'error'
        );
      }
    },
    [loadSpineFiles, addToast, t, persistAsset, navigate]
  );

  const loadStoredAsset = useCallback(
    async (asset: StoredAsset, atlasName?: string | null) => {
      const files = filterAssetFilesByAtlas(assetToFiles(asset), atlasName);
      await handleSpineFiles(filesToFileList(files), { persist: false, skipNavigate: true });
      setSelectedAssetId(asset.id);
    },
    [handleSpineFiles]
  );

  const loadCurrentAssetIntoBenchmark = useCallback(async () => {
    if (!selectedAsset) return;
    await loadStoredAsset(selectedAsset, selectedAtlasName);
  }, [selectedAsset, selectedAtlasName, loadStoredAsset]);

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

  const saveAndLoadOptimizedAsset = useCallback(
    async (files: File[], name: string, description: string) => {
      const asset = await saveAsset(files, name, { description });
      await refreshAssets();
      setSelectedAssetId(asset.id);
      await loadStoredAsset(asset);
    },
    [refreshAssets, loadStoredAsset]
  );

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
        const message = t('error.failedToInitialize', { 0: t('dashboard.messages.notInitialized') });
        addToast(message, 'error');
        setLastLoadError(message);
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
        const message = error instanceof Error ? error.message : t('dashboard.messages.unknownError');
        setLastLoadError(message);
        addToast(
          t('error.processingError', { 0: message }),
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

  const workbenchContextValue = useMemo(() => ({
    spineInstance,
    benchmarkData,
    showBenchmark,
    setShowBenchmarkWithHash,
    pixiContainerRef,
    urlLoadStatus,
    isAnyLoading,
    loadingMessage,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    pixelFootprint,
    selectedAsset,
    atlasOptions,
    selectedAtlasName,
    setSelectedAtlasName,
    loadStoredAsset,
    loadCurrentAssetIntoBenchmark,
    assets,
    selectedAssetId,
    setSelectedAssetId,
    handleDeleteAsset,
    handleUploadFromInput,
    fileInputRef,
    formatBytes: (bytes: number) => formatBytes(bytes, t),
    onLoadOptimizedFiles: async (files: File[]) => {
      await handleSpineFiles(filesToFileList(files));
    },
    uploadBundleFiles: async (files: File[]) => {
      await handleSpineFiles(filesToFileList(files));
    },
    toggleMeshes,
    togglePhysics,
    toggleIk,
    toggleTransformConstraints,
    togglePathConstraints,
    meshesVisible,
    setShowUrlModal,
    partnerTools,
    documentationLinks,
    saveAndLoadOptimizedAsset,
    setHighlightedMeshSlot,
    setSlotHighlight,
    routeSelection,
    setRouteSelection,
    lastLoadError,
    clearLastLoadError: () => setLastLoadError(null)
  }), [
    spineInstance,
    benchmarkData,
    showBenchmark,
    setShowBenchmarkWithHash,
    urlLoadStatus,
    isAnyLoading,
    loadingMessage,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    pixelFootprint,
    selectedAsset,
    atlasOptions,
    selectedAtlasName,
    loadStoredAsset,
    loadCurrentAssetIntoBenchmark,
    assets,
    selectedAssetId,
    handleDeleteAsset,
    handleUploadFromInput,
    toggleMeshes,
    togglePhysics,
    toggleIk,
    toggleTransformConstraints,
    togglePathConstraints,
    meshesVisible,
    t,
    handleSpineFiles,
    saveAndLoadOptimizedAsset,
    setHighlightedMeshSlot,
    setSlotHighlight,
    routeSelection,
    lastLoadError
  ]);

  return (
    <WorkbenchProvider value={workbenchContextValue}>
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <span className="sidebar-logo-mark" />
            <h1>{t('dashboard.brand.title')}</h1>
          </div>
          <p>{t('dashboard.brand.subtitle')}</p>
        </div>

        <section className="sidebar-section" data-tour="tool-switcher">
          <h2>{t('dashboard.sections.tools')}</h2>
          <div className="tool-switcher nav-list">
            <Link to="/tools/benchmark" className={`tool-chip ${pathname.startsWith('/tools/benchmark') ? 'active' : ''}`}>
              {t('dashboard.tools.benchmark')}
            </Link>
            <Link to="/tools/mesh-optimizer" className={`tool-chip ${pathname.startsWith('/tools/mesh-optimizer') ? 'active' : ''}`}>
              {t('dashboard.tools.meshOptimizer')}
            </Link>
            <Link to="/tools/physics-baker" className={`tool-chip ${pathname.startsWith('/tools/physics-baker') ? 'active' : ''}`}>
              {t('dashboard.tools.physicsBaker')}
            </Link>
            <Link to="/tools/draw-call-inspector" className={`tool-chip ${pathname.startsWith('/tools/draw-call-inspector') ? 'active' : ''}`}>
              {t('dashboard.tools.drawCallInspector')}
            </Link>
            <Link to="/tools/atlas-repack" className={`tool-chip ${pathname.startsWith('/tools/atlas-repack') ? 'active' : ''}`}>
              {t('dashboard.tools.atlasRepack')}
            </Link>
            <Link to="/tools/comparison" className={`tool-chip ${pathname.startsWith('/tools/comparison') ? 'active' : ''}`}>
              {t('dashboard.tools.comparison')}
            </Link>
            <Link to="/tools/animation-heatmap" className={`tool-chip ${pathname.startsWith('/tools/animation-heatmap') ? 'active' : ''}`}>
              {t('dashboard.tools.animationHeatmap')}
            </Link>
          </div>
        </section>

        <section className="sidebar-section">
          <h2>{t('dashboard.sections.navigation')}</h2>
          <div className="tool-switcher nav-list">
            <Link to="/assets" className={`tool-chip ${pathname.startsWith('/assets') ? 'active' : ''}`}>
              {t('dashboard.sections.assetLibrary')}
            </Link>
            <Link to="/documentation" className={`tool-chip ${pathname.startsWith('/documentation') ? 'active' : ''}`}>
              {t('dashboard.sections.documentation')}
            </Link>
            <Link to="/partners" className={`tool-chip ${pathname.startsWith('/partners') ? 'active' : ''}`}>
              {t('dashboard.sections.partners')}
            </Link>
          </div>
        </section>
        <section className="sidebar-section">
          <button type="button" className="secondary-btn sidebar-tour-btn" onClick={startGuidedTour}>
            {t('dashboard.actions.startTour')}
          </button>
        </section>
      </aside>

      <main className="workspace-main">
        <Outlet />
      </main>

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
    </WorkbenchProvider>
  );
};

export default App;
