import { Application } from 'pixi.js';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useTranslation } from 'react-i18next';
import { AnimationControls } from './components/AnimationControls';
import { InfoPanel } from './components/InfoPanel';
import { CommandPalette } from './components/CommandPalette';
import { VersionDisplay } from './components/VersionDisplay';
import { LanguageModal } from './components/LanguageModal';
import { BenchmarkPanel } from './components/BenchmarkPanel';
import { DropZone } from './components/DropZone';
import { useToast } from './hooks/ToastContext';
import { useSafeLocalStorage } from './hooks/useSafeLocalStorage';
import { useSpineApp } from './hooks/useSpineApp';
import { useCommandRegistration } from './hooks/useCommandRegistration';
import { useUrlHash } from './hooks/useUrlHash';
import { useFileProcessor } from './hooks/useFileProcessor';
import { useAppEventHandlers } from './hooks/useAppEventHandlers';
import { useAssetHistory } from './hooks/useAssetHistory';
import { useTimeScale } from './hooks/useTimeScale';
import { commandRegistry } from './utils/commandRegistry';
import { FileProcessor } from './core/utils/fileProcessor';
import { AssetHistoryButton } from './components/AssetHistoryButton';
import { AssetHistoryDrawer } from './components/AssetHistoryDrawer';
import { TimeScaleButton } from './components/TimeScaleButton';
import { TimeScalePanel } from './components/TimeScalePanel';

