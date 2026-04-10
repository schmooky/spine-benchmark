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
    if (!app?.canvas) return null;
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
  ): Promise<ShareResult | null> => {
    if (!REPORTS_API) {
      addToast('Share feature is not configured (VITE_REPORTS_API_URL not set)', 'warning');
      return null;
    }

    setIsSharing(true);
    try {
      // Build the impact report model for the share
      const report = buildImpactReportModel(analysisResult);

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

      // Copy link to clipboard
      try {
        await navigator.clipboard.writeText(result.url);
        addToast('Report link copied to clipboard!', 'success');
      } catch {
        addToast(`Report created: ${result.url}`, 'success');
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
