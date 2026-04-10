import { useState, useCallback } from 'react';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import type { SpineAnalysisResult } from '../core/SpineAnalyzer';
import { getPixiApp } from './usePixiApp';
import { useToast } from './ToastContext';
import {
  buildImpactReportModel,
} from '../core/SpineAnalyzer';
import type { ImpactSupplementalMetrics } from '../core/SpineAnalyzer';
import { captureAllAnimationGifs } from '../utils/gifCapture';

const REPORTS_API = import.meta.env.VITE_REPORTS_API_URL;

export interface ShareResult {
  id: string;
  url: string;
  expiresAt: string;
}

async function hashFile(file: File): Promise<{ name: string; sha256: string; size: number }> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return { name: file.name, sha256, size: file.size };
}

async function captureScreenshot(): Promise<Blob | null> {
  try {
    const app = getPixiApp();
    if (!app) return null;
    const renderer = app.renderer as any;
    if (renderer?.extract?.canvas) {
      const extractedCanvas = renderer.extract.canvas(app.stage) as HTMLCanvasElement;
      return new Promise<Blob | null>((resolve) => {
        extractedCanvas.toBlob((blob: Blob | null) => resolve(blob), 'image/png');
      });
    }
    const canvas = app.canvas as HTMLCanvasElement;
    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  } catch {
    return null;
  }
}

export function useShareReport() {
  const [isSharing, setIsSharing] = useState(false);
  const { addToast } = useToast();

  const isAvailable = !!REPORTS_API;

  const share = useCallback(async (
    analysisResult: SpineAnalysisResult,
    spineInstance?: Spine | null,
    droppedFiles?: File[],
    supplemental?: ImpactSupplementalMetrics,
  ): Promise<ShareResult | null> => {
    if (!REPORTS_API) {
      addToast('Share feature is not configured (VITE_REPORTS_API_URL not set)', 'warning');
      return null;
    }

    setIsSharing(true);
    try {
      addToast('Preparing report...', 'info');

      // Build the impact report model
      const report = buildImpactReportModel(analysisResult, { supplemental });

      // Hash source files
      const fileHashes = droppedFiles
        ? await Promise.all(droppedFiles.map(hashFile))
        : [];

      // Capture canvas screenshot
      const screenshot = await captureScreenshot();

      // Capture animation GIFs
      let animationGifs = new Map<string, Blob>();
      if (spineInstance) {
        addToast('Capturing animation previews...', 'info');
        try {
          animationGifs = await captureAllAnimationGifs(spineInstance);
        } catch (err) {
          console.warn('[share] GIF capture failed, continuing without previews:', err);
        }
      }

      addToast('Uploading report...', 'info');

      // Build the form data
      const formData = new FormData();

      formData.append('analysis', JSON.stringify(report));
      formData.append('meta', JSON.stringify({
        skeletonName: report.skeleton.name || analysisResult.skeletonName || '(unnamed)',
        spineVersion: (analysisResult as any).spineVersion || '4.2',
        worstRiLevel: report.summary.rendering.worst.level,
        worstCiLevel: report.summary.computational.worst.level,
        totalAnimations: report.overview.totalAnimations,
        fileHashes,
        // Animation names in order, so the backend knows which GIF belongs to which animation
        animationNames: report.animations.map(a => a.name),
      }));

      // Main screenshot
      if (screenshot) {
        formData.append('screenshots', screenshot, 'screenshot.png');
      }

      // Animation GIFs (named by animation for the backend to store)
      for (const [animName, gifBlob] of animationGifs) {
        formData.append('screenshots', gifBlob, `anim_${animName}.gif`);
      }

      const response = await fetch(`${REPORTS_API}/api/reports`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const result: ShareResult = await response.json();

      window.open(result.url, '_blank', 'noopener');
      try {
        await navigator.clipboard.writeText(result.url);
        addToast('Report opened and link copied to clipboard!', 'success');
      } catch {
        addToast('Report opened in new tab', 'success');
      }

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to share report';
      addToast(msg, 'error');
      return null;
    } finally {
      setIsSharing(false);
    }
  }, [addToast]);

  return { share, isSharing, isAvailable };
}