// URL Input Modal Component
const UrlInputModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onLoad: (jsonUrl: string, atlasUrl: string) => void;
}> = ({ isOpen, onClose, onLoad }) => {
  const [jsonUrl, setJsonUrl] = useState('');
  const [atlasUrl, setAtlasUrl] = useState('');
  const { t } = useTranslation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (jsonUrl && atlasUrl) {
      onLoad(jsonUrl, atlasUrl);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>{t('ui.loadFromUrl', 'Load Spine from URL')}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="json-url">JSON URL:</label>
            <input
              id="json-url"
              type="url"
              value={jsonUrl}
              onChange={(e) => setJsonUrl(e.target.value)}
              placeholder="https://example.com/spine.json"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="atlas-url">Atlas URL:</label>
            <input
              id="atlas-url"
              type="url"
              value={atlasUrl}
              onChange={(e) => setAtlasUrl(e.target.value)}
              placeholder="https://example.com/spine.atlas"
              required
            />
          </div>
          <div className="form-actions">
            <button type="button" onClick={onClose}>{t('ui.cancel', 'Cancel')}</button>
            <button type="submit">{t('ui.load', 'Load')}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const { t } = useTranslation();
  const [app, setApp] = useState<Application | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [urlLoadAttempted, setUrlLoadAttempted] = useState(false);
  const [urlLoadStatus, setUrlLoadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // Debug log for language modal state changes
  useEffect(() => {
    console.log('🏠 App: Language modal state changed:', showLanguageModal);
  }, [showLanguageModal]);

  // Enhanced setShowLanguageModal with additional logging
  const setShowLanguageModalWithLogging = (show: boolean) => {
    console.log('🏠 App: setShowLanguageModal called with:', show);
    console.log('🏠 App: Current modal state before change:', showLanguageModal);
    setShowLanguageModal(show);
    console.log('🏠 App: setShowLanguageModal completed');
  };
  const [backgroundColor, setBackgroundColor] = useSafeLocalStorage('spine-benchmark-bg-color', '#282b30');
  const [isLoading, setIsLoading] = useState(false);
  const [currentAnimation, setCurrentAnimation] = useState('');
  const { addToast } = useToast();
  const { updateHash, getStateFromHash, onHashChange } = useUrlHash();
  const { collectFilesFromDataTransfer } = useFileProcessor();
  const { handleKeyDown, handleContextMenu, handleWheel } = useAppEventHandlers();
  const {
    historyEntries,
    isHistoryDrawerOpen,
    addHistoryEntry,
    removeHistoryEntry,
    clearHistory,
    updateEntryAnalysis,
    toggleHistoryDrawer,
    closeHistoryDrawer,
    convertFilesToStoredFiles,
    convertStoredFilesToFileList
  } = useAssetHistory();
  
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
    cameraContainer,
    performanceData
  } = useSpineApp(app);
  
  const {
    currentTimeScale,
    isTimeScalePanelOpen,
    setTimeScale,
    toggleTimeScalePanel,
    closeTimeScalePanel,
    resetTimeScale
  } = useTimeScale(spineInstance);

  // Check for URL parameters on mount - Enhanced version
  useEffect(() => {
    if (!app || urlLoadAttempted) return;

    const checkAndLoadFromUrl = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const jsonUrl = urlParams.get('json');
      const atlasUrl = urlParams.get('atlas');

      if (jsonUrl && atlasUrl) {
        console.log('Found Spine URLs in query parameters:', { jsonUrl, atlasUrl });
        setUrlLoadAttempted(true);
        setUrlLoadStatus('loading');
        
        try {
          await loadSpineFromUrls(jsonUrl, atlasUrl);
          setUrlLoadStatus('success');
          addToast(t('success.loadedFromUrl', 'Successfully loaded Spine from URL'), 'success');
        } catch (error) {
          console.error('Failed to load files from URLs:', error);
          setUrlLoadStatus('error');
          addToast(t('error.failedToLoadFromUrls', { error: (error as any).message }), 'error');
        }
      }
    };

    checkAndLoadFromUrl();
  }, [app, loadSpineFromUrls, urlLoadAttempted, addToast, t]);

  // Effect to update history with analysis data when benchmark data changes
  useEffect(() => {
    if (benchmarkData && performanceData && historyEntries.length > 0) {
      const latestEntry = historyEntries[0];
      if (latestEntry && (latestEntry.ciValue === undefined || latestEntry.riValue === undefined)) {
        const ciValue = performanceData.globalMetrics.computationImpact;
        const riValue = performanceData.globalMetrics.renderingImpact;
        
        updateEntryAnalysis(latestEntry.id, ciValue, riValue, {
          benchmark: benchmarkData,
          performance: performanceData
        });
      }
    }
  }, [benchmarkData, performanceData, historyEntries, updateEntryAnalysis]);

  // Handle URL loading from modal
  const handleUrlLoad = useCallback(async (jsonUrl: string, atlasUrl: string) => {
    try {
      setUrlLoadStatus('loading');
      await loadSpineFromUrls(jsonUrl, atlasUrl);
      setUrlLoadStatus('success');
      
      // Add to history
      const assetName = jsonUrl.split('/').pop()?.replace('.json', '') || 'Spine Asset';
      addHistoryEntry({
        name: assetName,
        jsonUrl,
        atlasUrl,
        isReloadable: true,
        source: 'url'
      });
      
      // Update URL parameters to persist the loaded URLs
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('json', jsonUrl);
      newUrl.searchParams.set('atlas', atlasUrl);
      window.history.replaceState({}, '', newUrl);
      
      addToast(t('success.loadedFromUrl', 'Successfully loaded Spine from URL'), 'success');
    } catch (error) {
      setUrlLoadStatus('error');
      console.error('Failed to load from URLs:', error);
      addToast(t('error.failedToLoadFromUrls', { error: (error as any).message }), 'error');
    }
  }, [loadSpineFromUrls, addToast, t, addHistoryEntry]);

  // Check initial hash state for benchmark panel
  useEffect(() => {
    const hashState = getStateFromHash();
    if (hashState.benchmarkInfo) {
      setShowBenchmark(true);
    }
  }, [getStateFromHash]);

  // Listen for browser navigation changes
  useEffect(() => {
    const cleanup = onHashChange((hashState) => {
      setShowBenchmark(hashState.benchmarkInfo);
    });
    
    return cleanup;
  }, [onHashChange]);

  // Update hash when showBenchmark changes (but avoid infinite loops)
  useEffect(() => {
    const currentHashState = getStateFromHash();
    if (currentHashState.benchmarkInfo !== showBenchmark) {
      updateHash({ benchmarkInfo: showBenchmark });
    }
  }, [showBenchmark, updateHash, getStateFromHash]);

  // Handle global keyboard events
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Handle context menu
  useEffect(() => {
    window.addEventListener('contextmenu', handleContextMenu);
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [handleContextMenu]);

  // Handle wheel events
  useEffect(() => {
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  // Handle file drop
  // Handle file drop
  const handleFilesDrop = useCallback(async (files: FileList) => {
    try {
      setIsLoading(true);
      await loadSpineFiles(files);
      
      // Add to history with stored file data
      const fileArray = Array.from(files);
      const jsonFile = fileArray.find(f => f.name.endsWith('.json'));
      const assetName = jsonFile?.name.replace('.json', '') || 'Spine Asset';
      
      // Convert files to stored format for reloading
      const storedFiles = await convertFilesToStoredFiles(files);
      
      addHistoryEntry({
        name: assetName,
        files: fileArray.map(f => ({
          name: f.name,
          type: f.type,
          size: f.size
        })),
        storedFiles,
        isReloadable: storedFiles.length > 0,
        source: 'files'
      });
      
      addToast(t('success.filesLoaded', 'Files loaded successfully'), 'success');
    } catch (error) {
      console.error('Error handling Spine files:', error);
      addToast(t('error.failedToLoadFiles', { error: (error as any).message }), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [loadSpineFiles, addToast, t, addHistoryEntry, convertFilesToStoredFiles]);
  useEffect(() => {
    if (!canvasRef.current) return;
    
    let cleanupFunction: (() => void) | undefined;
    
    // Initialize PIXI Application (async)
    const initApp = async () => {
      try {
        const pixiApp = new Application();
        await pixiApp.init({
          backgroundColor: parseInt(backgroundColor.replace('#', '0x')),
          canvas: canvasRef.current!,
          resizeTo: canvasRef.current!.parentElement || undefined,
          antialias: true,
          resolution: 2,
          autoDensity: true,
        });
        
        // Store app in state for other components to use
        app?.destroy(); // Clean up old app if exists
        setApp(pixiApp);
        
        // Setup cleanup function
        cleanupFunction = () => {
          pixiApp.destroy();
        };
      } catch (error) {
        console.error("Failed to initialize Pixi application:", error);
        addToast(t('error.failedToInitialize', error instanceof Error ? error.message : 'Unknown error'), 'error');
      }
    };
    
    initApp();
    
    // Return a cleanup function
    return () => {
      if (cleanupFunction) cleanupFunction();
    };
  }, []);

  // File processor instance
  const fileProcessorRef = useRef<FileProcessor | null>(new FileProcessor(app));
  
  useEffect(() => {
    fileProcessorRef.current = app ? new FileProcessor(app) : null;
  }, [app]);

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Clear highlighting
    e.currentTarget.classList.remove('highlight');
    
    if (!fileProcessorRef.current) {
      addToast('Application not initialized', 'error');
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Process dropped items using the working approach from your other project
      const items = e.dataTransfer?.items;
      if (!items || items.length === 0) {
        if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) {
          addToast(t('error.noFilesDropped'), 'error');
          return;
        }
        // If we only have files (not items), use the simple approach
        await handleSpineFiles(e.dataTransfer.files);
        return;
      }
      
      // Convert DataTransferItemList to array
      const itemsArray = Array.from(items);
      
      // Process all dropped items (files and directories)
      const fileList = await fileProcessorRef.current.processItems(itemsArray);
      
      console.log(`Traversal complete, found ${fileList.length} files`);
      
      if (fileList.length === 0) {
        addToast(t('error.noValidFiles'), 'error');
        return;
      }
      
      console.log('Files collected:', fileList.map(f => (f as any).fullPath || f.name));
      
      // Convert to FileList-like object
      const files = fileProcessorRef.current.convertToFileList(fileList);
      
      // Load files into SpineBenchmark
      await handleSpineFiles(files);
      
    } catch (error) {
      console.error('Error processing dropped items:', error);
      addToast(t('error.processingError', error instanceof Error ? error.message : 'Unknown error'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

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

  const handleSpineFiles = async (files: FileList) => {
    if (!fileProcessorRef.current) {
      addToast('File processor not initialized', 'error');
      return;
    }
    
    try {
      // Handle Spine files with version checking
      const processedFiles = await fileProcessorRef.current.handleSpineFiles(files);
      
      // Validate files before loading
      fileProcessorRef.current.validateFiles(processedFiles);
      
      await loadSpineFiles(processedFiles);
      
      // Add to history with stored file data
      const fileArray = Array.from(files);
      const jsonFile = fileArray.find(f => f.name.endsWith('.json'));
      const assetName = jsonFile?.name.replace('.json', '') || 'Spine Asset';
      
      // Convert files to stored format for reloading
      const storedFiles = await convertFilesToStoredFiles(files);
      
      addHistoryEntry({
        name: assetName,
        files: fileArray.map(f => ({
          name: f.name,
          type: f.type,
          size: f.size
        })),
        storedFiles,
        isReloadable: storedFiles.length > 0,
        source: 'files'
      });
    } catch (error) {
      console.error("Error handling Spine files:", error);
      addToast(t('error.loadingError', error instanceof Error ? error.message : 'Unknown error'), 'error');
    }
  };

  const openGitHubReadme = () => {
    window.open('https://github.com/schmooky/spine-benchmark/blob/main/README.md', '_blank');
  };

  // Handle loading from history entry
  const handleLoadFromHistory = useCallback(async (entry: any) => {
    try {
      if (entry.jsonUrl && entry.atlasUrl) {
        // Load from URLs
        await handleUrlLoad(entry.jsonUrl, entry.atlasUrl);
      } else if (entry.storedFiles && entry.storedFiles.length > 0) {
        // Load from stored file data
        setIsLoading(true);
        const fileList = await convertStoredFilesToFileList(entry.storedFiles);
        await loadSpineFiles(fileList);
        addToast(t('success.filesLoaded', 'Files loaded successfully from history'), 'success');
      } else if (entry.files) {
        // For file-based entries without stored data, we can't re-load the files
        addToast(t('history.cannotReloadFiles', 'Cannot reload files from history. Please drag and drop the files again.'), 'warning');
      }
      closeHistoryDrawer();
    } catch (error) {
      console.error('Error loading from history:', error);
      addToast(t('error.failedToLoadFromHistory', 'Failed to load asset from history'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [handleUrlLoad, addToast, t, closeHistoryDrawer, convertStoredFilesToFileList, loadSpineFiles]);


  useEffect(() => {
    if (app) {
      app.renderer.background.color = parseInt(backgroundColor.replace('#', '0x'));
    }
  }, [backgroundColor, app]);
  
  // Enhanced setShowBenchmark function that updates hash
  const setShowBenchmarkWithHash = useCallback((show: boolean) => {
    setShowBenchmark(show);
    updateHash({ benchmarkInfo: show });
  }, [updateHash]);
  // Register commands for the command palette
  useCommandRegistration({
    spineInstance,
    showBenchmark,
    setShowBenchmark: setShowBenchmarkWithHash,
    openGitHubReadme,
    setShowLanguageModal: setShowLanguageModalWithLogging,
    meshesVisible,
    physicsVisible,
    ikVisible,
    toggleMeshes,
    togglePhysics,
    toggleIk,
    cameraContainer  // Add this
  });

  // Add this to register URL load command
  useEffect(() => {
    if (app) {
      commandRegistry.register({
        id: 'file.load-from-url',
        title: t('commands.file.loadFromUrl', 'Load Spine from URL'),
        category: 'file',
        description: t('commands.file.loadFromUrlDescription', 'Load Spine files from remote URLs'),
        keywords: ['load', 'url', 'remote', 'cdn', 's3', 'http'],
        execute: () => setShowUrlModal(true)
      });
    }

    return () => {
      commandRegistry.unregister('file.load-from-url');
    };
  }, [app, t]);

  return (
    <div className="app-container">
      <div 
        className="canvas-container"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <canvas ref={canvasRef} id="pixiCanvas" />
        
        {!spineInstance && urlLoadStatus !== 'loading' && (
          <div className="drop-area">
            <p>{t('ui.dropArea')}</p>
          </div>
        )}
        
        {(isLoading || spineLoading || urlLoadStatus === 'loading') && (
          <div className="loading-indicator">
            <p>{urlLoadStatus === 'loading' ? t('ui.loadingFromUrl', 'Loading from URL...') : t('ui.loading')}</p>
          </div>
        )}
      </div>
      
      {/* Help text when no Spine file is loaded */}
      {/* {!spineInstance && urlLoadStatus !== 'loading' && ( */}
        <div className="help-text">
          <p>{t('ui.helpText')}</p>
        </div>
     {/* )} */}
      
      {/* Controls container - only visible when Spine file is loaded */}
      <div className={`controls-container ${spineInstance ? 'visible' : 'hidden'}`}>    

          {spineInstance && (() => {
            console.log('App center-controls render:', {
              hasSpineInstance: !!spineInstance,
              spineInstanceType: spineInstance?.constructor?.name
            });
            return <AnimationControls
              spineInstance={spineInstance}
              onAnimationChange={setCurrentAnimation}
              timeScale={currentTimeScale}
            />;
          })()}
      </div>
      
      {/* Benchmark Panel - shows when analysis is complete and benchmark info is not visible */}
      <BenchmarkPanel
        benchmarkData={benchmarkData}
        performanceData={performanceData}
        showBenchmark={showBenchmark}
        setShowBenchmark={setShowBenchmarkWithHash}
      />
      
{showBenchmark && benchmarkData && (
  <InfoPanel
    data={benchmarkData}
    performanceData={performanceData}
    onClose={() => setShowBenchmarkWithHash(false)}
  />
)}
      
      {/* React Toastify Container with dark theme */}
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
      
      {/* Command Palette */}
      <CommandPalette />
      
      {/* Version Display */}
      <VersionDisplay
        appVersion="1.2.0"
        spineVersion="4.2.*"
      />
      
      {/* Language Modal */}
      <LanguageModal
        isOpen={showLanguageModal}
        onClose={() => {
          console.log('🏠 App: Closing language modal');
          setShowLanguageModalWithLogging(false);
        }}
      />
      
      {/* URL Input Modal */}
      <UrlInputModal
        isOpen={showUrlModal}
        onClose={() => setShowUrlModal(false)}
        onLoad={handleUrlLoad}
      />

      {/* Time Scale Button - only show when spine instance is loaded */}
      {spineInstance && (
        <TimeScaleButton
          onClick={toggleTimeScalePanel}
          currentTimeScale={currentTimeScale}
        />
      )}

      {/* Time Scale Panel */}
      <TimeScalePanel
        isOpen={isTimeScalePanelOpen}
        currentTimeScale={currentTimeScale}
        onTimeScaleChange={setTimeScale}
        onClose={closeTimeScalePanel}
      />

      {/* Asset History Button */}
      <AssetHistoryButton
        onClick={toggleHistoryDrawer}
        hasHistory={historyEntries.length > 0}
      />

      {/* Asset History Drawer */}
      <AssetHistoryDrawer
        isOpen={isHistoryDrawerOpen}
        entries={historyEntries}
        onClose={closeHistoryDrawer}
        onLoadEntry={handleLoadFromHistory}
        onRemoveEntry={removeHistoryEntry}
        onClearHistory={clearHistory}
      />
    </div>
  );
};

export default App;