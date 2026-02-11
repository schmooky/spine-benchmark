import { Application } from 'pixi.js';
import { useEffect, useState } from 'react';
import { useToast } from './ToastContext';
import { useTranslation } from 'react-i18next';

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
  if (singletonApp.canvas.parentElement !== container) {
    container.appendChild(singletonApp.canvas);
  }
  singletonApp.resizeTo = container;
  singletonApp.resize();
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

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const initApp = async () => {
      try {
        const pixiApp = await getOrCreateApp(containerRef.current!, backgroundColor);
        if (!cancelled) setApp(pixiApp);
      } catch (error) {
        addToast(
          t('error.failedToInitialize', { 0: error instanceof Error ? error.message : t('dashboard.messages.unknownError') }),
          'error'
        );
      }
    };

    initApp();

    return () => {
      cancelled = true;
      setApp(null);
    };
  }, [addToast, containerRef, t]);

  useEffect(() => {
    if (app) {
      app.renderer.background.color = parseBackgroundColor(backgroundColor);
    }
  }, [backgroundColor, app]);

  return app;
}
