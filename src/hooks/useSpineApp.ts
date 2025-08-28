import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { Application } from 'pixi.js';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CameraContainer } from '../core/CameraContainer';
import { SpineAnalyzer, SpineAnalysisResult } from '../core/SpineAnalyzer';
import { SpinePerformanceAnalyzer, SpinePerformanceAnalysisResult } from '../core/SpinePerformanceAnalyzer';
import { useToast } from './ToastContext';
import { useSpineLoader } from './useSpineLoader';
import { useDebugVisualizer } from './useDebugVisualizer';
import { useBackgroundManager } from './useBackgroundManager';

export interface DebugFlags {
  showBones: boolean;
  showRegionAttachments: boolean;
  showMeshTriangles: boolean;
  showMeshHull: boolean;
  showVertices: boolean;
  showBoundingBoxes: boolean;
  showClipping: boolean;
  showIkConstraints: boolean;
  showTransformConstraints: boolean;
}

export function useSpineApp(app: Application | null) {
  const { i18n } = useTranslation();
  const [benchmarkData, setBenchmarkData] = useState<SpineAnalysisResult | null>(null);
  const [performanceData, setPerformanceData] = useState<SpinePerformanceAnalysisResult | null>(null);
  
  const cameraContainerRef = useRef<CameraContainer | null>(null);
  const previousSpineInstanceRef = useRef<Spine | null>(null);
  const { addToast } = useToast();
  
  // Use specialized hooks for different concerns
  const { 
    spineInstance, 
    isLoading, 
    loadSpineFiles, 
    loadSpineFromUrls,
    clearSpineInstance
  } = useSpineLoader(app);
  
  const { 
    meshesVisible,
    physicsVisible,
    ikVisible, 
    toggleMeshes,
    togglePhysics,
    toggleIk
  } = useDebugVisualizer();
  
  const { 
    hasBackground, 
    setBackgroundImage, 
    clearBackgroundImage
  } = useBackgroundManager(app);

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

  // Effect to regenerate benchmark data when language changes
  useEffect(() => {
    if (spineInstance) {
      const analysisResult = SpineAnalyzer.analyze(spineInstance);
      setBenchmarkData(analysisResult);
      
      // Also generate performance data
      const perfResult = SpinePerformanceAnalyzer.analyze(spineInstance);
      setPerformanceData(perfResult);
    }
  }, [i18n.language, spineInstance]);

  // Effect to handle spine instance changes and update camera
  useEffect(() => {
    // Clean up previous spine instance from camera container
    if (previousSpineInstanceRef.current && cameraContainerRef.current) {
      // Remove from camera container if it's still a child
      if (previousSpineInstanceRef.current.parent === cameraContainerRef.current) {
        cameraContainerRef.current.removeChild(previousSpineInstanceRef.current);
      }
    }

    if (!spineInstance || !cameraContainerRef.current) {
      // Clear benchmark data when no spine instance
      if (!spineInstance) {
        setBenchmarkData(null);
        setPerformanceData(null);
      }
      previousSpineInstanceRef.current = null;
      return;
    }
    
    // Store reference to current spine instance
    previousSpineInstanceRef.current = spineInstance;
    
    // Add to camera container and look at it
    cameraContainerRef.current.addChild(spineInstance);
    cameraContainerRef.current.lookAtChild(spineInstance);
    
    // Analyze spine data with both analyzers
    const analysisResult = SpineAnalyzer.analyze(spineInstance);
    setBenchmarkData(analysisResult);
    
    const perfResult = SpinePerformanceAnalyzer.analyze(spineInstance);
    setPerformanceData(perfResult);
    
    // Reset all debug flags
    // Ensure debug visualization is turned off by default
    cameraContainerRef.current.setDebugFlags({
      showBones: false,
      showMeshTriangles: false,
      showMeshHull: false,
      showVertices: false,
      showRegionAttachments: false,
      showBoundingBoxes: false,
      showClipping: false,
      showIkConstraints: false,
      showTransformConstraints: false
    });
    
  }, [spineInstance]);
  
  // Effect to update debug visualization when flags change
  useEffect(() => {
    if (!cameraContainerRef.current) return;
    
    cameraContainerRef.current.setDebugFlags({
      showMeshTriangles: meshesVisible,
      showMeshHull: meshesVisible,
      showRegionAttachments: meshesVisible,
      showIkConstraints: ikVisible,
      showPhysics: physicsVisible
    });
    
    // Force update debug graphics
    cameraContainerRef.current.forceResetDebugGraphics();
  }, [meshesVisible, physicsVisible, ikVisible]);

  return {
    spineInstance,
    loadSpineFiles,
    loadSpineFromUrls,
    isLoading,
    benchmarkData,
    performanceData, // Add this
    setBackgroundImage,
    clearBackgroundImage,
    toggleMeshes,
    togglePhysics,
    toggleIk,
    meshesVisible,
    physicsVisible,
    ikVisible,
    cameraContainer: cameraContainerRef.current
  };
}