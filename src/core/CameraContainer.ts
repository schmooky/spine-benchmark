import { ISpineDebugRenderer, Physics, Spine, SpineDebugRenderer } from "@esotericsoftware/spine-pixi-v8";
import gsap from "gsap";
import { Application, Container, Graphics, Text } from "pixi.js";

// Define debug visualization flags
interface DebugFlags {
  showBones: boolean;
  showRegionAttachments: boolean;
  showMeshTriangles: boolean;
  showMeshHull: boolean;
  showBoundingBoxes: boolean;
  showPaths: boolean;
  showClipping: boolean;
  showPhysics: boolean; // New flag for physics constraints
  showIkConstraints: boolean;
  showTransformConstraints: boolean;
  showPathConstraints: boolean;
}

// Extended SpineDebugRenderer with physics constraints support
class EnhancedSpineDebugRenderer implements ISpineDebugRenderer {
  private readonly baseRenderer: SpineDebugRenderer;
  private readonly registeredSpines: Map<Spine, PhysicsDebugDisplayObjects> = new Map();
  
  private flags: DebugFlags = {
    showBones: true,
    showRegionAttachments: true,
    showMeshTriangles: true,
    showMeshHull: true,
    showBoundingBoxes: true,
    showPaths: true,
    showClipping: true,
    showPhysics: true,
    showIkConstraints: true,
    showTransformConstraints: true,
    showPathConstraints: true
  };

  // Use SpineDebugRenderer for all standard debug rendering
  constructor() {
    this.baseRenderer = new SpineDebugRenderer();
  }
  
  public setDebugFlags(flags: Partial<DebugFlags>): void {
    this.flags = { ...this.flags, ...flags };
    
    // Apply standard flags to base renderer
    this.baseRenderer.drawBones = this.flags.showBones;
    this.baseRenderer.drawRegionAttachments = this.flags.showRegionAttachments;
    this.baseRenderer.drawMeshTriangles = this.flags.showMeshTriangles;
    this.baseRenderer.drawMeshHull = this.flags.showMeshHull;
    this.baseRenderer.drawBoundingBoxes = this.flags.showBoundingBoxes;
    this.baseRenderer.drawPaths = this.flags.showPaths;
    this.baseRenderer.drawClipping = this.flags.showClipping;
  }
  
  public getDebugFlags(): DebugFlags {
    return { ...this.flags };
  }
  
  public registerSpine(spine: Spine): void {
    // Register with the base renderer first
    this.baseRenderer.registerSpine(spine);
    
    // Create our custom physics debug graphics if not already exists
    if (!this.registeredSpines.has(spine)) {
      const parentContainer = new Container();
      spine.addChild(parentContainer);
      
      const physicsConstraints = new Graphics();
      const ikConstraints = new Graphics();
      const transformConstraints = new Graphics();
      const pathConstraints = new Graphics();
      
      parentContainer.addChild(physicsConstraints);
      parentContainer.addChild(ikConstraints);
      parentContainer.addChild(transformConstraints);
      parentContainer.addChild(pathConstraints);
      
      this.registeredSpines.set(spine, {
        physicsConstraints,
        ikConstraints,
        transformConstraints,
        pathConstraints,
        parentContainer
      });
    }
  }
  
  public unregisterSpine(spine: Spine): void {
    // Unregister from base renderer
    this.baseRenderer.unregisterSpine(spine);
    
    // Clean up our custom debug objects
    const debugObjects = this.registeredSpines.get(spine);
    if (debugObjects) {
      spine.removeChild(debugObjects.parentContainer);
      debugObjects.parentContainer.destroy({ children: true });
      this.registeredSpines.delete(spine);
    }
  }
  
    // A new method to check if any debug visualization is active
  private isAnyDebugActive(): boolean {
    return this.flags.showBones || 
           this.flags.showRegionAttachments || 
           this.flags.showMeshTriangles || 
           this.flags.showMeshHull || 
           this.flags.showBoundingBoxes || 
           this.flags.showPaths || 
           this.flags.showClipping ||
           this.flags.showPhysics ||
           this.flags.showIkConstraints ||
           this.flags.showTransformConstraints ||
           this.flags.showPathConstraints;
  }

