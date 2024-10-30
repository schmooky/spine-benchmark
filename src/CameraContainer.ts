import gsap from "gsap";
import { Application, Container, DisplayObject } from "pixi.js";
import { SpineMeshOutline } from "./Outline";
import { Spine } from "@pixi-spine/all-4.1";

export class CameraContainer extends Container {
  originalWidth: any;
  originalHeight: any;
  app: Application;

  constructor(options: { width: number; height: number; app: Application }) {
    super();
    // Store the original scene dimensions
    this.originalWidth = options.width;
    this.originalHeight = options.height;
    this.app = options.app;
  }

  onResize() {
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;

    // Scale the scene to fit the new dimensions
    const scale = Math.min(w / this.originalWidth, h / this.originalHeight);
    this.scale.set(scale);

    // Center the scene
    this.x = (w - this.originalWidth * scale) / 2;
    this.y = (h - this.originalHeight * scale) / 2;
  }

  lookAtChild(object: Spine) {
    const meshOutline = new SpineMeshOutline(this.app,object);
    const padding = 20;
    // Get the bounds of the object in global space
    let bounds: { width: number; height: number; x: number; y: number } =
      object.getBounds();
    if (bounds.width == 0 || bounds.height == 0) {
      bounds.width = object.skeleton.data.width / 2;
      bounds.height = object.skeleton.data.height / 2;
    }

    // Calculate the scale needed to fit the object within the screen
    const scaleX = (this.app.screen.width - padding * 2) / bounds.width;
    const scaleY = (this.app.screen.height - padding * 2) / bounds.height;
    let scale = Math.min(scaleX, scaleY);

    const minScale = 0.2;
    const maxScale = 10;
    const scaleStep = 0.1;

    // Calculate the position to center the object
    const x = this.app.screen.width / 2;
    const y = this.app.screen.height / 2;
    
    // Animate the camera to look at the object
    gsap.to(this, {
      x: x,
      y: y,
      duration: 1,
      ease: "power2.out",
    });

    scale = +(Math.ceil(scale*20)/20).toFixed(2);
    this.scale.set(scale);
    this.setCanvasScaleDebugInfo(scale);
    document
      .getElementById("leftPanel")!
      .addEventListener("wheel", (event) => {
        event.preventDefault();

        // Determine scroll direction
        const scrollDirection = Math.sign(event.deltaY);

        // Update scale based on scroll direction
        scale -= scrollDirection * scaleStep;

        scale = +(Math.ceil(scale*20)/20).toFixed(2);

        // Clamp scale between minScale and maxScale
        scale = Math.max(minScale, Math.min(maxScale, scale));

        // Apply the new scale to the container
        this.scale.set(scale);

        this.setCanvasScaleDebugInfo(scale);
      });
  }

  setCanvasScaleDebugInfo(scale: number) {
    const debug = document.getElementById("canvasScale");
    if (!debug) return;
    debug.innerText = `Scale: x${scale.toFixed(2)}`;
  }
}