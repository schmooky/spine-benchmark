import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { Application } from 'pixi.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CameraContainer } from '../core/CameraContainer';
import { SpineAnalyzer, SpineAnalysisResult } from '../core/SpineAnalyzer';
import { useToast } from './ToastContext';
import { useSpineLoader } from './useSpineLoader';
import { useDebugVisualizer } from './useDebugVisualizer';
import { useBackgroundManager } from './useBackgroundManager';

export type { DebugFlags } from '../core/debug/DebugFlagsManager';

export function useSpineApp(app: Application | null) {
  const { i18n } = useTranslation();
  const [benchmarkData, setBenchmarkData] = useState<SpineAnalysisResult | null>(null);
  
  const cameraContainerRef = useRef<CameraContainer | null>(null);
  const previousSpineInstanceRef = useRef<Spine | null>(null);
  const { addToast } = useToast();
  
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

  const getCameraContainer = useCallback((): CameraContainer | null => {
    return cameraContainerRef.current;
  }, []);

  useEffect(() => {
    if (!app) return;

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

  useEffect(() => {
    if (!spineInstance || !cameraContainerRef.current) {
      if (!spineInstance) {
        setBenchmarkData(null);
      }
      previousSpineInstanceRef.current = null;
      return;
    }

    if (previousSpineInstanceRef.current && cameraContainerRef.current) {
      if (previousSpineInstanceRef.current.parent === cameraContainerRef.current) {
        cameraContainerRef.current.removeChild(previousSpineInstanceRef.current);
      }
    }

    previousSpineInstanceRef.current = spineInstance;
    cameraContainerRef.current.addChild(spineInstance);
    cameraContainerRef.current.lookAtChild(spineInstance);

    cameraContainerRef.current.setDebugFlags({
      showBones: false,
      showMeshTriangles: false,
      showMeshHull: false,
      showVertices: false,
      showRegionAttachments: false,
      showBoundingBoxes: false,
      showClipping: false,
      showIkConstraints: false,
      showTransformConstraints: false,
      showPhysics: false
    });
  }, [spineInstance]);

  useEffect(() => {
    if (spineInstance) {
      setBenchmarkData(SpineAnalyzer.analyze(spineInstance));
    }
  }, [spineInstance, i18n.language]);
  
  useEffect(() => {
    if (!cameraContainerRef.current) return;
    
    cameraContainerRef.current.setDebugFlags({
      showMeshTriangles: meshesVisible,
      showMeshHull: meshesVisible,
      showRegionAttachments: meshesVisible,
      showIkConstraints: ikVisible,
      showPhysics: physicsVisible
    });
    
    cameraContainerRef.current.forceResetDebugGraphics();
  }, [meshesVisible, ikVisible, physicsVisible]);

  return {
    spineInstance,
    loadSpineFiles,
    loadSpineFromUrls,
    isLoading,
    benchmarkData,
    setBackgroundImage,
    clearBackgroundImage,
    toggleMeshes,
    togglePhysics,
    toggleIk,
    meshesVisible,
    physicsVisible,
    ikVisible,
    getCameraContainer
  };
}