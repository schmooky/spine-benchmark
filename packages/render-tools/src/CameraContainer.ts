import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { RegionAttachment, MeshAttachment } from "@esotericsoftware/spine-core";
import gsap from "gsap";
import { Application, Container, Graphics } from "pixi.js";
import { DebugFlags } from './debug/DebugFlagsManager.js';
import { DebugRendererManager } from './debug/DebugRendererManager.js';

const HIGHLIGHT_BOX_COLOR = 0x60A5FA;
const HIGHLIGHT_BOX_ALPHA = 0.9;
const HIGHLIGHT_BOX_WIDTH = 2;
const HIGHLIGHT_MESH_COLOR = 0x2DD4A8;
const HIGHLIGHT_MESH_ALPHA = 0.92;
const HIGHLIGHT_MESH_WIDTH = 1.8;

export class CameraContainer extends Container {
  originalWidth: number;
  originalHeight: number;
  app: Application;
  isDragging = false;
  lastPosition: { x: number; y: number } | null = null;

  private debugRenderer: DebugRendererManager;
  private currentSpine: Spine | null = null;
  private debugContainer: Container;
  private slotHighlightGraphics: Graphics;
  private highlightedSlotIndex: number | null = null;
  private canvasView: HTMLCanvasElement | null = null;
  private isDisposed = false;
  private readonly tickerUpdate = () => {
    if (this.isDisposed || !this.currentSpine) return;
    this.debugRenderer.update();
    this.updateSlotHighlight();
  };
  private readonly handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || this.isDisposed || !this.canvasView) return;
    this.isDragging = true;
    this.lastPosition = { x: e.clientX, y: e.clientY };
    this.canvasView.style.cursor = "grabbing";
  };
  private readonly handleMouseMove = (e: MouseEvent) => {
    if (this.isDisposed || !this.isDragging || !this.lastPosition) return;
    const dx = e.clientX - this.lastPosition.x;
    const dy = e.clientY - this.lastPosition.y;
    this.x += dx;
    this.y += dy;
    this.lastPosition = { x: e.clientX, y: e.clientY };
  };
  private readonly handleMouseUp = (e: MouseEvent) => {
    if (e.button !== 0 || this.isDisposed || !this.canvasView) return;
    this.isDragging = false;
    this.lastPosition = null;
    this.canvasView.style.cursor = "default";
  };
  private readonly handleWheel = (e: WheelEvent) => {
    if (this.isDisposed) return;
    e.preventDefault();
    const scrollDirection = Math.sign(e.deltaY);
    const minScale = 0.2;
    const maxScale = 10;
    const scaleStep = 0.1;

    let newScale = this.scale.x - scrollDirection * scaleStep;
    newScale = Math.max(minScale, Math.min(maxScale, newScale));
    newScale = Number((Math.ceil(newScale * 20) / 20).toFixed(2));

    this.scale.set(newScale);
    this.setCanvasScaleDebugInfo(newScale);
  };

  constructor(options: { width: number; height: number; app: Application }) {
    super();
    this.originalWidth = options.width;
    this.originalHeight = options.height;
    this.app = options.app;

    // Create debug renderer
    this.debugRenderer = new DebugRendererManager(this.app);

    // Create a container for debug graphics that will be added to the spine
    this.debugContainer = new Container();

    // Create slot highlight overlay
    this.slotHighlightGraphics = new Graphics();

    this.setupEventListeners();

    // Center initially
    this.x = this.app.renderer.width / 2;
    this.y = this.app.renderer.height / 2;

    // Resize
    this.onResize = this.onResize.bind(this);
    window.addEventListener("resize", this.onResize);

    // Set up ticker for debug updates
    this.app.ticker.add(this.tickerUpdate);
  }

  private setupEventListeners(): void {
    const view = this.app.canvas as HTMLCanvasElement | undefined;
    if (!view) return;
    this.canvasView = view;
    this.canvasView.addEventListener("mousedown", this.handleMouseDown);
    window.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("mouseup", this.handleMouseUp);
    this.canvasView.addEventListener("wheel", this.handleWheel, { passive: false });
  }

  private removeEventListeners(): void {
    if (this.canvasView) {
      this.canvasView.removeEventListener("mousedown", this.handleMouseDown);
      this.canvasView.removeEventListener("wheel", this.handleWheel);
      this.canvasView.style.cursor = "default";
      this.canvasView = null;
    }
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("mouseup", this.handleMouseUp);
  }

  public onResize(): void {
    this.x = this.app.renderer.width / 2;
    this.y = this.app.renderer.height / 2;
  }

  public lookAtChild(spine: Spine): void {
    this.currentSpine = spine;
    
    // Remove debug container from previous spine if exists
    const existingParent = this.debugRenderer.getContainer().parent;
    if (existingParent) {
      existingParent.removeChild(this.debugRenderer.getContainer());
    }
    
    // Remove slot highlight from previous parent
    if (this.slotHighlightGraphics.parent) {
      this.slotHighlightGraphics.parent.removeChild(this.slotHighlightGraphics);
    }

    // Add debug container AFTER the spine to ensure it renders on top
    if (this.currentSpine) {
      // Get the index of the spine in this container
      const spineIndex = this.getChildIndex(this.currentSpine);
      // Add debug container right after the spine
      this.addChildAt(this.debugRenderer.getContainer(), spineIndex + 1);
      this.debugRenderer.setSpine(this.currentSpine);
      // Add slot highlight on top of everything
      this.addChild(this.slotHighlightGraphics);
    }

    // Fit & center view around the spine
    const padding = 20;
    let bounds = spine.getBounds();
    if (bounds.width === 0 || bounds.height === 0) {
      // fallback to data size halves if bounds unavailable
      bounds.width = spine.skeleton.data.width / 2;
      bounds.height = spine.skeleton.data.height / 2;
    }

    const scaleX = (this.app.screen.width - padding * 2) / bounds.width;
    const scaleY = (this.app.screen.height - padding * 2) / bounds.height;
    let scale = Math.min(scaleX, scaleY);

    spine.scale.set(1);

    const x = this.app.screen.width / 2;
    const y = this.app.screen.height / 2;

    gsap.to(this, { x, y, duration: 1, ease: "power2.out" });

    scale = Number((Math.ceil(scale * 20) / 20).toFixed(2));
    this.scale.set(scale);
    this.setCanvasScaleDebugInfo(scale);
  }

  public clearSpine(): void {
    this.currentSpine = null;
    this.debugRenderer.setSpine(null);

    const debugParent = this.debugRenderer.getContainer().parent;
    if (debugParent) {
      debugParent.removeChild(this.debugRenderer.getContainer());
    }

    if (this.slotHighlightGraphics.parent) {
      this.slotHighlightGraphics.parent.removeChild(this.slotHighlightGraphics);
    }

    if (!this.slotHighlightGraphics.destroyed) {
      this.slotHighlightGraphics.clear();
    }
    this.highlightedSlotIndex = null;

    for (let i = this.children.length - 1; i >= 0; i -= 1) {
      const child = this.children[i];
      if (child instanceof Spine) {
        this.removeChild(child);
      }
    }
  }

  private setCanvasScaleDebugInfo(scale: number): void {
    const el = document.getElementById("scale-info");
    if (el) el.innerText = `Scale: x${scale.toFixed(2)}`;
  }

  public setDebugFlags(flags: Partial<DebugFlags>): void {
    this.debugRenderer.setDebugFlags(flags);
  }

  public getDebugFlags(): DebugFlags {
    return this.debugRenderer.getDebugFlags();
  }

  public toggleMeshes(visible?: boolean): void {
    const newValue = visible ?? !this.debugRenderer.getDebugFlags().showMeshTriangles;
    this.debugRenderer.setDebugFlags({
      showMeshTriangles: newValue,
      showMeshHull: newValue,
      showRegionAttachments: newValue
    });
  }

  public togglePhysics(visible?: boolean): void {
    const newValue = visible ?? !this.debugRenderer.getDebugFlags().showPhysics;
    this.debugRenderer.setDebugFlags({ showPhysics: newValue });
  }

  public toggleIkConstraints(visible?: boolean): void {
    this.debugRenderer.toggleIkConstraints(visible);
  }

  public setHighlightedMeshSlot(slotName: string | null): void {
    this.debugRenderer.setHighlightedMeshSlot(slotName);
  }

  public setSlotHighlight(slotIndex: number | null): void {
    this.highlightedSlotIndex = slotIndex;
    if (slotIndex === null && !this.slotHighlightGraphics.destroyed) {
      this.slotHighlightGraphics.clear();
    }
  }

  private updateSlotHighlight(): void {
    if (this.slotHighlightGraphics.destroyed) return;
    this.slotHighlightGraphics.clear();
    if (this.highlightedSlotIndex === null || !this.currentSpine) return;

    const skeleton = this.currentSpine.skeleton;
    const slot = skeleton.drawOrder[this.highlightedSlotIndex];
    if (!slot) return;

    const attachment = slot.getAttachment();
    if (!attachment) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    if (attachment instanceof RegionAttachment) {
      const verts = new Float32Array(8);
      attachment.computeWorldVertices(slot, verts, 0, 2);
      for (let i = 0; i < 8; i += 2) {
        const x = verts[i], y = verts[i + 1];
        if (!isFinite(x) || !isFinite(y)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    } else if (attachment instanceof MeshAttachment) {
      const len = attachment.worldVerticesLength;
      if (len === 0) return;
      const verts = new Float32Array(len);
      attachment.computeWorldVertices(slot, 0, len, verts, 0, 2);
      for (let i = 0; i < len; i += 2) {
        const x = verts[i], y = verts[i + 1];
        if (!isFinite(x) || !isFinite(y)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }

      // For mesh attachments, show actual mesh triangulation instead of a plain box.
      const triangles = attachment.triangles;
      let drawnTriangles = 0;
      if (triangles && triangles.length >= 3) {
        this.slotHighlightGraphics
          .stroke({ width: HIGHLIGHT_MESH_WIDTH, color: HIGHLIGHT_MESH_COLOR, alpha: HIGHLIGHT_MESH_ALPHA, pixelLine: true });

        for (let i = 0; i + 2 < triangles.length; i += 3) {
          const a = triangles[i] * 2;
          const b = triangles[i + 1] * 2;
          const c = triangles[i + 2] * 2;
          if (a + 1 >= verts.length || b + 1 >= verts.length || c + 1 >= verts.length) continue;

          const ax = verts[a], ay = verts[a + 1];
          const bx = verts[b], by = verts[b + 1];
          const cx = verts[c], cy = verts[c + 1];
          if (!isFinite(ax) || !isFinite(ay) || !isFinite(bx) || !isFinite(by) || !isFinite(cx) || !isFinite(cy)) continue;

          this.slotHighlightGraphics
            .moveTo(ax, ay)
            .lineTo(bx, by)
            .lineTo(cx, cy)
            .lineTo(ax, ay);
          drawnTriangles++;
        }
      }

      if (drawnTriangles > 0) {
        return;
      }
    } else {
      return;
    }

    if (!isFinite(minX) || !isFinite(minY)) return;

    const pad = 4;
    this.slotHighlightGraphics
      .rect(minX - pad, minY - pad, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2)
      .stroke({ width: HIGHLIGHT_BOX_WIDTH, color: HIGHLIGHT_BOX_COLOR, alpha: HIGHLIGHT_BOX_ALPHA, pixelLine: true });
  }

  public forceResetDebugGraphics(): void {
    if (this.isDisposed) return;
    this.debugRenderer.clearAll();
    if (this.currentSpine) {
      this.debugRenderer.update();
    }
  }

  public centerViewport(): void {
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    gsap.to(this, { x: w / 2, y: h / 2, duration: 0.5, ease: "power2.out" });
  }

  public override destroy(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    window.removeEventListener("resize", this.onResize);
    this.removeEventListeners();
    this.app.ticker.remove(this.tickerUpdate);
    this.currentSpine = null;
    this.debugRenderer.setSpine(null);
    gsap.killTweensOf(this);
    const existingParent = this.debugRenderer.getContainer().parent;
    if (existingParent) {
      existingParent.removeChild(this.debugRenderer.getContainer());
    }
    if (!this.slotHighlightGraphics.destroyed) {
      this.slotHighlightGraphics.destroy();
    }
    this.debugRenderer.destroy();
    super.destroy();
  }
}
