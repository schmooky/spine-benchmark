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
import { encryptJson } from '../utils/shareEncryption';
import { encodeFiles } from '../utils/encodeFiles';
import type { ShareOptions } from '../components/ShareModal';

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

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

export function useShareReport() {
  const [isSharing, setIsSharing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { addToast } = useToast();

  const isAvailable = !!REPORTS_API;

  const openModal = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => {
    if (!isSharing) setIsModalOpen(false);
  }, [isSharing]);

  const share = useCallback(async (
    options: ShareOptions,
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

      const report = buildImpactReportModel(analysisResult, { supplemental });

      const fileHashes = droppedFiles
        ? await Promise.all(droppedFiles.map(hashFile))
        : [];

      const screenshot = await captureScreenshot();

      // Capture GIFs + timelines (always, for both modes)
      let animationGifs = new Map<string, Blob>();
      let animationTimelines: Record<string, Array<{ time: number; ri: number; ci: number }>> = {};
      if (spineInstance) {
        addToast('Capturing animation previews...', 'info');
        try {
          const capture = await captureAllAnimationGifs(spineInstance);
          animationGifs = capture.gifs;
          animationTimelines = capture.timelines;
        } catch (err) {
          console.warn('[share] GIF capture failed:', err);
        }
      }

      // Convert GIFs to base64 for inline embedding in the encrypted payload
      const gifsBase64: Record<string, string> = {};
      for (const [name, blob] of animationGifs) {
        gifsBase64[name] = await blobToBase64(blob);
      }

      // For bundle mode, encode all dropped files as base64
      let encodedBundle = null;
      if (options.exportMode === 'bundle' && droppedFiles && droppedFiles.length > 0) {
        addToast('Encoding asset bundle...', 'info');
        encodedBundle = await encodeFiles(droppedFiles);
      }

      // Split payload into PUBLIC (always visible: metrics, timelines)
      // and PRIVATE (encrypted: GIFs, screenshot, asset bundle).
      //
      // Viewers can always see the analysis without a password. Only the
      // visual content is locked behind the password, because that's what
      // actually breaks NDAs - the metrics alone don't reveal the art.
      const publicData = {
        mode: options.exportMode,
        report,
        animationTimelines,
        animationNames: report.animations.map(a => a.name),
        fileHashes,
        meta: {
          skeletonName: report.skeleton.name || analysisResult.skeletonName || '(unnamed)',
          spineVersion: (analysisResult as any).spineVersion || '4.2',
          worstRiLevel: report.summary.rendering.worst.level,
          worstCiLevel: report.summary.computational.worst.level,
          totalAnimations: report.overview.totalAnimations,
          createdAt: new Date().toISOString(),
          hasEncryptedAssets: !!screenshot || Object.keys(gifsBase64).length > 0 || !!encodedBundle,
        },
      };

      const privateData = {
        screenshot: screenshot ? await blobToBase64(screenshot) : null,
        gifs: gifsBase64,
        bundle: encodedBundle,
      };

      addToast('Encrypting...', 'info');
      const envelope = await encryptJson(privateData, options.password);

      addToast('Uploading...', 'info');
      const response = await fetch(`${REPORTS_API}/api/reports/encrypted`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          publicData,
          envelope,
          ttlDays: options.ttlDays,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const result: ShareResult = await response.json();

      window.open(result.url, '_blank', 'noopener');
      try {
        await navigator.clipboard.writeText(result.url);
        addToast('Report opened and link copied!', 'success');
      } catch {
        addToast('Report opened in new tab', 'success');
      }

      setIsModalOpen(false);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to share report';
      addToast(msg, 'error');
      return null;
    } finally {
      setIsSharing(false);
    }
  }, [addToast]);

  return { share, isSharing, isAvailable, isModalOpen, openModal, closeModal };
}
