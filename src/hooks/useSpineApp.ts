import { useState, useRef, useEffect } from 'react';
import { Application } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { CameraContainer } from '../core/CameraContainer';
import { SpineLoader } from '../core/SpineLoader';
import { SpineAnalyzer } from '../core/SpineAnalyzer';
import { useToast } from './ToastContext';

export interface BenchmarkData {
  meshAnalysis: any;
  clippingAnalysis: any;
  blendModeAnalysis: any;
  skeletonTree: any;
  summary: any;
}

export function useSpineApp(app: Application | null) {
  const [spineInstance, setSpineInstance] = useState<Spine | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkData | null>(null);
  const cameraContainerRef = useRef<CameraContainer | null>(null);
  const { addToast } = useToast();

  // This effect runs when the app instance changes
  useEffect(() => {
    if (!app) return;

    // Create and add camera container
    const cameraContainer = new CameraContainer({
      width: app.screen.width,
      height: app.screen.height,
      app,
    });
    
    app.stage.addChild(cameraContainer);
    cameraContainerRef.current = cameraContainer;

    return () => {
      if (cameraContainer) {
        cameraContainer.destroy();
      }
      cameraContainerRef.current = null;
    };
  }, [app]);

  // Function to load spine files
  const loadSpineFiles = async (files: FileList) => {
    if (!app || !cameraContainerRef.current) {
      addToast('Application not initialized', 'error');
      return;
    }

    setIsLoading(true);
    
    try {
      // Log file information for debugging
      console.log(`Processing ${files.length} files:`);
      Array.from(files).forEach((file, index) => {
        console.log(`File ${index + 1}: ${file.name} (${file.type})`);
      });
      
      // Check if we have the basic required files
      const hasJsonFile = Array.from(files).some(file => 
        file.name.endsWith('.json') || file.type === 'application/json'
      );
      
      const hasSkelFile = Array.from(files).some(file => 
        file.name.endsWith('.skel')
      );
      
      const hasAtlasFile = Array.from(files).some(file => 
        file.name.endsWith('.atlas')
      );
      
      const hasImageFiles = Array.from(files).some(file => 
        file.type.startsWith('image/') || 
        file.name.endsWith('.png') || 
        file.name.endsWith('.jpg') || 
        file.name.endsWith('.jpeg') || 
        file.name.endsWith('.webp')
      );
      
      if (!hasAtlasFile) {
        throw new Error('Missing .atlas file. Please include an atlas file with your Spine data.');
      }
      
      if (!hasJsonFile && !hasSkelFile) {
        throw new Error('Missing skeleton file (.json or .skel). Please include a skeleton file with your Spine data.');
      }
      
      if (!hasImageFiles) {
        throw new Error('Missing image files. Please include image files referenced by your atlas.');
      }

      // Remove previous Spine instance if exists
      if (spineInstance) {
        cameraContainerRef.current.removeChild(spineInstance);
        setSpineInstance(null);
      }

      // Load spine files
      const loader = new SpineLoader(app);
      const newSpineInstance = await loader.loadSpineFiles(files);
      
      if (!newSpineInstance) {
        throw new Error('Failed to load Spine instance');
      }

      // Add to camera container and look at it
      cameraContainerRef.current.addChild(newSpineInstance);
      cameraContainerRef.current.lookAtChild(newSpineInstance);
      
      // Analyze spine data
      const analysisData = SpineAnalyzer.analyze(newSpineInstance);
      setBenchmarkData(analysisData);
      
      setSpineInstance(newSpineInstance);
      addToast('Spine files loaded successfully', 'success');
    } catch (error) {
      console.error('Error loading Spine files:', error);
      addToast(`Error loading Spine files: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      throw error; // Re-throw to allow the calling code to handle it
    } finally {
      setIsLoading(false);
    }
  };

  return {
    spineInstance,
    loadSpineFiles,
    isLoading,
    benchmarkData,
  };
}