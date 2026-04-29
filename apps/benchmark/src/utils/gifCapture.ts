/**
 * Captures animated GIF previews AND per-frame RI/CI timeline data.
 * Uses the Spine instance's own update() method to rebuild pixi
 * renderables between frames - manual state.update/apply/updateWorldTransform
 * was NOT enough because it bypassed the pixi-specific renderable rebuild
 * that happens inside Spine.update().
 */
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { Spine, Physics, BlendMode, ClippingAttachment, MeshAttachment } from '@esotericsoftware/spine-pixi-v8';
import {
  activeConstraintStats,
  avgBoneInfluencesForMesh,
  computationalImpactCost,
  countMixingDepth,
  renderingImpactCost,
} from '@spine-benchmark/metrics-impact-formula';
import { getPixiApp } from '../hooks/usePixiApp';

const GIF_SIZE = 256;
const GIF_FPS = 12;
const MAX_DURATION = 3;

export interface FrameSample {
  time: number;
  ri: number;
  ci: number;
}

export interface AnimationCapture {
  gif: Blob | null;
  timeline: FrameSample[];
}

function sampleImpact(skeleton: any, state: any): { ri: number; ci: number } {
  let nonNormalBlends = 0;
  let clippingMasks = 0;
  let totalVertices = 0;
  let activeMeshCount = 0;
  let weightedMeshCount = 0;
  let deformedMeshCount = 0;
  const meshDetails: Array<{ vertices: number; weighted: boolean; deformed: boolean; boneInfluences: number }> = [];

  for (const slot of skeleton.drawOrder) {
    if ((slot.color?.a ?? 1) <= 0) continue;
    if (slot.bone && slot.bone.active === false) continue;
    const att = slot.getAttachment();
    if (!att) continue;
    if (slot.data.blendMode !== BlendMode.Normal) nonNormalBlends++;
    if (att instanceof ClippingAttachment) clippingMasks++;
    if (att instanceof MeshAttachment) {
      activeMeshCount++;
      const vertCount = (att.worldVerticesLength ?? 0) / 2;
      totalVertices += vertCount;
      const isWeighted = att.bones != null && att.bones.length > 0;
      const isDeformed = slot.deform != null && slot.deform.length > 0;
      if (isWeighted) weightedMeshCount++;
      if (isDeformed) deformedMeshCount++;
      let boneInfluences = 1;
      if (isWeighted && att.bones) {
        boneInfluences = avgBoneInfluencesForMesh(att.bones as number[]);
      }
      meshDetails.push({ vertices: vertCount, weighted: isWeighted, deformed: isDeformed, boneInfluences });
    }
  }

  const stats = activeConstraintStats(skeleton);

  return {
    ri: Number(renderingImpactCost({
      activeNonNormalBlends: nonNormalBlends,
      activeClippingMasks: clippingMasks,
      totalVertices,
    }).toFixed(2)),
    ci: Number(computationalImpactCost({
      constraints: stats.active,
      physicsActiveAll: stats.physicsActiveAll,
      constraintBones: stats.bones,
      totalVertices, activeMeshCount, weightedMeshCount, deformedMeshCount,
      meshDetails,
      mixingDepth: countMixingDepth(state),
    }).toFixed(2)),
  };
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
    // CRITICAL: set autoUpdate=false so the ticker doesn't interfere,
    // then use spineInstance.update(0) which does the FULL pipeline:
    //   state.update -> state.apply -> skeleton.updateWorldTransform
    //   -> rebuild pixi renderables (the part manual calls miss)
    spineInstance.autoUpdate = false;
    const renderer = app.renderer as any;
    const gif = GIFEncoder();

    for (let i = 0; i < frameCount; i++) {
      const time = duration > 0 ? (i / Math.max(frameCount - 1, 1)) * duration : 0;

      // Reset to clean state
      skeleton.setToSetupPose();
      state.clearTracks();

      // Set animation and advance to target time
      const track = state.setAnimation(0, animationName, false);
      track.trackTime = time;
      track.animationLast = -1; // force full keyframe application

      // Use the Spine class's own update() which rebuilds pixi
      // renderables. When autoUpdate=false, update(dt) calls
      // internalUpdate which does state.update + state.apply +
      // skeleton.updateWorldTransform INCLUDING the pixi-specific
      // afterUpdateWorldTransforms callback that rebuilds batch data.
      (spineInstance as any).update?.(0);

      // Fallback if update doesn't exist on this version
      if (typeof (spineInstance as any).update !== 'function') {
        state.update(0);
        state.apply(skeleton);
        skeleton.updateWorldTransform(Physics.update);
      }

      // Sample RI/CI at this frame
      const impact = sampleImpact(skeleton, state);
      timeline.push({ time: Number(time.toFixed(3)), ri: impact.ri, ci: impact.ci });

      // Render to the main canvas then yield so WebGL flushes
      app.render();
      await new Promise<void>(r => requestAnimationFrame(() => r()));

      // Extract the rendered frame
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
    console.log(`[gifCapture] ${animationName}: ${frameCount} frames, ${(blob.size / 1024).toFixed(1)} KB`);
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
  return { gifs, timelines };
}
