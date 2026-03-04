import { useEffect, useRef, useState, useCallback, RefObject } from 'react';
import { Application, Container } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { SpineLoader } from '../core/SpineLoader';
import { StoredAsset, assetToFiles } from '../core/storage/assetStore';

export interface ComparisonPane {
  app: Application | null;
  spine: Spine | null;
  viewport: Container | null;
  loadAsset: (asset: StoredAsset) => Promise<void>;
  isLoading: boolean;
}

function destroyComparisonApp(app: Application): void {
  // Passing `true` to app.destroy() releases global PIXI resources in v8,
  // which can break other active renderer instances.
  app.stop();
  app.destroy({ removeView: true }, { children: true });
}

export function useComparisonApp(
  containerRef: RefObject<HTMLDivElement | null>,
  backgroundColor: string,
): ComparisonPane {
  const appRef = useRef<Application | null>(null);
  const viewportRef = useRef<Container | null>(null);
  const [spine, setSpine] = useState<Spine | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const parseBackgroundColor = useCallback((value: string): number => {
    const normalized = value.replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return 0xefefec;
    return Number.parseInt(normalized, 16);
  }, []);

  // Create Pixi Application on mount
  useEffect(() => {
    let destroyed = false;

    const init = async () => {
      const container = containerRef.current;
      if (!container) return;

      const app = new Application();
      await app.init({
        antialias: true,
        resolution: 2,
        autoDensity: true,
        resizeTo: container,
        backgroundColor: parseBackgroundColor(backgroundColor),
      });

      if (destroyed) {
        destroyComparisonApp(app);
        return;
      }

      container.appendChild(app.canvas);

      const viewport = new Container();
      viewport.x = container.clientWidth / 2;
      viewport.y = container.clientHeight / 2;
      app.stage.addChild(viewport);

      appRef.current = app;
      viewportRef.current = viewport;
      setReady(true);
    };

    init();

    return () => {
      destroyed = true;
      if (appRef.current) {
        destroyComparisonApp(appRef.current);
        appRef.current = null;
      }
      viewportRef.current = null;
      setReady(false);
      setSpine(null);
    };
  }, [containerRef, parseBackgroundColor]);

  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    app.renderer.background.color = parseBackgroundColor(backgroundColor);
  }, [backgroundColor, parseBackgroundColor]);

  const loadAsset = useCallback(
    async (asset: StoredAsset) => {
      const app = appRef.current;
      const viewport = viewportRef.current;
      if (!app || !viewport) return;

      setIsLoading(true);

      try {
        // Remove previous spine child
        while (viewport.children.length > 0) {
          viewport.removeChildAt(0);
        }

        const files = assetToFiles(asset);
        const dt = new DataTransfer();
        files.forEach((f) => dt.items.add(f));

        const loader = new SpineLoader(app);
        const spineInstance = await loader.loadSpineFiles(dt.files);

        if (!spineInstance) {
          setSpine(null);
          return;
        }

        // Fit spine into viewport
        const bounds = spineInstance.getBounds();
        const container = app.canvas.parentElement;
        if (container) {
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          const scale = Math.min(
            (cw * 0.8) / bounds.width,
            (ch * 0.8) / bounds.height,
            1,
          );
          spineInstance.scale.set(scale);
          spineInstance.x = -bounds.x * scale - (bounds.width * scale) / 2;
          spineInstance.y = -bounds.y * scale - (bounds.height * scale) / 2;
        }

        viewport.addChild(spineInstance);
        setSpine(spineInstance);
      } catch (err) {
        console.error('Comparison pane: failed to load asset', err);
        setSpine(null);
      } finally {
        setIsLoading(false);
      }
    },
    [ready],
  );

  return {
    app: appRef.current,
    spine,
    viewport: viewportRef.current,
    loadAsset,
    isLoading,
  };
}
