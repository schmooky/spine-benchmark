import { Application } from 'pixi.js';
import React, { useEffect, useRef, useState } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AnimationControls } from './components/AnimationControls';
import { ColorPicker } from './components/ColorPicker';
import { DebugToggle, IkIcon, MeshIcon, PhysicsIcon } from './components/DebugToggle';
import { IconButton } from './components/IconButton';
import {
  DocumentTextIcon,
  ImageIcon,
  QuestionMarkCircleIcon,
  XMarkIcon,
  TimelineIcon
} from './components/Icons';
import { InfoPanel } from './components/InfoPanel';
import { useToast } from './hooks/ToastContext';
import { useSafeLocalStorage } from './hooks/useSafeLocalStorage';
import { useSpineApp } from './hooks/useSpineApp';
import EventTimeline from './components/EventTimeline';
    
const App: React.FC = () => {
  const [app, setApp] = useState<Application | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [backgroundColor, setBackgroundColor] = useSafeLocalStorage('spine-benchmark-bg-color', '#282b30');
  const [hasBackgroundImage, setHasBackgroundImage] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentAnimation, setCurrentAnimation] = useState('');
  const [showEventTimeline, setShowEventTimeline] = useState(false);
  const toggleEventTimeline = () => {
    setShowEventTimeline(!showEventTimeline);
  };
  const { addToast } = useToast();
  const { 
    spineInstance, 
    loadSpineFiles,
    isLoading: spineLoading,
    benchmarkData,
    setBackgroundImage,
    clearBackgroundImage,
    toggleMeshes,
    togglePhysics,
    toggleIk,
    meshesVisible,
    physicsVisible,
    ikVisible
  } = useSpineApp(app);

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
        addToast(`Failed to initialize graphics: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      }
    };
    
    initApp();
    
    // Return a cleanup function
    return () => {
      if (cleanupFunction) cleanupFunction();
    };
  }, []);

  // Function to traverse file/directory structure
  function traverseFileTree(item: any, path: string, fileList: File[]): Promise<void> {
    path = path || "";
    
    return new Promise((resolve, reject) => {
        if (item.isFile) {
            // Get file
            item.file((file: File) => {
                console.log("File found:", path + file.name);
                // Store the path in a custom property
                Object.defineProperty(file, 'fullPath', {
                    value: path + file.name,
                    writable: false
                });
                fileList.push(file);
                resolve();
            }, reject);
        } else if (item.isDirectory) {
            // Get folder contents
            const dirReader = item.createReader();
            
            // Function to read all entries in the directory
            const readAllEntries = (entries: any[] = []): Promise<any[]> => {
                return new Promise((resolveEntries, rejectEntries) => {
                    dirReader.readEntries((results: any[]) => {
                        if (results.length) {
                            // More entries to process
                            entries = entries.concat(Array.from(results));
                            readAllEntries(entries).then(resolveEntries).catch(rejectEntries);
                        } else {
                            // No more entries, we have all of them
                            resolveEntries(entries);
                        }
                    }, rejectEntries);
                });
            };
            
            readAllEntries().then((entries) => {
                console.log(`Directory found: ${path + item.name}/ (${entries.length} entries)`);
                
                // Process all entries in the directory
                const promises = entries.map(entry => 
                    traverseFileTree(entry, path + item.name + "/", fileList)
                );
                
                Promise.all(promises)
                    .then(() => resolve())
                    .catch(reject);
            }).catch(reject);
        } else {
            resolve(); // Not a file or directory, just resolve
        }
    });
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Clear highlighting
    e.currentTarget.classList.remove('highlight');
    
    try {
      setIsLoading(true);
      
      // Process dropped items using the working approach from your other project
      const items = e.dataTransfer?.items;
      if (!items || items.length === 0) {
        if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) {
          addToast('No files were dropped', 'error');
          return;
        }
        // If we only have files (not items), use the simple approach
        handleSpineFiles(e.dataTransfer.files);
        return;
      }
      
      // Convert DataTransferItemList to array
      const itemsArray = Array.from(items);
      const fileList: File[] = [];
      
      // Process all dropped items (files and directories)
      const promises = itemsArray.map(item => {
        // webkitGetAsEntry is where the magic happens
        const entry = item.webkitGetAsEntry();
        if (entry) {
            return traverseFileTree(entry, "", fileList);
        } else {
            return Promise.resolve();
        }
      });
      
      // When all traversal is complete
      await Promise.all(promises);
      console.log(`Traversal complete, found ${fileList.length} files`);
      
      if (fileList.length === 0) {
        addToast('No valid files found in the dropped items', 'error');
        return;
      }
      
      console.log('Files collected:', fileList.map(f => (f as any).fullPath || f.name));
      
      // Convert to FileList-like object
      const dataTransfer = new DataTransfer();
      fileList.forEach(file => dataTransfer.items.add(file));
      const files = dataTransfer.files;
      
      // Load files into SpineBenchmark
      await handleSpineFiles(files);
      
    } catch (error) {
      console.error('Error processing dropped items:', error);
      addToast(`Error processing dropped files: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
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
    try {
      // Check for JSON skeleton file
      const jsonFile = Array.from(files).find(file => file.name.endsWith('.json'));
      if (jsonFile) {
        const content = await jsonFile.text();
        if (content.includes('"spine":"4.1')) {
          addToast('Warning: This file uses Spine 4.1. The benchmark is designed for Spine 4.2. Version will be adjusted automatically.', 'warning');
          
          // Create a modified file with version replaced
          const modifiedContent = content.replace(/"spine":"4.1[^"]*"/, '"spine":"4.2.0"');
          const modifiedFile = new File([modifiedContent], jsonFile.name, { type: 'application/json' });
          
          // Replace the original file in the list
          const newFileList = Array.from(files);
          const index = newFileList.findIndex(f => f.name === jsonFile.name);
          if (index !== -1) {
            newFileList[index] = modifiedFile;
            
            // Convert back to FileList-like object
            const dataTransfer = new DataTransfer();
            newFileList.forEach(file => dataTransfer.items.add(file));
            
            await loadSpineFiles(dataTransfer.files);
            return;
          }
        }
      }
      
      await loadSpineFiles(files);
    } catch (error) {
      console.error("Error handling Spine files:", error);
      addToast(`Error loading Spine files: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };

  const openGitHubReadme = () => {
    window.open('https://github.com/schmooky/spine-benchmark/blob/main/README.md', '_blank');
  };

  const handleBgColorChange = (color: string) => {
    setBackgroundColor(color);
  };

  // Handle background image upload button click
  const handleBackgroundButtonClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Handle file input change for background image
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      
      // Check if the file is an image
      if (!file.type.startsWith('image/')) {
        addToast('Please select an image file.', 'error');
        return;
      }
      
      // Convert the file to base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (e.target && typeof e.target.result === 'string') {
          // Get the base64 string
          const base64Data = e.target.result;
          
          try {
            // Set the background image using the BackgroundManager
            await setBackgroundImage(base64Data);
            setHasBackgroundImage(true);
          } catch (error) {
            console.error('Error setting background image:', error);
            addToast('Failed to set background image.', 'error');
          }
        } else {
          addToast('Failed to read image file.', 'error');
        }
      };
      
      reader.onerror = () => {
        addToast('Error reading the image file.', 'error');
      };
      
      // Read the file as a data URL (base64)
      reader.readAsDataURL(file);
      
      // Reset the input to allow selecting the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Handle removing background image
  const handleRemoveBackground = () => {
    clearBackgroundImage();
    setHasBackgroundImage(false);
  };

  useEffect(() => {
    if (app) {
      app.renderer.background.color = parseInt(backgroundColor.replace('#', '0x'));
    }
  }, [backgroundColor, app]);
  
  // Effect to ensure debug renderer is cleaned up when component unmounts
  useEffect(() => {
    return () => {
      // Clean up debug rendering if any was active
      if (spineInstance && (meshesVisible || physicsVisible || ikVisible)) {
        // Reset debug flags and force clear
        if (app && app.ticker) {
          app.ticker.update();
        }
      }
    };
  }, [spineInstance, meshesVisible, physicsVisible, ikVisible]);

  return (
    <div className="app-container" style={{ backgroundColor }}>
      <div 
        className="canvas-container"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <canvas ref={canvasRef} id="pixiCanvas" />
        
        {!spineInstance && (
          <div className="drop-area">
            <p>Drop Spine files or folders here (JSON, Atlas, and Images)</p>
          </div>
        )}
        
        {(isLoading || spineLoading) && (
          <div className="loading-indicator">
            <p>Loading...</p>
          </div>
        )}
      </div>
      
      <div className="controls-container">
        <div className="left-controls">
          <IconButton 
            icon={<DocumentTextIcon />} 
            onClick={() => setShowBenchmark(!showBenchmark)}
            active={showBenchmark}
            tooltip="Toggle Benchmark Info"
          />
          <IconButton 
            icon={<QuestionMarkCircleIcon />} 
            onClick={openGitHubReadme}
            tooltip="Open Documentation"
          />
          <IconButton 
            icon={<ImageIcon />} 
            onClick={handleBackgroundButtonClick}
            tooltip="Upload Background Image"
          />
          <IconButton 
  icon={<TimelineIcon />} 
  onClick={toggleEventTimeline}
  active={showEventTimeline}
  tooltip="Event Timeline"
/>
          {hasBackgroundImage && (
            <IconButton 
              icon={<XMarkIcon />} 
              onClick={handleRemoveBackground}
              tooltip="Remove Background Image"
            />
          )}
          
          
          {/* Add individual debug toggle buttons */}
          {spineInstance && (
            <>
              <DebugToggle 
                icon={<MeshIcon />} 
                onClick={toggleMeshes}
                active={meshesVisible}
                tooltip="Toggle Mesh Visualization"
              />
              <DebugToggle 
                icon={<PhysicsIcon />} 
                onClick={togglePhysics}
                active={physicsVisible}
                tooltip="Toggle Physics Constraints"
              />
              <DebugToggle 
                icon={<IkIcon />} 
                onClick={toggleIk}
                active={ikVisible}
                tooltip="Toggle IK Constraints"
              />
            </>
          )}
          
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            style={{ display: 'none' }}
          />
        </div>
        
        <div className="center-controls">
          {spineInstance && <AnimationControls 
  spineInstance={spineInstance} 
  onAnimationChange={setCurrentAnimation} 
/>}
        </div>
        
        <div className="right-controls">
          <ColorPicker 
            color={backgroundColor} 
            onChange={handleBgColorChange} 
          />
        </div>
      </div>
      
      {showBenchmark && benchmarkData && (
        <InfoPanel 
          data={benchmarkData}
          onClose={() => setShowBenchmark(false)}
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
      {showEventTimeline && spineInstance && (
  <div className="timeline-modal">
    <div className="timeline-modal-content">
      <div className="timeline-modal-header">
        <h2>Animation Event Timeline</h2>
        <button 
          className="timeline-modal-close" 
          onClick={() => setShowEventTimeline(false)}
        >
          &times;
        </button>
      </div>
      <div className="timeline-modal-body">
        <EventTimeline 
          spineInstance={spineInstance} 
          currentAnimation={currentAnimation}
        />
      </div>
    </div>
  </div>
)}
    </div>
  );
};

export default App;