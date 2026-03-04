import { Application } from 'pixi.js';
import 'pixi.js/basis';
import 'pixi.js/ktx2';
import { useEffect, useRef, useState } from 'react';
import { useToast } from './ToastContext';
import { useTranslation } from 'react-i18next';
import { tIndexed } from '../utils/indexedMessage';

export interface UsePixiAppOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  backgroundColor: string;
}

let singletonApp: Application | null = null;
let singletonInitPromise: Promise<Application> | null = null;

/** Returns the singleton PIXI canvas element (even if detached from DOM). */
export function getPixiCanvas(): HTMLCanvasElement | null {
  return singletonApp?.canvas ?? null;
}

/** Re-parent the singleton canvas into a new host and update resizeTo so it fills the container. */
export function reparentPixiCanvas(container: HTMLElement): void {
  if (!singletonApp) return;
  if (!container.isConnected) return;

  const needsParentMove = singletonApp.canvas.parentElement !== container;
  const needsResizeTarget = singletonApp.resizeTo !== container;

  if (needsParentMove) {
    container.appendChild(singletonApp.canvas);
  }

  if (needsResizeTarget) {
    singletonApp.resizeTo = container;
  }

  const targetWidth = Math.round(container.clientWidth);
  const targetHeight = Math.round(container.clientHeight);
  const sizeChanged =
    targetWidth > 0 &&
    targetHeight > 0 &&
    (singletonApp.screen.width !== targetWidth || singletonApp.screen.height !== targetHeight);

  if (sizeChanged) {
    singletonApp.resize();
  }
}

const parseBackgroundColor = (value: string): number => parseInt(value.replace('#', '0x'), 16);

async function getOrCreateApp(container: HTMLDivElement, backgroundColor: string): Promise<Application> {
  if (singletonApp) {
    if (singletonApp.canvas.parentElement !== container) {
      container.appendChild(singletonApp.canvas);
    }
    singletonApp.resizeTo = container;
    singletonApp.renderer.background.color = parseBackgroundColor(backgroundColor);
    singletonApp.resize();
    return singletonApp;
  }

  if (singletonInitPromise) {
    const app = await singletonInitPromise;
    if (app.canvas.parentElement !== container) {
      container.appendChild(app.canvas);
    }
    app.resizeTo = container;
    app.renderer.background.color = parseBackgroundColor(backgroundColor);
    app.resize();
    return app;
  }

  singletonInitPromise = (async () => {
    const app = new Application();
    await app.init({
      backgroundColor: parseBackgroundColor(backgroundColor),
      antialias: true,
      resolution: 2,
      autoDensity: true,
      resizeTo: container,
    });
    app.canvas.id = 'pixiCanvas';
    container.appendChild(app.canvas);
    singletonApp = app;
    return app;
  })();

  try {
    return await singletonInitPromise;
  } finally {
    singletonInitPromise = null;
  }
}

/**
 * Initializes and manages the PIXI Application lifecycle.
 * Returns the app instance and cleans up on unmount.
 */
export function usePixiApp({ containerRef, backgroundColor }: UsePixiAppOptions) {
  const [app, setApp] = useState<Application | null>(null);
  const { addToast } = useToast();
  const { t } = useTranslation();
  const addToastRef = useRef(addToast);
  const tRef = useRef(t);
  const backgroundColorRef = useRef(backgroundColor);

  useEffect(() => {
    addToastRef.current = addToast;
    tRef.current = t;
  }, [addToast, t]);

  useEffect(() => {
    backgroundColorRef.current = backgroundColor;
  }, [backgroundColor]);

  useEffect(() => {
    let cancelled = false;
    let rafId: number | null = null;

    const initWhenReady = async () => {
      if (cancelled) return;
      const container = containerRef.current;
      if (!container) {
        rafId = window.requestAnimationFrame(() => {
          void initWhenReady();
        });
        return;
      }

      try {
        const pixiApp = await getOrCreateApp(container, backgroundColorRef.current);
        if (!cancelled) setApp(pixiApp);
      } catch (error) {
        addToastRef.current(
          tIndexed(tRef.current, 'error.failedToInitialize', [
            error instanceof Error ? error.message : tRef.current('dashboard.messages.unknownError'),
          ]),
          'error'
        );
      }
    };

    void initWhenReady();

    return () => {
      cancelled = true;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      setApp(null);
    };
  }, [containerRef]);

  useEffect(() => {
    if (app) {
      app.renderer.background.color = parseBackgroundColor(backgroundColor);
    }
  }, [backgroundColor, app]);

  return app;
}