  public renderDebug(spine: Spine): void {
    // First, always clear all debug graphics
    this.clearAllDebugGraphics(spine);
    
    // If no debug flags are active, we're done - everything is already cleared
    if (!this.isAnyDebugActive()) {
      return;
    }
    
    // Use the base renderer for standard debug rendering
    if (this.flags.showBones || this.flags.showRegionAttachments || 
        this.flags.showMeshTriangles || this.flags.showMeshHull || 
        this.flags.showBoundingBoxes || this.flags.showPaths || 
        this.flags.showClipping) {
      this.baseRenderer.renderDebug(spine);
    }
    
    // Render custom constraint visualizations
    const debugObjects = this.registeredSpines.get(spine);
    if (!debugObjects) return;
    
    // Draw constraints based on flags
    if (this.flags.showPhysics) {
      this.drawPhysicsConstraints(spine, debugObjects);
    }
    
    if (this.flags.showIkConstraints) {
      this.drawIkConstraints(spine, debugObjects);
    }
    
    if (this.flags.showTransformConstraints) {
      this.drawTransformConstraints(spine, debugObjects);
    }
    
    if (this.flags.showPathConstraints) {
      this.drawPathConstraints(spine, debugObjects);
    }
  }
  
  // Helper method to clear all debug graphics
  private clearAllDebugGraphics(spine: Spine): void {
    // Clear base renderer graphics
    const debugDisplayObjects = this.baseRenderer['registeredSpines']?.get(spine);
    if (debugDisplayObjects) {
      // Clear standard debug objects
      if (debugDisplayObjects.skeletonXY) debugDisplayObjects.skeletonXY.clear();
      if (debugDisplayObjects.regionAttachmentsShape) debugDisplayObjects.regionAttachmentsShape.clear();
      if (debugDisplayObjects.meshTrianglesLine) debugDisplayObjects.meshTrianglesLine.clear();
      if (debugDisplayObjects.meshHullLine) debugDisplayObjects.meshHullLine.clear();
      if (debugDisplayObjects.clippingPolygon) debugDisplayObjects.clippingPolygon.clear();
      if (debugDisplayObjects.boundingBoxesRect) debugDisplayObjects.boundingBoxesRect.clear();
      if (debugDisplayObjects.boundingBoxesCircle) debugDisplayObjects.boundingBoxesCircle.clear();
      if (debugDisplayObjects.boundingBoxesPolygon) debugDisplayObjects.boundingBoxesPolygon.clear();
      if (debugDisplayObjects.pathsCurve) debugDisplayObjects.pathsCurve.clear();
      if (debugDisplayObjects.pathsLine) debugDisplayObjects.pathsLine.clear();
      
      // Remove bone dots
      if (debugDisplayObjects.bones) {
        const preserveChildren = [];
        
        // Get our custom graphics to preserve
        const customDebug = this.registeredSpines.get(spine);
        if (customDebug) {
          preserveChildren.push(
            customDebug.physicsConstraints,
            customDebug.ikConstraints,
            customDebug.transformConstraints,
            customDebug.pathConstraints
          );
        }
        
        // Remove all children except our custom graphics
        for (let i = debugDisplayObjects.bones.children.length - 1; i >= 0; i--) {
          const child = debugDisplayObjects.bones.children[i];
          if (!preserveChildren.includes(child)) {
            child.destroy({ children: true });
          }
        }
      }
    }
    
    // Clear custom constraint graphics
    const customDebug = this.registeredSpines.get(spine);
    if (customDebug) {
      customDebug.physicsConstraints.clear();
      customDebug.ikConstraints.clear();
      customDebug.transformConstraints.clear();
      customDebug.pathConstraints.clear();
    }
  }
  
