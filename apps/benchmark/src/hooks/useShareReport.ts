import { useState, useCallback } from 'react';
import type { SpineAnalysisResult } from '../core/SpineAnalyzer';
import { getPixiApp } from './usePixiApp';
import { useToast } from './ToastContext';
import {
  buildImpactReportModel,
  type ImpactReportModel,
} from '../core/SpineAnalyzer';

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

    // Use pixi's extract API which correctly reads from the WebGL
    // framebuffer. Direct canvas.toBlob returns a black image on WebGL
    // unless preserveDrawingBuffer was set at init time (which it isn't).
    const renderer = app.renderer as any;
    if (renderer?.extract?.canvas) {
      const extractedCanvas = renderer.extract.canvas(app.stage) as HTMLCanvasElement;
      return new Promise<Blob | null>((resolve) => {
        extractedCanvas.toBlob((blob: Blob | null) => resolve(blob), 'image/png');
      });
    }

    // Fallback: try direct canvas (works for Canvas2D renderer)
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
    droppedFiles?: File[],
    supplemental?: import('../core/SpineAnalyzer').ImpactSupplementalMetrics,
  ): Promise<ShareResult | null> => {
    if (!REPORTS_API) {
      addToast('Share feature is not configured (VITE_REPORTS_API_URL not set)', 'warning');
      return null;
    }

    setIsSharing(true);
    try {
      // Build the impact report model for the share.
      // Pass supplemental metrics (draw-call data from the inspector) if available.
      const report = buildImpactReportModel(analysisResult, { supplemental });

      // Hash source files
      const fileHashes = droppedFiles
        ? await Promise.all(droppedFiles.map(hashFile))
        : [];

      // Capture canvas screenshot
      const screenshot = await captureScreenshot();

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
      }));

      if (screenshot) {
        formData.append('screenshots', screenshot, 'screenshot.png');
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

      // Open report in a new tab and copy link to clipboard
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
