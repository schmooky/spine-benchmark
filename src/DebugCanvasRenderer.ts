import { Application, Container, DisplayObject, ICanvas, IRenderer, Renderer, UPDATE_PRIORITY } from "pixi.js";
  export class DebugCanvasRenderer {
    private canvas: HTMLCanvasElement;
    private renderer: Renderer;
    private targetStage: Container;
    private width: number;
    private height: number;
    private app: Application;
    private isRendering: boolean = true;
    private intersectionObserver: IntersectionObserver;
  
    constructor(app: Application, target: Container, containerId: string) {
      this.app = app;
      this.targetStage = target;
      this.width = 400;
      this.height = 400;
  
      // Create canvas
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      document.getElementById(containerId)?.appendChild(this.canvas);
      
      // Create renderer with shared context
      this.renderer = new Renderer({
        width: this.width,
        height: this.height,
        view: this.canvas,
        // Use shared context from main application
        // context: (this.app.renderer as any).context?.gl ||
        // (this.app.renderer as any).gl ||
        // (this.app.renderer as any).view.getContext('webgl'),
        // Important settings for context sharing
        // shared: true,
        antialias: false, // Disable if not needed
        
      });
  
      // Setup intersection observer
      this.setupVisibilityObserver();
      // Setup render loop
      this.setupRenderLoop();
    }
  
    private setupVisibilityObserver(): void {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            this.isRendering = entry.isIntersecting;
            
            if (!this.isRendering) {
              // Clear the canvas when it becomes invisible
              this.renderer.clear();
            }
          });
        },
        {
          root: null,
          rootMargin: '0px',
          threshold: 0.0 // Trigger as soon as even 1px is visible
        }
      );
  
      this.intersectionObserver.observe(this.canvas);
    }
  
    private setupRenderLoop(): void {
      const renderContainer = new Container();
  
      this.app.ticker.add(() => {
        if (!this.isRendering) return;
  
        // Performance optimization: Skip if canvas is not visible
        if (!this.isCanvasVisible()) return;
  
        // Clear previous content
        renderContainer.removeChildren();
        
        const prev = this.targetStage.parent;
        const prevPos = this.targetStage.parent.getChildIndex(this.targetStage)
        
        // Add clone to our render container
        renderContainer.addChild(this.targetStage);
        
        // Center the container in this canvas view
        renderContainer.x = this.width / 2;
        renderContainer.y = this.height / 2;
        this.renderer.reset();
        // Render the centered view
        this.renderer.render(renderContainer);

        prev.addChildAt(this.targetStage,prevPos)
      }, undefined, UPDATE_PRIORITY.HIGH);
    }
  
    private isCanvasVisible(): boolean {
      const rect = this.canvas.getBoundingClientRect();
      return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
      );
    }
  
    private cloneDisplayObject(original: DisplayObject): DisplayObject {
      const clone = new Container();
      
      clone.transform.position.copyFrom(original.position);
      clone.transform.scale.copyFrom(original.scale);
      clone.transform.rotation = original.rotation;
      clone.pivot.copyFrom(original.pivot);
      
      if (original instanceof Container) {
        original.children.forEach(child => {
          const childClone = this.cloneDisplayObject(child);
          clone.addChild(childClone);
        });
      }
      
      return clone;
    }
  
    public destroy(): void {
      this.intersectionObserver.unobserve(this.canvas);
      this.intersectionObserver.disconnect();
      this.renderer.destroy();
      this.canvas.remove();
    }
  }
  