  // New method to draw physics constraints
  private drawPhysicsConstraints(spine: Spine, debugObjects: PhysicsDebugDisplayObjects): void {
    const { physicsConstraints } = debugObjects;
    const physicsConstraintList = spine.skeleton.physicsConstraints;
    
    physicsConstraints.lineStyle(2, 0xFF00FF, 1); // Magenta for physics
    
    for (const constraint of physicsConstraintList) {
      if (!constraint.isActive()) continue;
      
      const bone = constraint.bone;
      const x = bone.worldX;
      const y = bone.worldY;
      
      // Draw a distinctive marker for physics constraints
      // Circle with cross
      physicsConstraints.beginFill(0xFF00FF, 0.3);
      physicsConstraints.drawCircle(x, y, 15);
      physicsConstraints.endFill();
      
      physicsConstraints.moveTo(x - 10, y - 10);
      physicsConstraints.lineTo(x + 10, y + 10);
      physicsConstraints.moveTo(x + 10, y - 10);
      physicsConstraints.lineTo(x - 10, y + 10);
      
      // Add spring visualization
      this.drawSpring(physicsConstraints, x, y, bone.data.length, bone.rotation);
      
      // Show affected properties
      let yOffset = 20;
      // if (constraint.data.x > 0) {
      //   this.drawPropertyIndicator(physicsConstraints, x, y + yOffset, "X");
      //   yOffset += 15;
      // }
      // if (constraint.data.y > 0) {
      //   this.drawPropertyIndicator(physicsConstraints, x, y + yOffset, "Y");
      //   yOffset += 15;
      // }
      // if (constraint.data.rotate > 0) {
      //   this.drawPropertyIndicator(physicsConstraints, x, y + yOffset, "R");
      //   yOffset += 15;
      // }
      // if (constraint.data.scaleX > 0) {
      //   this.drawPropertyIndicator(physicsConstraints, x, y + yOffset, "S");
      // }
    }
  }
  
  // Draw spring symbol to represent physics
  private drawSpring(graphics: Graphics, x: number, y: number, length: number, angle: number): void {
    const radians = angle * Math.PI / 180;
    const dx = length * Math.cos(radians);
    const dy = length * Math.sin(radians);
    
    const springLength = 30;
    const springX = x + (dx * 0.3);
    const springY = y + (dy * 0.3);
    
    // Draw spring coils
    graphics.lineStyle(1.5, 0xFF00FF, 1);
    graphics.moveTo(springX, springY);
    
    const coils = 5;
    const coilWidth = 10;
    const coilSpacing = springLength / coils;
    
    for (let i = 0; i <= coils; i++) {
      const coilX = springX + (i * coilSpacing);
      graphics.lineTo(coilX, springY + ((i % 2 === 0) ? -coilWidth : coilWidth));
    }
  }
  
  // Draw indicators for which properties are affected
  private drawPropertyIndicator(graphics: Graphics, x: number, y: number, property: string): void {
    graphics.beginFill(0xFF00FF);
    graphics.drawCircle(x, y, 7);
    graphics.endFill();
    
    // Create text
    const text = new Text({
      text: property,
      style: {
        fontSize: 10,
        fill: 0xFFFFFF
      }
    });
    
    // Center the text
    text.position.set(x - 3, y - 5);
    graphics.addChild(text);
  }
  
  // Draw IK constraints
  private drawIkConstraints(spine: Spine, debugObjects: PhysicsDebugDisplayObjects): void {
    const { ikConstraints } = debugObjects;
    const ikConstraintList = spine.skeleton.ikConstraints;
    
    ikConstraints.lineStyle(2, 0x00FFFF, 1); // Cyan for IK
    
    for (const constraint of ikConstraintList) {
      if (!constraint.isActive()) continue;
      
      const target = constraint.target;
      const bones = constraint.bones;
      
      // Connect bones in IK chain
      for (let i = 0; i < bones.length - 1; i++) {
        const bone1 = bones[i];
        const bone2 = bones[i + 1];
        
        ikConstraints.moveTo(bone1.worldX, bone1.worldY);
        ikConstraints.lineTo(bone2.worldX, bone2.worldY);
      }
      
      // Draw connection to target
      const lastBone = bones[bones.length - 1];
      ikConstraints.moveTo(lastBone.worldX, lastBone.worldY);
      ikConstraints.lineTo(target.worldX, target.worldY);
      
      // Draw target marker
      ikConstraints.beginFill(0x00FFFF, 0.3);
      ikConstraints.drawCircle(target.worldX, target.worldY, 10);
      ikConstraints.endFill();
      
      ikConstraints.moveTo(target.worldX - 5, target.worldY);
      ikConstraints.lineTo(target.worldX + 5, target.worldY);
      ikConstraints.moveTo(target.worldX, target.worldY - 5);
      ikConstraints.lineTo(target.worldX, target.worldY + 5);
    }
  }
  
