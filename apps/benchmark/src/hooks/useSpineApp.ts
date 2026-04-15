import { Application } from 'pixi.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CameraContainer } from '../core/CameraContainer';
import { SpineAnalyzer, SpineAnalysisResult } from '../core/SpineAnalyzer';
import { useSpineLoader } from './useSpineLoader';
import { useDebugVisualizer } from './useDebugVisualizer';
import { useBackgroundManager } from './useBackgroundManager';

export function useSpineApp(app: Application | null, pixiHostRef: React.RefObject<HTMLDivElement | null>) {
  const { i18n } = useTranslation();
  const [benchmarkData, setBenchmarkData] = useState<SpineAnalysisResult | null>(null);

  const cameraContainerRef = useRef<CameraContainer | null>(null);
  const canvasSlotElementRef = useRef<HTMLElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

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

  /** Sync pixi-host-persistent position/size to match the canvas slot element */
  const syncPixiHostToSlot = useCallback(() => {
    const host = pixiHostRef.current;
    const slot = canvasSlotElementRef.current;
    if (!host || !slot) return;

    const main = host.parentElement;
    if (!main) return;

    const mainRect = main.getBoundingClientRect();
    const slotRect = slot.getBoundingClientRect();

    const top = slotRect.top - mainRect.top;
    const left = slotRect.left - mainRect.left;
    const width = slotRect.width;
    const height = slotRect.height;

    host.style.top = `${top}px`;
    host.style.left = `${left}px`;
    host.style.width = `${width}px`;
    host.style.height = `${height}px`;

    // Copy border-radius so the canvas clips to the same shape
    const slotStyle = window.getComputedStyle(slot);
    host.style.borderRadius = slotStyle.borderRadius;

    // Resize the PixiJS renderer and re-center the spine to match
    if (app && width > 0 && height > 0) {
      const prevW = app.screen.width;
      const prevH = app.screen.height;
      app.renderer.resize(width, height);

      // If the canvas size actually changed, re-center the spine so
      // lookAtChild uses the correct viewport dimensions. Skip the call
      // if the camera container's recorded `currentSpine` reference is
      // stale (e.g. has already been removed from the container by a
      // bundle swap that's mid-flight) - lookAtChild's own guard handles
      // it gracefully, but checking here avoids the wasted work.
      const cc = cameraContainerRef.current;
      if (
        cc?.currentSpine &&
        cc.currentSpine.parent === cc &&
        (prevW !== width || prevH !== height)
      ) {
        cc.lookAtChild(cc.currentSpine);
      }
    }
  }, [app, pixiHostRef]);

  const setCanvasInteractionElement = useCallback((element: HTMLElement | null) => {
    // Clean up previous observer
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }

    canvasSlotElementRef.current = element;

    const cc = cameraContainerRef.current;
    if (cc && typeof cc.setInteractionElement === 'function') {
      cc.setInteractionElement(element);
    }

    const host = pixiHostRef.current;
    if (!element || !host) {
      // No slot  -  hide the canvas
      if (host) {
        host.style.display = 'none';
      }
      return;
    }

    // Show and position the canvas host
    host.style.display = 'block';
    syncPixiHostToSlot();

    // Observe size changes on the slot and its scroll-parent
    const ro = new ResizeObserver(() => syncPixiHostToSlot());
    ro.observe(element);
    // Also observe the workspace-main parent in case the sidebar toggles
    const main = host.parentElement;
    if (main) ro.observe(main);
    resizeObserverRef.current = ro;
  }, [pixiHostRef, syncPixiHostToSlot]);

  // Clean up ResizeObserver on unmount
  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
    };
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

    if (!spineInstance || !spineInstance.skeleton) {
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
    if (spineInstance?.skeleton?.data) {
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
    setMeshHighlightStyle,
    setCanvasInteractionElement
  };
}
