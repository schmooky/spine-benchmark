/**
 * Captures animated GIF previews AND per-frame RI/CI timeline data for
 * each Spine animation. The timeline data powers the heatmap charts in
 * shared reports.
 */
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { Spine, Physics, BlendMode, ClippingAttachment, MeshAttachment } from '@esotericsoftware/spine-pixi-v8';
import { renderingImpactCost, computationalImpactCost } from '@spine-benchmark/metrics-impact-formula';
import { getPixiApp } from '../hooks/usePixiApp';

const GIF_SIZE = 256;
const GIF_FPS = 12;
const MAX_DURATION = 3;

function yield_(): Promise<void> {
  return new Promise(r => setTimeout(r, 0));
}

export interface FrameSample {
  time: number;
  ri: number;
  ci: number;
}

export interface AnimationCapture {
  gif: Blob | null;
  timeline: FrameSample[];
}

/**
 * Sample RI/CI from the live skeleton state at the current frame.
 */
function sampleImpact(skeleton: any): { ri: number; ci: number } {
  let nonNormalBlends = 0;
  let clippingMasks = 0;
  let totalVertices = 0;
  let activeMeshCount = 0;
  let weightedMeshCount = 0;
  let deformedMeshCount = 0;

  for (const slot of skeleton.drawOrder) {
    if ((slot.color?.a ?? 1) <= 0) continue;
    if (slot.bone && slot.bone.active === false) continue;
    const att = slot.getAttachment();
    if (!att) continue;

    if (slot.data.blendMode !== BlendMode.Normal) nonNormalBlends++;
    if (att instanceof ClippingAttachment) clippingMasks++;
    if (att instanceof MeshAttachment) {
      activeMeshCount++;
      totalVertices += (att.worldVerticesLength ?? 0) / 2;
      if (att.bones && att.bones.length > 0) weightedMeshCount++;
      if (slot.deform && slot.deform.length > 0) deformedMeshCount++;
    }
  }

  const activeIk = (skeleton.ikConstraints ?? []).filter((c: any) => c.active !== false).length;
  const activeTransform = (skeleton.transformConstraints ?? []).filter((c: any) => c.active !== false).length;
  const activePath = (skeleton.pathConstraints ?? []).filter((c: any) => c.active !== false).length;
  const activePhysics = (skeleton.physicsConstraints ?? []).filter((c: any) => c.active !== false).length;

  const ri = renderingImpactCost({
    activeNonNormalBlends: nonNormalBlends,
    activeClippingMasks: clippingMasks,
    totalVertices,
  });

  const ci = computationalImpactCost({
    constraints: { physics: activePhysics, path: activePath, ik: activeIk, transform: activeTransform },
    totalVertices,
    activeMeshCount,
    weightedMeshCount,
    deformedMeshCount,
  });

  return { ri: Number(ri.toFixed(2)), ci: Number(ci.toFixed(2)) };
}

export async function captureAnimationGif(
  spineInstance: Spine,
  animationName: string,
): Promise<AnimationCapture> {
  const app = getPixiApp();
  if (!app) return { gif: null, timeline: [] };

  const skeleton = spineInstance.skeleton;
  const state = spineInstance.state;
  const animation = skeleton.data.findAnimation(animationName);
  if (!animation) return { gif: null, timeline: [] };

  const duration = Math.min(animation.duration || 0.5, MAX_DURATION);
  const frameCount = Math.max(6, Math.ceil(duration * GIF_FPS));
  const delay = Math.round(1000 / GIF_FPS);

  const offscreen = document.createElement('canvas');
  offscreen.width = GIF_SIZE;
  offscreen.height = GIF_SIZE;
  const offCtx = offscreen.getContext('2d')!;

  const prevAutoUpdate = spineInstance.autoUpdate;
  const prevTrack = state.getCurrent(0);
  const prevTrackTime = prevTrack?.trackTime ?? 0;
  const prevAnimName = prevTrack?.animation?.name ?? null;
  const prevLoop = prevTrack?.loop ?? false;

  const timeline: FrameSample[] = [];

  try {
    spineInstance.autoUpdate = false;
    const renderer = app.renderer as any;
    const gif = GIFEncoder();

    for (let i = 0; i < frameCount; i++) {
      const time = duration > 0 ? (i / Math.max(frameCount - 1, 1)) * duration : 0;

      skeleton.setToSetupPose();
      state.clearTracks();
      state.setAnimation(0, animationName, false);
      state.update(time);
      state.apply(skeleton);
      skeleton.updateWorldTransform(Physics.update);

      // Sample RI/CI at this frame
      const impact = sampleImpact(skeleton);
      timeline.push({ time: Number(time.toFixed(3)), ri: impact.ri, ci: impact.ci });

      // Render + yield for WebGL flush
      app.render();
      await yield_();

      let sourceCanvas: HTMLCanvasElement;
      if (renderer?.extract?.canvas) {
        sourceCanvas = renderer.extract.canvas(app.stage) as HTMLCanvasElement;
      } else {
        sourceCanvas = app.canvas as HTMLCanvasElement;
      }

      // Crop to centered square
      const sw = sourceCanvas.width;
      const sh = sourceCanvas.height;
      const cropSize = Math.min(sw, sh);
      const sx = (sw - cropSize) / 2;
      const sy = (sh - cropSize) / 2;

      offCtx.fillStyle = '#0E1117';
      offCtx.fillRect(0, 0, GIF_SIZE, GIF_SIZE);
      offCtx.drawImage(sourceCanvas, sx, sy, cropSize, cropSize, 0, 0, GIF_SIZE, GIF_SIZE);

      const imageData = offCtx.getImageData(0, 0, GIF_SIZE, GIF_SIZE);
      const palette = quantize(imageData.data, 256);
      const indexed = applyPalette(imageData.data, palette);

      gif.writeFrame(indexed, GIF_SIZE, GIF_SIZE, { palette, delay });
    }

    gif.finish();
    const blob = new Blob([new Uint8Array(gif.bytes())], { type: 'image/gif' });
    console.log(`[gifCapture] ${animationName}: ${frameCount} frames, ${(blob.size / 1024).toFixed(1)} KB, timeline ${timeline.length} points`);
    return { gif: blob, timeline };
  } catch (err) {
    console.warn('[gifCapture] Failed for', animationName, err);
    return { gif: null, timeline };
  } finally {
    state.clearTracks();
    skeleton.setToSetupPose();
    skeleton.updateWorldTransform(Physics.update);
    if (prevAnimName) {
      state.setAnimation(0, prevAnimName, prevLoop);
      const restored = state.getCurrent(0);
      if (restored) {
        restored.trackTime = prevTrackTime;
        restored.animationLast = prevTrackTime;
        state.update(0);
        state.apply(skeleton);
        skeleton.updateWorldTransform(Physics.update);
      }
    }
    spineInstance.autoUpdate = prevAutoUpdate;
  }
}

export async function captureAllAnimationGifs(
  spineInstance: Spine,
): Promise<{ gifs: Map<string, Blob>; timelines: Record<string, FrameSample[]> }> {
  const gifs = new Map<string, Blob>();
  const timelines: Record<string, FrameSample[]> = {};

  for (const animation of spineInstance.skeleton.data.animations) {
    const result = await captureAnimationGif(spineInstance, animation.name);
    if (result.gif) gifs.set(animation.name, result.gif);
    if (result.timeline.length > 0) timelines[animation.name] = result.timeline;
  }

  console.log(`[gifCapture] captured ${gifs.size} GIFs, ${Object.keys(timelines).length} timelines`);
  return { gifs, timelines };
}