  // Draw transform constraints
  private drawTransformConstraints(spine: Spine, debugObjects: PhysicsDebugDisplayObjects): void {
    const { transformConstraints } = debugObjects;
    const transformConstraintList = spine.skeleton.transformConstraints;
    
    transformConstraints.lineStyle(2, 0xFFFF00, 1); // Yellow for transform
    
    for (const constraint of transformConstraintList) {
      if (!constraint.isActive()) continue;
      
      const target = constraint.target;
      const bones = constraint.bones;
      
      // Connect all constrained bones to target
      for (const bone of bones) {
        transformConstraints.moveTo(bone.worldX, bone.worldY);
        transformConstraints.lineTo(target.worldX, target.worldY);
      }
      
      // Draw target marker
      transformConstraints.beginFill(0xFFFF00, 0.3);
      transformConstraints.drawCircle(target.worldX, target.worldY, 10);
      transformConstraints.endFill();
      
      // Draw transform symbol
      transformConstraints.drawRect(target.worldX - 5, target.worldY - 5, 10, 10);
    }
  }
  
  // Draw path constraints
  private drawPathConstraints(spine: Spine, debugObjects: PhysicsDebugDisplayObjects): void {
    const { pathConstraints } = debugObjects;
    const pathConstraintList = spine.skeleton.pathConstraints;
    
    pathConstraints.lineStyle(2, 0x00FF00, 1); // Green for path
    
    for (const constraint of pathConstraintList) {
      if (!constraint.isActive()) continue;
      
      const target = constraint.target;
      const bones = constraint.bones;
      
      // Draw the path control points if available
      if (constraint.world && constraint.world.length > 0) {
        pathConstraints.moveTo(constraint.world[0], constraint.world[1]);
        
        for (let i = 3; i < constraint.world.length; i += 3) {
          const x = constraint.world[i];
          const y = constraint.world[i + 1];
          pathConstraints.lineTo(x, y);
          
          // Draw point markers
          pathConstraints.beginFill(0x00FF00, 0.5);
          pathConstraints.drawCircle(x, y, 4);
          pathConstraints.endFill();
        }
      }
      
      // Connect bones to their positions on the path
      for (const bone of bones) {
        pathConstraints.lineStyle(1, 0x00FF00, 0.5);
        pathConstraints.moveTo(bone.worldX, bone.worldY);
        
        // Find the closest point on the path (simplified)
        if (constraint.world && constraint.world.length > 0) {
          let closestIdx = 0;
          let closestDist = Number.MAX_VALUE;
          
          for (let i = 0; i < constraint.world.length; i += 3) {
            const pathX = constraint.world[i];
            const pathY = constraint.world[i + 1];
            const dist = Math.pow(pathX - bone.worldX, 2) + Math.pow(pathY - bone.worldY, 2);
            
            if (dist < closestDist) {
              closestDist = dist;
              closestIdx = i;
            }
          }
          
          pathConstraints.lineTo(
            constraint.world[closestIdx],
            constraint.world[closestIdx + 1]
          );
        }
      }
      
      // Highlight the target slot
      pathConstraints.lineStyle(2, 0x00FF00, 1);
      pathConstraints.beginFill(0x00FF00, 0.2);
      pathConstraints.drawCircle(target.bone.worldX, target.bone.worldY, 15);
      pathConstraints.endFill();
    }
  }
}

// Additional display objects for physics constraints
interface PhysicsDebugDisplayObjects {
  physicsConstraints: Graphics;
  ikConstraints: Graphics;
  transformConstraints: Graphics;
  pathConstraints: Graphics;
  parentContainer: Container;
}

export class CameraContainer extends Container {
  originalWidth: number;
  originalHeight: number;
  app: Application;
  isDragging: boolean = false;
  lastPosition: { x: number; y: number } | null = null;
  initialPosition: { x: number; y: number } | null = null;
  
