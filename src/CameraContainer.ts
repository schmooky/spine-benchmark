import gsap from "gsap";
import { Application, Container, DisplayObject } from "pixi.js";
import { SpineMeshOutline } from "./Outline";
import { Spine } from "@esotericsoftware/spine-pixi-v8";

export class CameraContainer extends Container {
  originalWidth: any;
  originalHeight: any;
  app: Application;
  isDragging: boolean = false;
  lastPosition: { x: number; y: number } | null = null;
  initialPosition: { x: number; y: number } | null = null;
  
  meshOutline: SpineMeshOutline | null = null;
  
  
  
  private isMeshVisible: boolean = false;
  private onMeshVisibilityChange?: (isVisible: boolean) => void;
  
  
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
  
  
  // Add this method to set the callback
  public setMeshVisibilityCallback(callback: (isVisible: boolean) => void) {
    this.onMeshVisibilityChange = callback;
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
    
    // Create separator
    const separator = document.createElement('div');
    separator.style.height = '1px';
    separator.style.backgroundColor = '#ccc';
    separator.style.margin = '5px 0';
    
    // Create Show Mesh toggle button
    const meshToggleContainer = document.createElement('div');
    meshToggleContainer.style.padding = '5px 10px';
    meshToggleContainer.style.cursor = 'pointer';
    meshToggleContainer.style.userSelect = 'none';
    meshToggleContainer.style.display = 'flex';
    meshToggleContainer.style.alignItems = 'center';
    meshToggleContainer.style.gap = '8px';
    
    const checkbox = document.createElement('div');
    checkbox.style.width = '14px';
    checkbox.style.height = '14px';
    checkbox.style.border = '2px solid #666';
    checkbox.style.display = 'flex';
    checkbox.style.alignItems = 'center';
    checkbox.style.justifyContent = 'center';
    
    const checkmark = document.createElement('div');
    checkmark.style.width = '8px';
    checkmark.style.height = '8px';
    checkmark.style.backgroundColor = '#666';
    checkmark.style.display = this.isMeshVisible ? 'block' : 'none';
    
    const label = document.createElement('span');
    label.innerText = 'Show Mesh';
    
    checkbox.appendChild(checkmark);
    meshToggleContainer.appendChild(checkbox);
    meshToggleContainer.appendChild(label);
    
    meshToggleContainer.addEventListener('mouseenter', () => {
      meshToggleContainer.style.backgroundColor = '#f0f0f0';
    });
    
    meshToggleContainer.addEventListener('mouseleave', () => {
      meshToggleContainer.style.backgroundColor = 'transparent';
    });
    
    meshToggleContainer.addEventListener('click', () => {
      this.isMeshVisible = !this.isMeshVisible;
      checkmark.style.display = this.isMeshVisible ? 'block' : 'none';
      
      // Call the callback if it exists
      if (this.onMeshVisibilityChange) {
        this.onMeshVisibilityChange(this.isMeshVisible);
      }
    });
    
    // Add all elements to context menu
    this.contextMenu.appendChild(centerButton);
    this.contextMenu.appendChild(separator);
    this.contextMenu.appendChild(meshToggleContainer);
    
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
    console.log(`Looking at: `, object)
    // this.meshOutline = new SpineMeshOutline(this.app,object);
    // this.meshOutline.graphics.visible = this.isMeshVisible;
    // this.setMeshVisibilityCallback((value: boolean)=> {
    //   if(!this.meshOutline) return;
    //   this.meshOutline.graphics.visible = value;
    // })


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
  
  // Add getter for mesh visibility state
  public getMeshVisibility(): boolean {
    return this.isMeshVisible;
  }
  
  // Add setter for mesh visibility state
  public setMeshVisibility(isVisible: boolean) {
    this.isMeshVisible = isVisible;
    // Update checkbox visual if context menu exists
    const checkmark = this.contextMenu.querySelector('div > div > div') as HTMLDivElement;
    if (checkmark) {
      checkmark.style.display = isVisible ? 'block' : 'none';
    }
    // Call the callback if it exists
    if (this.onMeshVisibilityChange) {
      this.onMeshVisibilityChange(isVisible);
    }
  }
}