import { Application } from 'pixi.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CameraContainer } from '../core/CameraContainer';
import { SpineAnalyzer, SpineAnalysisResult } from '../core/SpineAnalyzer';
import { useSpineLoader } from './useSpineLoader';
import { useDebugVisualizer } from './useDebugVisualizer';
import { useBackgroundManager } from './useBackgroundManager';

export function useSpineApp(app: Application | null) {
  const { i18n } = useTranslation();
  const [benchmarkData, setBenchmarkData] = useState<SpineAnalysisResult | null>(null);
  
  const cameraContainerRef = useRef<CameraContainer | null>(null);
  
  const { 
    spineInstance, 
    isLoading, 
    loadSpineFiles, 
    loadSpineFromUrls
  } = useSpineLoader(app);
  
  const {
    meshesVisible,
    physicsVisible,
    ikVisible,
    transformConstraintsVisible,
    pathConstraintsVisible,
    toggleMeshes,
    togglePhysics,
    toggleIk,
    toggleTransformConstraints,
    togglePathConstraints
  } = useDebugVisualizer();
  
  const { 
    hasBackground, 
    setBackgroundImage, 
    clearBackgroundImage
  } = useBackgroundManager(app);

  const getCameraContainer = useCallback((): CameraContainer | null => {
    return cameraContainerRef.current;
  }, []);

  const setHighlightedMeshSlot = useCallback((slotName: string | null) => {
    cameraContainerRef.current?.setHighlightedMeshSlot(slotName);
  }, []);

  const setSlotHighlight = useCallback((slotIndex: number | null) => {
    cameraContainerRef.current?.setSlotHighlight(slotIndex);
  }, []);

  const setMeshHighlightStyle = useCallback((style: { color?: number; lineWidth?: number }) => {
    cameraContainerRef.current?.setMeshHighlightStyle(style);
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
    const cameraContainer = cameraContainerRef.current;
    if (!cameraContainer) return;

    if (!spineInstance) {
      setBenchmarkData(null);
      cameraContainer.clearSpine();
      return;
    }

    cameraContainer.clearSpine();
    cameraContainer.addChild(spineInstance);
    cameraContainer.lookAtChild(spineInstance);

    cameraContainer.setDebugFlags({
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
      showPhysics: physicsVisible,
      showTransformConstraints: transformConstraintsVisible,
      showPathConstraints: pathConstraintsVisible
    });

    cameraContainerRef.current.forceResetDebugGraphics();
  }, [meshesVisible, ikVisible, physicsVisible, transformConstraintsVisible, pathConstraintsVisible]);

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
    toggleTransformConstraints,
    togglePathConstraints,
    meshesVisible,
    physicsVisible,
    ikVisible,
    transformConstraintsVisible,
    pathConstraintsVisible,
    getCameraContainer,
    setHighlightedMeshSlot,
    setSlotHighlight,
    setMeshHighlightStyle
  };
}