  private debugFlags: DebugFlags = {
    showBones: true,
    showRegionAttachments: true,
    showMeshTriangles: true,
    showMeshHull: true,
    showBoundingBoxes: true,
    showPaths: true,
    showClipping: true,
    showPhysics: true,
    showIkConstraints: true,
    showTransformConstraints: true,
    showPathConstraints: true
  };
  private debugRenderer: EnhancedSpineDebugRenderer | null = null;
  private currentSpine: Spine | null = null;
  
  constructor(options: { width: number; height: number; app: Application }) {
    super();
    this.originalWidth = options.width;
    this.originalHeight = options.height;
    this.app = options.app;
    this.debugRenderer = new EnhancedSpineDebugRenderer();
    
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
          // Check if any debug flags are enabled
          const anyDebugEnabled = Object.values(this.debugFlags).some(flag => flag);
          
          if (anyDebugEnabled) {
            this.debugRenderer.setDebugFlags(this.debugFlags);
            this.debugRenderer.renderDebug(this.currentSpine);
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
  
  private setCanvasScaleDebugInfo(scale: number): void {
    // This would be handled by a React component in our new architecture
    const scaleInfo = document.getElementById("scale-info");
    if (scaleInfo) {
      scaleInfo.innerText = `Scale: x${scale.toFixed(2)}`;
    }
  }
  
  // Update debug visibility flags
  public setDebugFlags(flags: Partial<DebugFlags>): void {
    this.debugFlags = { ...this.debugFlags, ...flags };
  }
  
  public getDebugFlags(): DebugFlags {
    return { ...this.debugFlags };
  }
  
  // Toggle individual debug flags
  public toggleBones(visible?: boolean): void {
    this.debugFlags.showBones = visible !== undefined ? visible : !this.debugFlags.showBones;
  }
  
  public toggleMeshes(visible?: boolean): void {
    this.debugFlags.showMeshTriangles = visible !== undefined ? visible : !this.debugFlags.showMeshTriangles;
    this.debugFlags.showMeshHull = visible !== undefined ? visible : !this.debugFlags.showMeshHull;
  }
  
  public togglePhysics(visible?: boolean): void {
    this.debugFlags.showPhysics = visible !== undefined ? visible : !this.debugFlags.showPhysics;
  }
  
  public toggleIkConstraints(visible?: boolean): void {
    this.debugFlags.showIkConstraints = visible !== undefined ? visible : !this.debugFlags.showIkConstraints;
  }
  
  public toggleTransformConstraints(visible?: boolean): void {
    this.debugFlags.showTransformConstraints = visible !== undefined ? visible : !this.debugFlags.showTransformConstraints;
  }
  
  public togglePathConstraints(visible?: boolean): void {
    this.debugFlags.showPathConstraints = visible !== undefined ? visible : !this.debugFlags.showPathConstraints;
  }
  
  // Backwards compatibility - matches original implementation
  public setMeshVisibility(isVisible: boolean): void {
    this.debugFlags.showBones = isVisible;
    this.debugFlags.showMeshTriangles = isVisible;
    this.debugFlags.showMeshHull = isVisible;
    this.debugFlags.showRegionAttachments = isVisible;
    this.debugFlags.showBoundingBoxes = isVisible;
    this.debugFlags.showPaths = isVisible;
    this.debugFlags.showClipping = isVisible;
  }
  
  public getMeshVisibility(): boolean {
    return this.debugFlags.showMeshTriangles && this.debugFlags.showMeshHull;
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
  
  // Run physics simulation
  public runPhysicsSimulation(duration: number = 1): void {
    if (!this.currentSpine) return;
    
    // Save current spine time
    const originalTime = this.currentSpine.skeleton.time;
    
    // Set up physics simulation interval
    const fps = 60;
    const totalFrames = duration * fps;
    let currentFrame = 0;
    
    const intervalId = setInterval(() => {
      if (!this.currentSpine) {
        clearInterval(intervalId);
        return;
      }
      
      // Update spine with small time increment
      this.currentSpine.update(1/fps);
      
      // Force physics update
      this.currentSpine.skeleton.updateWorldTransform(Physics.update);
      
      currentFrame++;
      if (currentFrame >= totalFrames) {
        clearInterval(intervalId);
      }
    }, 1000/fps);
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