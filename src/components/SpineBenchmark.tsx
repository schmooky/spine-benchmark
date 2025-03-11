import React, { useState, useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { CameraContainer } from '../core/CameraContainer';
import { SpineLoader } from '../core/SpineLoader';
import { SpineAnalyzer } from '../core/SpineAnalyzer';
import { useToast } from '../hooks/useToast';
import { BenchmarkData } from '../hooks/useSpineApp';

interface SpineBenchmarkProps {
  onAnalysisComplete?: (data: BenchmarkData) => void;
  backgroundColor: string;
}

export const SpineBenchmark: React.FC<SpineBenchmarkProps> = ({ 
  onAnalysisComplete, 
  backgroundColor 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<Application | null>(null);
  const cameraRef = useRef<CameraContainer | null>(null);
  const [spineInstance, setSpineInstance] = useState<Spine | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showMeshes, setShowMeshes] = useState(false);
  const { addToast } = useToast();

  // Initialize PIXI application
  useEffect(() => {
    if (!canvasRef.current) return;
    
    let cleanupFunction: (() => void) | undefined;
    
    const initApp = async () => {
      try {
        setIsLoading(true);
        
        const app = new Application();
        await app.init({
          backgroundColor: parseInt(backgroundColor.replace('#', '0x')),
          canvas: canvasRef.current!,
          resizeTo: canvasRef.current!.parentElement || undefined,
          antialias: true,
          resolution: 2,
          autoDensity: true,
        });

        appRef.current = app;

        // Create camera container
        const camera = new CameraContainer({
          width: app.screen.width,
          height: app.screen.height,
          app,
        });

        app.stage.addChild(camera);
        cameraRef.current = camera;
        
        // Setup cleanup function
        cleanupFunction = () => {
          if (camera) {
            camera.destroy();
          }
          app.destroy();
          appRef.current = null;
          cameraRef.current = null;
        };
      } catch (error) {
        console.error('Failed to initialize Pixi application:', error);
        addToast(`Failed to initialize graphics: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      } finally {
        setIsLoading(false);
      }
    };
    
    initApp();

    return () => {
      if (cleanupFunction) cleanupFunction();
    };
  }, []);

  // Update background color when prop changes
  useEffect(() => {
    if (appRef.current) {
      appRef.current.renderer.background.color = parseInt(backgroundColor.replace('#', '0x'));
    }
  }, [backgroundColor]);

  // Load Spine files
  const loadSpineFiles = async (files: FileList) => {
    if (!appRef.current || !cameraRef.current) {
      addToast('Application not initialized', 'error');
      return;
    }

    setIsLoading(true);

    try {
      // Remove previous Spine instance if exists
      if (spineInstance && cameraRef.current) {
        cameraRef.current.removeChild(spineInstance);
        setSpineInstance(null);
      }

      // Check for version compatibility
      const jsonFile = Array.from(files).find(file => file.type === "application/json");
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
            
            await processFiles(dataTransfer.files);
            return;
          }
        }
      }

      await processFiles(files);
    } catch (error) {
      console.error('Error loading Spine files:', error);
      addToast(`Error loading Spine files: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const processFiles = async (files: FileList) => {
    if (!appRef.current || !cameraRef.current) return;

    try {
      // Load spine files
      const loader = new SpineLoader(appRef.current);
      const newSpineInstance = await loader.loadSpineFiles(files);
      
      if (!newSpineInstance) {
        throw new Error('Failed to load Spine instance');
      }

      // Add to camera container and look at it
      cameraRef.current.addChild(newSpineInstance);
      cameraRef.current.lookAtChild(newSpineInstance);
      
      // Analyze spine data
      const analysisData = SpineAnalyzer.analyze(newSpineInstance);
      
      // Pass analysis data to parent
      if (onAnalysisComplete) {
        onAnalysisComplete(analysisData);
      }
      
      setSpineInstance(newSpineInstance);
      addToast('Spine files loaded successfully', 'success');
    } catch (error) {
      console.error('Error processing Spine files:', error);
      throw error;
    }
  };

  // Toggle mesh visibility
  const toggleMeshVisibility = () => {
    if (cameraRef.current) {
      const newVisibility = !showMeshes;
      cameraRef.current.setMeshVisibility(newVisibility);
      setShowMeshes(newVisibility);
    }
  };

  // Center viewport
  const centerViewport = () => {
    if (cameraRef.current) {
      cameraRef.current.centerViewport();
    }
  };

  return (
    <div className="spine-benchmark">
      <canvas ref={canvasRef} className="pixi-canvas" />
      
      {isLoading && (
        <div className="loading-overlay">
          <span className="loading-spinner"></span>
          <p>Loading Spine files...</p>
        </div>
      )}

      {/* Additional controls can be provided as children or through props */}
    </div>
  );
};

// Export a function to expose the loadSpineFiles method for external use
export const useSpineBenchmark = (
  benchmarkRef: React.RefObject<HTMLDivElement | null>,
  onAnalysisComplete?: (data: BenchmarkData) => void
) => {
  const [instance, setInstance] = useState<SpineBenchmark | null>(null);

  useEffect(() => {
    if (benchmarkRef.current && instance) {
      // Setup any connection between the DOM ref and the component instance
    }
  }, [benchmarkRef, instance]);

  return {
    loadSpineFiles: (files: FileList) => {
      if (instance) {
        return instance.loadSpineFiles(files);
      }
      return Promise.reject('Spine benchmark not initialized');
    },
    setInstance
  };
};