import { useRef, useState, useCallback, useEffect } from 'react';
import type { Spine } from '@esotericsoftware/spine-pixi-v8';
import { Physics } from '@esotericsoftware/spine-core';
import type { SliceLayer } from './useZSlice';
import { getPixiApp } from './usePixiApp';
import { Matrix, RenderTexture } from 'pixi.js';

/* ── Constants ─────────────────────────────────────────────────────── */
/** Prerender FPS - lower = less memory, higher = smoother scrubbing */
const PRERENDER_FPS = 30;
/** Yield to browser every N frames during prerender to keep UI responsive */
const PRERENDER_BATCH = 4;

/* ── Capture internals ─────────────────────────────────────────────── */

interface CaptureState {
  rt: RenderTexture;
  transform: Matrix;
  rtW: number;
  rtH: number;
  lbX: number;
  lbY: number;
  rgReady: boolean;
}

function ensureCaptureState(ref: { current: CaptureState | null }): CaptureState {
  if (!ref.current) {
    ref.current = {
      rt: RenderTexture.create({ width: 2, height: 2, resolution: 1 }),
      transform: new Matrix(),
      rtW: 2,
      rtH: 2,
      lbX: 0,
      lbY: 0,
      rgReady: false,
    };
  }
  return ref.current;
}

/**
 * Capture one layer's texture into a raw HTMLCanvasElement (returned).
 * Caller is responsible for cloning if needed.
 */
function captureLayerCanvas(
  spine: Spine,
  layer: SliceLayer,
  state: CaptureState,
): HTMLCanvasElement | null {
  const app = getPixiApp();
  if (!app || !spine.skeleton) return null;

  const renderer = app.renderer;
  const skeleton = spine.skeleton;
  const drawOrder = skeleton.drawOrder;
  if (drawOrder.length === 0) return null;

  const lb = spine.getLocalBounds();
  const fw = Math.ceil(lb.width);
  const fh = Math.ceil(lb.height);
  if (fw <= 0 || fh <= 0) return null;

  if (fw !== state.rtW || fh !== state.rtH) {
    state.rt.resize(fw, fh);
    state.rtW = fw;
    state.rtH = fh;
  }
  state.lbX = lb.x;
  state.lbY = lb.y;

  // Save attachments
  const savedAttachments: (unknown | null)[] = new Array(drawOrder.length);
  for (let i = 0; i < drawOrder.length; i++) {
    savedAttachments[i] = drawOrder[i].attachment;
  }

  const visibleNames = new Set(layer.slots.map((s) => s.slotName));

  // Null-out hidden slots
  for (let i = 0; i < drawOrder.length; i++) {
    const slot = drawOrder[i];
    if (!visibleNames.has(slot.data.name)) {
      slot.attachment = null;
    }
  }

  // Force spine + render-group rebuild
  spine.spineAttachmentsDirty = true;
  (spine as any)._stateChanged = true;
  if (!state.rgReady) {
    if (typeof (spine as any).enableRenderGroup === 'function') {
      (spine as any).enableRenderGroup();
    }
    state.rgReady = true;
  }
  const rg = (spine as any).renderGroup;
  if (rg) rg.structureDidChange = true;

  let result: HTMLCanvasElement | null = null;
  try {
    state.transform.identity();
    state.transform.translate(-state.lbX, -state.lbY);
    renderer.render({
      container: spine,
      target: state.rt,
      clear: true,
      transform: state.transform,
    });
    result = renderer.extract.canvas({ target: state.rt }) as HTMLCanvasElement;
  } catch {
    // silently skip
  }

  // Restore attachments
  for (let i = 0; i < drawOrder.length; i++) {
    drawOrder[i].attachment = savedAttachments[i] as any;
  }
  spine.spineAttachmentsDirty = true;
  (spine as any)._stateChanged = true;
  if (rg) rg.structureDidChange = true;

  return result;
}

/* ── Exported types ────────────────────────────────────────────────── */

export interface PrerenderFrame {
  /** layerId -> cloned canvas with that layer's rendered content */
  textures: Map<string, HTMLCanvasElement>;
}

export type PrerenderStatus = 'idle' | 'prerendering' | 'ready';

export interface PrerenderResult {
  /** Prerendered frame array (empty until status is 'ready') */
  frames: PrerenderFrame[];
  /** Total frame count (0 until status is 'ready') */
  totalFrames: number;
  /** Animation duration in seconds */
  duration: number;
  /** Current prerender state */
  status: PrerenderStatus;
  /** 0-1 progress during prerendering */
  progress: number;
  /** Manually trigger a prerender for a specific animation+skin */
  prerender: (animationName: string, skinName: string) => void;
}

/* ── Hook ──────────────────────────────────────────────────────────── */

