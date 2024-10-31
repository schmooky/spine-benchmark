import gsap from "gsap";
import { Application, Container, DisplayObject } from "pixi.js";
import { SpineMeshOutline } from "./Outline";
import { Spine } from "@pixi-spine/all-4.1";

export class CameraContainer extends Container {
  originalWidth: any;
  originalHeight: any;
  app: Application;
  isDragging: boolean = false;
  lastPosition: { x: number; y: number } | null = null;
  initialPosition: { x: number; y: number } | null = null;
  //@ts-ignore
  contextMenu: HTMLDivElement;
  
  constructor(options: { width: number; height: number; app: Application }) {
    super();
    this.originalWidth = options.width;
    this.originalHeight = options.height;
    this.app = options.app;
    
    // Initialize context menu
    this.createContextMenu();
    
    // Setup event listeners
    this.setupEventListeners();
    
    window.addEventListener('resize', () => this.onResize());
  }
  
  private createContextMenu() {
    // Create context menu element
    this.contextMenu = document.createElement('div');
    this.contextMenu.style.position = 'fixed';
    this.contextMenu.style.display = 'none';
    this.contextMenu.style.backgroundColor = 'white';
    this.contextMenu.style.border = '1px solid #ccc';
    this.contextMenu.style.padding = '5px';
    this.contextMenu.style.boxShadow = '2px 2px 5px rgba(0,0,0,0.2)';
    this.contextMenu.style.zIndex = '1000';
    
    // Create Center Viewport button
    const centerButton = document.createElement('div');
    centerButton.innerText = 'Center Viewport';
    centerButton.style.padding = '5px 10px';
    centerButton.style.cursor = 'pointer';
    centerButton.style.userSelect = 'none';
    
    centerButton.addEventListener('mouseenter', () => {
      centerButton.style.backgroundColor = '#f0f0f0';
    });
    
    centerButton.addEventListener('mouseleave', () => {
      centerButton.style.backgroundColor = 'transparent';
    });
    
    centerButton.addEventListener('click', () => {
      this.centerViewport();
      this.hideContextMenu();
    });
    
    this.contextMenu.appendChild(centerButton);
    document.body.appendChild(this.contextMenu);
  }
  
  private setupEventListeners() {
    const view = document.getElementById('leftPanel')!;
    
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
    
    // Context menu event
    view.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      this.showContextMenu(e.clientX, e.clientY);
    });
    
    // Hide context menu when clicking outside
    window.addEventListener('click', (e: MouseEvent) => {
      if (!this.contextMenu.contains(e.target as Node)) {
        this.hideContextMenu();
      }
    });
  }
  
  private showContextMenu(x: number, y: number) {
    this.contextMenu.style.display = 'block';
    this.contextMenu.style.left = `${x}px`;
    this.contextMenu.style.top = `${y}px`;
  }
  
  private hideContextMenu() {
    this.contextMenu.style.display = 'none';
  }
  
  private centerViewport() {
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    
    gsap.to(this, {
      x: w / 2,
      y: h / 2,
      duration: 0.5,
      ease: "power2.out",
    });
  }
  
  onResize() {
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    
    this.x = w / 2;
    this.y = h / 2;
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

  public destroy() {
    // Remove event listeners
    window.removeEventListener('resize', this.onResize);
    
    // Remove context menu from DOM
    if (this.contextMenu && this.contextMenu.parentNode) {
      this.contextMenu.parentNode.removeChild(this.contextMenu);
    }
    
    // Call parent destroy method
    super.destroy();
  }
}