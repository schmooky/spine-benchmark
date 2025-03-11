import { Application, Container } from "pixi.js";
import { Spine, SpineDebugRenderer } from "@esotericsoftware/spine-pixi-v8";
import gsap from "gsap";

export class CameraContainer extends Container {
  originalWidth: number;
  originalHeight: number;
  app: Application;
  isDragging: boolean = false;
  lastPosition: { x: number; y: number } | null = null;
  initialPosition: { x: number; y: number } | null = null;
  
  private isMeshVisible: boolean = false;
  private debugRenderer: SpineDebugRenderer | null = null;
  private currentSpine: Spine | null = null;
  
  constructor(options: { width: number; height: number; app: Application }) {
    super();
    this.originalWidth = options.width;
    this.originalHeight = options.height;
    this.app = options.app;
    this.debugRenderer = new SpineDebugRenderer();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Center the container initially
    this.x = this.app.renderer.width / 2;
    this.y = this.app.renderer.height / 2;
    
    // Listen for resize events
    window.addEventListener('resize', this.onResize.bind(this));
  }
  
  private setupEventListeners(): void {
    const view = this.app.view;
    
    if (!view) return;
    
    // Mouse down event for panning
    view.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 0) { // Left mouse button
        this.isDragging = true;
        this.lastPosition = { x: e.clientX, y: e.clientY };
        view.style.cursor = 'grabbing';
      }
    });
    
    // Mouse move event for panning
    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (this.isDragging && this.lastPosition) {
        const dx = e.clientX - this.lastPosition.x;
        const dy = e.clientY - this.lastPosition.y;
        
        this.x += dx;
        this.y += dy;
        
        this.lastPosition = { x: e.clientX, y: e.clientY };
      }
    });
    
    // Mouse up event to stop panning
    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button === 0) { // Left mouse button
        this.isDragging = false;
        this.lastPosition = null;
        view.style.cursor = 'default';
      }
    });
    
    // Mouse wheel event for zooming
    view.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      
      // Determine scroll direction
      const scrollDirection = Math.sign(e.deltaY);
      
      // Calculate new scale
      const minScale = 0.2;
      const maxScale = 10;
      const scaleStep = 0.1;
      
      let newScale = this.scale.x - scrollDirection * scaleStep;
      newScale = Math.max(minScale, Math.min(maxScale, newScale));
      newScale = Number((Math.ceil(newScale * 20) / 20).toFixed(2));
      
      // Apply the new scale
      this.scale.set(newScale);
      
      // Update scale info if needed
      this.setCanvasScaleDebugInfo(newScale);
    });
  }
  
  public onResize(): void {
    // Center the container on resize
    this.x = this.app.renderer.width / 2;
    this.y = this.app.renderer.height / 2;
  }
  
  public lookAtChild(spine: Spine): void {
    this.currentSpine = spine;
    
    // Register spine with debug renderer
    if (this.debugRenderer) {
      this.debugRenderer.registerSpine(spine);
      
      // Add ticker for debug rendering
      this.app.ticker.add(() => {
        if (this.currentSpine && this.debugRenderer) {
          if (this.isMeshVisible) {
            this.debugRenderer.renderDebug(this.currentSpine);
          } else {
            this.clearDebugRendering();
          }
        }
      });
    }
    
    // Calculate padding
    const padding = 20;
    
    // Get the bounds of the object in global space
    let bounds = spine.getBounds();
    if (bounds.width === 0 || bounds.height === 0) {
      bounds.width = spine.skeleton.data.width / 2;
      bounds.height = spine.skeleton.data.height / 2;
    }
    
    // Calculate the scale needed to fit the object within the screen
    const scaleX = (this.app.screen.width - padding * 2) / bounds.width;
    const scaleY = (this.app.screen.height - padding * 2) / bounds.height;
    let scale = Math.min(scaleX, scaleY);
    
    // Set spine scale
    spine.scale.set(1);
    
    // Calculate the position to center the object
    const x = this.app.screen.width / 2;
    const y = this.app.screen.height / 2;
    
    // Animate the camera to look at the object
    gsap.to(this, {
      x,
      y,
      duration: 1,
      ease: "power2.out",
    });
    
    // Round the scale for cleaner display
    scale = Number((Math.ceil(scale * 20) / 20).toFixed(2));
    this.scale.set(scale);
    this.setCanvasScaleDebugInfo(scale);
  }
  
  private clearDebugRendering(): void {
    if (!this.debugRenderer || !this.currentSpine) return;
    
    const debugDisplayObjects = this.debugRenderer['registeredSpines'].get(this.currentSpine);
    if (!debugDisplayObjects) return;
    
    debugDisplayObjects.skeletonXY.clear();
    debugDisplayObjects.regionAttachmentsShape.clear();
    debugDisplayObjects.meshTrianglesLine.clear();
    debugDisplayObjects.meshHullLine.clear();
    debugDisplayObjects.clippingPolygon.clear();
    debugDisplayObjects.boundingBoxesRect.clear();
    debugDisplayObjects.boundingBoxesCircle.clear();
    debugDisplayObjects.boundingBoxesPolygon.clear();
    debugDisplayObjects.pathsCurve.clear();
    debugDisplayObjects.pathsLine.clear();
    
    for (let len = debugDisplayObjects.bones.children.length; len > 0; len--) {
      debugDisplayObjects.bones.children[len - 1].destroy({ children: true });
    }
  }
  
  private setCanvasScaleDebugInfo(scale: number): void {
    // This would be handled by a React component in our new architecture
    const scaleInfo = document.getElementById("scale-info");
    if (scaleInfo) {
      scaleInfo.innerText = `Scale: x${scale.toFixed(2)}`;
    }
  }
  
  public setMeshVisibility(isVisible: boolean): void {
    this.isMeshVisible = isVisible;
  }
  
  public getMeshVisibility(): boolean {
    return this.isMeshVisible;
  }
  
  // Center the view
  public centerViewport(): void {
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    
    gsap.to(this, {
      x: w / 2,
      y: h / 2,
      duration: 0.5,
      ease: "power2.out",
    });
  }
  
  public override destroy(): void {
    // Remove event listeners
    window.removeEventListener('resize', this.onResize);
    
    // Cleanup ticker
    this.app.ticker.remove(() => {
      if (this.currentSpine && this.debugRenderer) {
        this.debugRenderer.renderDebug(this.currentSpine);
      }
    });
    
    // Call parent destroy method
    super.destroy();
  }
}