/**
 * Captures animated GIF previews of Spine animations by sampling the
 * pixi canvas at ~12fps, cropped to a square thumbnail centered on the
 * spine's bounding box. Uses `gifenc` for encoding.
 */
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { Spine, Physics } from '@esotericsoftware/spine-pixi-v8';
import { getPixiApp } from '../hooks/usePixiApp';

const GIF_SIZE = 256; // square output
const GIF_FPS = 12;
const MAX_DURATION = 3;

export async function captureAnimationGif(
  spineInstance: Spine,
  animationName: string,
): Promise<Blob | null> {
  const app = getPixiApp();
  if (!app) return null;

  const skeleton = spineInstance.skeleton;
  const state = spineInstance.state;
  const animation = skeleton.data.findAnimation(animationName);
  if (!animation) return null;

  const duration = Math.min(animation.duration || 0.5, MAX_DURATION);
  // Minimum 6 frames even for short animations so the GIF visibly animates
  const frameCount = Math.max(6, Math.ceil(duration * GIF_FPS));
  const delay = Math.round(1000 / GIF_FPS);

  // Offscreen canvas for cropping to a square
  const offscreen = document.createElement('canvas');
  offscreen.width = GIF_SIZE;
  offscreen.height = GIF_SIZE;
  const offCtx = offscreen.getContext('2d')!;

  const prevAutoUpdate = spineInstance.autoUpdate;
  const prevTrack = state.getCurrent(0);
  const prevTrackTime = prevTrack?.trackTime ?? 0;
  const prevAnimName = prevTrack?.animation?.name ?? null;
  const prevLoop = prevTrack?.loop ?? false;

  try {
    spineInstance.autoUpdate = false;
    const renderer = app.renderer as any;
    const gif = GIFEncoder();

    for (let i = 0; i < frameCount; i++) {
      const time = duration > 0 ? (i / Math.max(frameCount - 1, 1)) * duration : 0;

      // Reset skeleton to setup pose before each frame so spine computes
      // the full pose from scratch. Without this, setting trackTime and
      // animationLast to the same value makes spine think no time passed
      // and it skips applying keyframes - producing a static GIF.
      skeleton.setToSetupPose();
      state.clearTracks();
      const track = state.setAnimation(0, animationName, false);
      track.trackTime = time;
      track.animationLast = -1; // force full apply
      state.update(0);
      state.apply(skeleton);
      skeleton.updateWorldTransform(Physics.update);

      // Render the frame
      app.render();

      // Extract canvas
      let sourceCanvas: HTMLCanvasElement;
      if (renderer?.extract?.canvas) {
        sourceCanvas = renderer.extract.canvas(app.stage) as HTMLCanvasElement;
      } else {
        sourceCanvas = app.canvas as HTMLCanvasElement;
      }

      // Crop to a centered square from the source canvas
      const sw = sourceCanvas.width;
      const sh = sourceCanvas.height;
      const cropSize = Math.min(sw, sh);
      const sx = (sw - cropSize) / 2;
      const sy = (sh - cropSize) / 2;

      offCtx.fillStyle = '#0E1117'; // match benchmark bg
      offCtx.fillRect(0, 0, GIF_SIZE, GIF_SIZE);
      offCtx.drawImage(sourceCanvas, sx, sy, cropSize, cropSize, 0, 0, GIF_SIZE, GIF_SIZE);

      const imageData = offCtx.getImageData(0, 0, GIF_SIZE, GIF_SIZE);
      const palette = quantize(imageData.data, 256);
      const indexed = applyPalette(imageData.data, palette);

      gif.writeFrame(indexed, GIF_SIZE, GIF_SIZE, {
        palette,
        delay,
        dispose: 2,
      });
    }

    gif.finish();
    return new Blob([new Uint8Array(gif.bytes())], { type: 'image/gif' });
  } catch (err) {
    console.warn('[gifCapture] Failed for', animationName, err);
    return null;
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
): Promise<Map<string, Blob>> {
  const gifs = new Map<string, Blob>();
  for (const animation of spineInstance.skeleton.data.animations) {
    const gif = await captureAnimationGif(spineInstance, animation.name);
    if (gif) gifs.set(animation.name, gif);
  }
  return gifs;
}
