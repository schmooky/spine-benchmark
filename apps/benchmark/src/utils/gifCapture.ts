/**
 * Captures a short GIF preview of a Spine animation by sampling the
 * pixi canvas at ~10fps, resized to a small thumbnail. Uses `gifenc`
 * (a lightweight synchronous JS GIF encoder) to avoid WASM/Web Worker
 * dependencies.
 *
 * The capture temporarily takes over the spine's animation state, so
 * callers should ensure the analysis pipeline is not running concurrently.
 */
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { Physics } from '@esotericsoftware/spine-pixi-v8';
import { getPixiApp } from '../hooks/usePixiApp';

const GIF_WIDTH = 320;
const GIF_FPS = 10;
const MAX_DURATION = 3; // cap at 3 seconds

/**
 * Capture a looping GIF of a spine animation.
 * Returns a Blob or null if capture failed.
 */
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
  const frameCount = Math.max(2, Math.ceil(duration * GIF_FPS));
  const delay = Math.round(1000 / GIF_FPS); // ms per frame

  // Calculate thumbnail height maintaining aspect ratio
  const canvasW = app.canvas.width || 800;
  const canvasH = app.canvas.height || 600;
  const scale = GIF_WIDTH / canvasW;
  const gifH = Math.round(canvasH * scale);

  // Offscreen canvas for resizing
  const offscreen = document.createElement('canvas');
  offscreen.width = GIF_WIDTH;
  offscreen.height = gifH;
  const offCtx = offscreen.getContext('2d')!;

  // Save current state
  const prevAutoUpdate = spineInstance.autoUpdate;
  const prevTrack = state.getCurrent(0);
  const prevTrackTime = prevTrack?.trackTime ?? 0;
  const prevAnimName = prevTrack?.animation?.name ?? null;
  const prevLoop = prevTrack?.loop ?? false;

  try {
    spineInstance.autoUpdate = false;

    // Set the target animation
    state.setAnimation(0, animationName, false);

    const gif = GIFEncoder();
    const renderer = app.renderer as any;

    for (let i = 0; i < frameCount; i++) {
      const time = (i / (frameCount - 1)) * duration;

      // Advance the animation to the target time
      const track = state.getCurrent(0);
      if (track) {
        track.trackTime = time;
        track.animationLast = time;
      }
      state.update(0);
      state.apply(skeleton);
      skeleton.updateWorldTransform(Physics.update);

      // Render one frame
      app.render();

      // Extract the canvas content
      let sourceCanvas: HTMLCanvasElement;
      if (renderer?.extract?.canvas) {
        sourceCanvas = renderer.extract.canvas(app.stage) as HTMLCanvasElement;
      } else {
        sourceCanvas = app.canvas as HTMLCanvasElement;
      }

      // Resize to thumbnail
      offCtx.clearRect(0, 0, GIF_WIDTH, gifH);
      offCtx.drawImage(sourceCanvas, 0, 0, GIF_WIDTH, gifH);

      // Get pixel data and quantize for GIF
      const imageData = offCtx.getImageData(0, 0, GIF_WIDTH, gifH);
      const palette = quantize(imageData.data, 256);
      const indexed = applyPalette(imageData.data, palette);

      gif.writeFrame(indexed, GIF_WIDTH, gifH, {
        palette,
        delay,
        dispose: 2, // restore to background
      });
    }

    gif.finish();
    const bytes = gif.bytes();
    return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
  } catch (err) {
    console.warn('[gifCapture] Failed to capture GIF for', animationName, err);
    return null;
  } finally {
    // Restore previous state
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

/**
 * Capture GIFs for all animations in a spine instance.
 * Returns a map of animation name -> GIF blob.
 */
export async function captureAllAnimationGifs(
  spineInstance: Spine,
): Promise<Map<string, Blob>> {
  const gifs = new Map<string, Blob>();
  const animations = spineInstance.skeleton.data.animations;

  for (const animation of animations) {
    const gif = await captureAnimationGif(spineInstance, animation.name);
    if (gif) {
      gifs.set(animation.name, gif);
    }
  }

  return gifs;
}
