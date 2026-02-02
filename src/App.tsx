import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useTranslation } from 'react-i18next';
import { AnimationControls } from './components/AnimationControls';
import { InfoPanel } from './components/InfoPanel';
import { CommandPalette } from './components/CommandPalette';
import { VersionDisplay } from './components/VersionDisplay';
import { LanguageModal } from './components/LanguageModal';
import { UrlInputModal } from './components/UrlInputModal';
import { BenchmarkPanel } from './components/BenchmarkPanel';
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

const App: React.FC = () => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backgroundColor, setBackgroundColor] = useSafeLocalStorage('spine-benchmark-bg-color', '#282b30');
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [isDropLoading, setIsDropLoading] = useState(false);
  const [currentAnimation, setCurrentAnimation] = useState('');
  const { addToast } = useToast();
  const { updateHash, getStateFromHash, onHashChange } = useUrlHash();
  const { handleKeyDown, handleContextMenu, handleWheel } = useAppEventHandlers();

  const app = usePixiApp({ canvasRef, backgroundColor });

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

  const handleSpineFiles = useCallback(
    async (files: FileList) => {
      if (!fileProcessorRef.current) {
        addToast(t('error.failedToInitialize', 'Application not initialized'), 'error');
        return;
      }
      try {
        const processedFiles = await fileProcessorRef.current.handleSpineFiles(files);
        fileProcessorRef.current.validateFiles(processedFiles);
        await loadSpineFiles(processedFiles);
      } catch (error) {
        addToast(
          t('error.loadingError', error instanceof Error ? error.message : 'Unknown error'),
          'error'
        );
      }
    },
    [loadSpineFiles, addToast, t]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.classList.remove('highlight');

      if (!fileProcessorRef.current) {
        addToast(t('error.failedToInitialize', 'Application not initialized'), 'error');
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
          t('error.processingError', error instanceof Error ? error.message : 'Unknown error'),
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

        {isAnyLoading && (
          <div className="loading-indicator">
            <p>{loadingMessage}</p>
          </div>
        )}
      </div>
      
      {/* Help text when no Spine file is loaded */}
      {/* {!spineInstance && urlLoadStatus !== 'loading' && ( */}
        <div className="help-text">
          <p>{t('ui.helpText')}</p>
        </div>
     {/* )} */}
      
      <div className={`controls-container ${spineInstance ? 'visible' : 'hidden'}`}>
        {spineInstance && (
          <AnimationControls
            spineInstance={spineInstance}
            onAnimationChange={setCurrentAnimation}
          />
        )}
      </div>
      
      {/* Benchmark Panel - shows when analysis is complete and benchmark info is not visible */}
      <BenchmarkPanel
        benchmarkData={benchmarkData}
        showBenchmark={showBenchmark}
        setShowBenchmark={setShowBenchmarkWithHash}
      />
      
      {showBenchmark && benchmarkData && (
        <InfoPanel
          data={benchmarkData}
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
      
      <LanguageModal
        isOpen={showLanguageModal}
        onClose={() => setShowLanguageModal(false)}
      />
      
      {/* URL Input Modal */}
      <UrlInputModal
        isOpen={showUrlModal}
        onClose={() => setShowUrlModal(false)}
        onLoad={handleUrlLoad}
      />
    </div>
  );
};

export default App;