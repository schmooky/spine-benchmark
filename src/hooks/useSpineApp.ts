import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { Application } from 'pixi.js';
import { useEffect, useRef, useState } from 'react';
import { BackgroundManager } from '../core/BackgroundManager';
import { CameraContainer } from '../core/CameraContainer';
import { SpineAnalyzer } from '../core/SpineAnalyzer';
import { SpineLoader } from '../core/SpineLoader';
import { useToast } from './ToastContext';

export interface BenchmarkData {
  meshAnalysis: any;
  clippingAnalysis: any;
  blendModeAnalysis: any;
  skeletonTree: any;
  summary: any;
  physicsAnalysis: any;
}

export interface DebugFlags {
  showBones: boolean;
  showRegionAttachments: boolean;
  showMeshTriangles: boolean;
  showMeshHull: boolean;
  showBoundingBoxes: boolean;
  showPaths: boolean;
  showClipping: boolean;
  showPhysics: boolean;
  showIkConstraints: boolean;
  showTransformConstraints: boolean;
  showPathConstraints: boolean;
}

export function useSpineApp(app: Application | null) {
  const [spineInstance, setSpineInstance] = useState<Spine | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkData | null>(null);
  
  // Separate flags for each debug visualization type
  const [meshesVisible, setMeshesVisible] = useState(false);
  const [physicsVisible, setPhysicsVisible] = useState(false);
  const [ikVisible, setIkVisible] = useState(false);
  
  const cameraContainerRef = useRef<CameraContainer | null>(null);
  const backgroundManagerRef = useRef<BackgroundManager | null>(null);
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
    
    // Create the background manager
    const backgroundManager = new BackgroundManager(app);
    backgroundManagerRef.current = backgroundManager;

    return () => {
      if (cameraContainer) {
        cameraContainer.destroy();
      }
      cameraContainerRef.current = null;
      
      if (backgroundManager) {
        backgroundManager.destroy();
      }
      backgroundManagerRef.current = null;
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
      
      // Reset all debug flags
      setMeshesVisible(false);
      setPhysicsVisible(false);
      setIkVisible(false);
      
      // Ensure debug visualization is turned off by default
      if (cameraContainerRef.current) {
        cameraContainerRef.current.setDebugFlags({
          showBones: false,
          showMeshTriangles: false,
          showMeshHull: false,
          showRegionAttachments: false,
          showBoundingBoxes: false,
          showPaths: false,
          showClipping: false,
          showPhysics: false,
          showIkConstraints: false,
          showTransformConstraints: false,
          showPathConstraints: false
        });
      }
      
    } catch (error) {
      console.error('Error loading Spine files:', error);
      addToast(`Error loading Spine files: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      throw error; // Re-throw to allow the calling code to handle it
    } finally {
      setIsLoading(false);
    }
  };
  
  // Toggle meshes visualization
  const toggleMeshes = () => {
    if (!cameraContainerRef.current) return;
    
    const newValue = !meshesVisible;
    setMeshesVisible(newValue);
    
    // Get current state of all flags to preserve other toggles
    const currentFlags = cameraContainerRef.current.getDebugFlags ? 
      cameraContainerRef.current.getDebugFlags() : {};
    
    cameraContainerRef.current.setDebugFlags({
      ...currentFlags,
      showBones: newValue,
      showMeshTriangles: newValue,
      showMeshHull: newValue,
      showRegionAttachments: newValue,
      showBoundingBoxes: newValue,
      showPaths: newValue,
      showClipping: newValue
    });
  };
  
  // Toggle physics constraints visualization
  const togglePhysics = () => {
    if (!cameraContainerRef.current) return;
    
    const newValue = !physicsVisible;
    setPhysicsVisible(newValue);
    
    // Get current state of all flags to preserve other toggles
    const currentFlags = cameraContainerRef.current.getDebugFlags ? 
      cameraContainerRef.current.getDebugFlags() : {};
    
    cameraContainerRef.current.setDebugFlags({
      ...currentFlags,
      showPhysics: newValue,
      showTransformConstraints: newValue,
      showPathConstraints: newValue
    });
  };
  
  // Toggle IK constraints visualization
  const toggleIk = () => {
    if (!cameraContainerRef.current) return;
    
    const newValue = !ikVisible;
    setIkVisible(newValue);
    
    // Get current state of all flags to preserve other toggles
    const currentFlags = cameraContainerRef.current.getDebugFlags ? 
      cameraContainerRef.current.getDebugFlags() : {};
    
    cameraContainerRef.current.setDebugFlags({
      ...currentFlags,
      showIkConstraints: newValue
    });
  };
  
  // Function to set the background image using base64 data
  const setBackgroundImage = async (base64Data: string) => {
    if (!backgroundManagerRef.current) {
      addToast('Background manager not initialized', 'error');
      return;
    }
    
    try {
      await backgroundManagerRef.current.setBackgroundImage(base64Data);
      addToast('Background image set successfully', 'success');
    } catch (error) {
      console.error('Error setting background image:', error);
      addToast(`Error setting background image: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };
  
  // Function to clear the background image
  const clearBackgroundImage = () => {
    if (!backgroundManagerRef.current) {
      return;
    }
    
    backgroundManagerRef.current.clearBackground();
    addToast('Background image removed', 'info');
  };

  return {
    spineInstance,
    loadSpineFiles,
    isLoading,
    benchmarkData,
    setBackgroundImage,
    clearBackgroundImage,
    toggleMeshes,
    togglePhysics,
    toggleIk,
    meshesVisible,
    physicsVisible,
    ikVisible
  };
}