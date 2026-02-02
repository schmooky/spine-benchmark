import { Application } from 'pixi.js';
import { useEffect, useState } from 'react';
import { useToast } from './ToastContext';
import { useTranslation } from 'react-i18next';

export interface UsePixiAppOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  backgroundColor: string;
}

/**
 * Initializes and manages the PIXI Application lifecycle.
 * Returns the app instance and cleans up on unmount.
 */
export function usePixiApp({ canvasRef, backgroundColor }: UsePixiAppOptions) {
  const [app, setApp] = useState<Application | null>(null);
  const { addToast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    if (!canvasRef.current) return;

    let cleanupFunction: (() => void) | undefined;

    const initApp = async () => {
      try {
        const pixiApp = new Application();
        await pixiApp.init({
          backgroundColor: parseInt(backgroundColor.replace('#', '0x'), 16),
          canvas: canvasRef.current!,
          resizeTo: canvasRef.current!.parentElement ?? undefined,
          antialias: true,
          resolution: 2,
          autoDensity: true,
        });

        setApp((prev) => {
          prev?.destroy();
          return pixiApp;
        });

        cleanupFunction = () => {
          pixiApp.destroy();
        };
      } catch (error) {
        addToast(
          t('error.failedToInitialize', error instanceof Error ? error.message : 'Unknown error'),
          'error'
        );
      }
    };

    initApp();

    return () => {
      cleanupFunction?.();
    };
  }, [addToast, t]);

  useEffect(() => {
    if (app) {
      app.renderer.background.color = parseInt(backgroundColor.replace('#', '0x'), 16);
    }
  }, [backgroundColor, app]);

  return app;
}
