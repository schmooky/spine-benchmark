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
  
    // A method to check if any debug visualization is active
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
  
  // Methods to draw various constraint types
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
  
  debugFlags: DebugFlags = {
    showBones: false,
    showRegionAttachments: false,
    showMeshTriangles: false,
    showMeshHull: false,
    showBoundingBoxes: false,
    showPaths: false,
    showClipping: false,
    showPhysics: false,
    showIkConstraints: false,
    showTransformConstraints: false,
    showPathConstraints: false
  };
  debugRenderer: EnhancedSpineDebugRenderer | null = null;
  currentSpine: Spine | null = null;
  
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
    const view = this.app.canvas;
    
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
          // Always call setDebugFlags to ensure flags are applied
          this.debugRenderer.setDebugFlags(this.debugFlags);
          
          // Check if any debug flags are enabled
          const anyDebugEnabled = Object.values(this.debugFlags).some(flag => flag);
          
          if (anyDebugEnabled) {
            // Only render if any debug flag is enabled
            this.debugRenderer.renderDebug(this.currentSpine);
          } else {
            // If no debug flags are enabled, forcefully clear any existing graphics
            this.clearAllDebugGraphics(this.currentSpine);
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
  
  // Function to forcefully clear all debug graphics
  private clearAllDebugGraphics(spine: Spine): void {
    if (!this.debugRenderer) return;
    
    // Get access to the debug display objects
    const registeredSpines = (this.debugRenderer as any)['registeredSpines'];
    if (!registeredSpines) return;
    
    // Clear base renderer graphics
    const debugObjs = this.debugRenderer['baseRenderer']?.['registeredSpines']?.get(spine);
    if (debugObjs) {
      // Clear all standard debug objects
      if (debugObjs.skeletonXY) debugObjs.skeletonXY.clear();
      if (debugObjs.regionAttachmentsShape) debugObjs.regionAttachmentsShape.clear();
      if (debugObjs.meshTrianglesLine) debugObjs.meshTrianglesLine.clear();
      if (debugObjs.meshHullLine) debugObjs.meshHullLine.clear();
      if (debugObjs.clippingPolygon) debugObjs.clippingPolygon.clear();
      if (debugObjs.boundingBoxesRect) debugObjs.boundingBoxesRect.clear();
      if (debugObjs.boundingBoxesCircle) debugObjs.boundingBoxesCircle.clear();
      if (debugObjs.boundingBoxesPolygon) debugObjs.boundingBoxesPolygon.clear();
      if (debugObjs.pathsCurve) debugObjs.pathsCurve.clear();
      if (debugObjs.pathsLine) debugObjs.pathsLine.clear();
      
      // Remove bone dots
      if (debugObjs.bones && debugObjs.bones.children) {
        while (debugObjs.bones.children.length > 0) {
          const child = debugObjs.bones.children[0];
          debugObjs.bones.removeChild(child);
          if (child.destroy) {
            child.destroy({children: true});
          }
        }
      }
    }
    
    // Clear custom constraint graphics
    const customDebug = registeredSpines.get(spine);
    if (customDebug) {
      if (customDebug.physicsConstraints) customDebug.physicsConstraints.clear();
      if (customDebug.ikConstraints) customDebug.ikConstraints.clear();
      if (customDebug.transformConstraints) customDebug.transformConstraints.clear();
      if (customDebug.pathConstraints) customDebug.pathConstraints.clear();
    }
    
    // Force a render update
    this.app.renderer.render(this.app.stage);
  }
  
  // Set debug flags
  public setDebugFlags(flags: Partial<DebugFlags>): void {
    this.debugFlags = { ...this.debugFlags, ...flags };
    
    if (this.debugRenderer) {
      this.debugRenderer.setDebugFlags(this.debugFlags);
    }
  }
  
  // Get debug flags
  public getDebugFlags(): DebugFlags {
    return { ...this.debugFlags };
  }
  
  // Updated toggle methods that forcefully clear graphics when disabling
  public toggleMeshes(visible?: boolean): void {
    const newValue = visible !== undefined ? visible : !this.debugFlags.showMeshTriangles;
    
    this.debugFlags.showMeshTriangles = newValue;
    this.debugFlags.showMeshHull = newValue;
    this.debugFlags.showRegionAttachments = newValue;
    this.debugFlags.showBoundingBoxes = newValue;
    this.debugFlags.showPaths = newValue;
    this.debugFlags.showClipping = newValue;
    this.debugFlags.showBones = newValue;
    
    if (this.debugRenderer) {
      this.debugRenderer.setDebugFlags(this.debugFlags);
    }
    
    // Force clear graphics if turning off
    if (!newValue && this.currentSpine) {
      this.clearAllDebugGraphics(this.currentSpine);
    }
  }
  
  public togglePhysics(visible?: boolean): void {
    const newValue = visible !== undefined ? visible : !this.debugFlags.showPhysics;
    
    this.debugFlags.showPhysics = newValue;
    this.debugFlags.showTransformConstraints = newValue;
    this.debugFlags.showPathConstraints = newValue;
    
    if (this.debugRenderer) {
      this.debugRenderer.setDebugFlags(this.debugFlags);
    }
    
    // Force clear graphics if turning off
    if (!newValue && this.currentSpine) {
      this.clearAllDebugGraphics(this.currentSpine);
    }
  }
  
  public toggleIkConstraints(visible?: boolean): void {
    const newValue = visible !== undefined ? visible : !this.debugFlags.showIkConstraints;
    
    this.debugFlags.showIkConstraints = newValue;
    
    if (this.debugRenderer) {
      this.debugRenderer.setDebugFlags(this.debugFlags);
    }
    
    // Force clear graphics if turning off
    if (!newValue && this.currentSpine) {
      this.clearAllDebugGraphics(this.currentSpine);
    }
  }
  
  // Force reset debug graphics completely
  public forceResetDebugGraphics(): void {
    if (!this.currentSpine || !this.debugRenderer) return;
    
    // First, try to unregister the spine instance from the debug renderer
    this.debugRenderer.unregisterSpine(this.currentSpine);
    
    // Then create a new debug renderer instance to replace the old one
    this.debugRenderer = new EnhancedSpineDebugRenderer();
    
    // Register the spine instance with the new renderer
    if (this.currentSpine) {
      this.debugRenderer.registerSpine(this.currentSpine);
      this.debugRenderer.setDebugFlags(this.debugFlags);
    }
    
    // Force a render update
    this.app.renderer.render(this.app.stage);
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
    if (this.currentSpine && this.debugRenderer) {
      this.debugRenderer.unregisterSpine(this.currentSpine);
    }
    
    // Call parent destroy method
    super.destroy();
  }
}