export function usePrerender(
  spineInstance: Spine | null,
  layers: SliceLayer[],
): PrerenderResult {
  const [status, setStatus] = useState<PrerenderStatus>('idle');
  const [progress, setProgress] = useState(0);
  /** Frames stored in state so React re-renders dependents when cache becomes available */
  const [cachedFrames, setCachedFrames] = useState<PrerenderFrame[]>([]);
  const [cachedDuration, setCachedDuration] = useState(0);

  const cacheKeyRef = useRef('');
  const cancelRef = useRef(false);
  const captureStateRef = useRef<CaptureState | null>(null);

  // Keep refs fresh for the async prerender closure
  const spineRef = useRef(spineInstance);
  spineRef.current = spineInstance;
  const layersRef = useRef(layers);
  layersRef.current = layers;

  const prerender = useCallback(async (animationName: string, skinName: string) => {
    const sp = spineRef.current;
    const lrs = layersRef.current;
    if (!sp || lrs.length === 0 || !animationName) return;

    const anim = sp.skeleton.data.findAnimation(animationName);
    if (!anim || anim.duration <= 0) return;

    const key = `${animationName}|${skinName}|${lrs.map((l) => l.id).join('|')}`;
    if (key === cacheKeyRef.current) {
      setStatus('ready');
      return;
    }

    // Cancel in-flight prerender
    cancelRef.current = true;
    await new Promise((r) => requestAnimationFrame(r));
    cancelRef.current = false;

    setStatus('prerendering');
    setProgress(0);

    const cs = ensureCaptureState(captureStateRef);
    const duration = anim.duration;
    const fps = PRERENDER_FPS;
    const dt = 1 / fps;
    const totalFrames = Math.ceil(duration * fps);
    const frames: PrerenderFrame[] = [];

    // Save spine state
    const savedAutoUpdate = sp.autoUpdate;
    const savedTimeScale = sp.state.timeScale;
    const prevEntry = sp.state.getCurrent(0);
    const savedAnimName = prevEntry?.animation?.name ?? '';
    const savedLoop = prevEntry?.loop ?? false;
    const savedTrackTime = prevEntry?.trackTime ?? 0;

    // Pause normal ticker
    sp.autoUpdate = false;
    sp.state.timeScale = 0;

    // Apply requested skin if needed
    if (skinName) {
      const skin = sp.skeleton.data.findSkin(skinName);
      if (skin) {
        sp.skeleton.setSkin(skin);
        sp.skeleton.setSlotsToSetupPose();
      }
    }

    // Reset animation to t=0
    sp.state.setAnimation(0, animationName, false);
    sp.state.update(0);
    sp.skeleton.update(0);
    sp.state.apply(sp.skeleton);
    sp.skeleton.updateWorldTransform(Physics.update);

    let capturesDone = 0;

    for (let f = 0; f < totalFrames; f++) {
      if (cancelRef.current) break;

      if (f > 0) {
        sp.state.update(dt);
        sp.skeleton.update(dt);
        sp.state.apply(sp.skeleton);
        sp.skeleton.updateWorldTransform(Physics.update);
      }

      // Force pixi spine state
      (sp as any)._stateChanged = true;
      sp.spineAttachmentsDirty = true;

      const frameTextures = new Map<string, HTMLCanvasElement>();
      for (const layer of lrs) {
        const canvas = captureLayerCanvas(sp, layer, cs);
        if (canvas) {
          const clone = document.createElement('canvas');
          clone.width = canvas.width;
          clone.height = canvas.height;
          const ctx = clone.getContext('2d');
          if (ctx) ctx.drawImage(canvas, 0, 0);
          frameTextures.set(layer.id, clone);
        }
      }
      frames.push({ textures: frameTextures });
      capturesDone++;

      if (capturesDone % PRERENDER_BATCH === 0) {
        setProgress(capturesDone / totalFrames);
        await new Promise((r) => requestAnimationFrame(r));
      }
    }

    // Restore spine state
    sp.autoUpdate = savedAutoUpdate;
    sp.state.timeScale = savedTimeScale;
    if (savedAnimName) {
      sp.state.setAnimation(0, savedAnimName, savedLoop);
      const restored = sp.state.getCurrent(0);
      if (restored) restored.trackTime = savedTrackTime;
    }

    if (!cancelRef.current) {
      cacheKeyRef.current = key;
      setCachedFrames(frames);
      setCachedDuration(duration);
      setStatus('ready');
      setProgress(1);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelRef.current = true;
      if (captureStateRef.current) {
        captureStateRef.current.rt.destroy(true);
        captureStateRef.current = null;
      }
    };
  }, []);

  return {
    frames: cachedFrames,
    totalFrames: cachedFrames.length,
    duration: cachedDuration,
    status,
    progress,
    prerender,
  };
}
