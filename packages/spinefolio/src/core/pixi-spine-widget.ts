/**
 * PixiJS v8 + spine-pixi-v8 Widget Implementation
 * 
 * This is the new implementation using PixiJS v8 and @esotericsoftware/spine-pixi-v8
 * for rendering Spine animations.
 */

import 'pixi.js/basis';
import 'pixi.js/ktx2';
import { Application, Assets, Container, Graphics } from 'pixi.js';
import { MeshAttachment, RegionAttachment, Spine } from '@esotericsoftware/spine-pixi-v8';
import type { SpineWidgetOptions } from '../types/spine';

type SpineAttachmentLike = {
  name: string;
};

type SpineSlotLike = {
  getAttachment(): SpineAttachmentLike | null;
};

/**
 * PixiJS-based Spine widget for rendering Spine animations
 * 
 * @example
 * ```typescript
 * const widget = new PixiSpineWidget(element, {
 *   skeleton: 'path/to/skeleton.skel',
 *   atlas: 'path/to/atlas.atlas',
 *   animation: 'idle',
 *   loop: true
 * });
 * ```
 */
export class PixiSpineWidget {
  private app: Application | null = null;
  private spine: Spine | null = null;
  private cameraContainer: Container | null = null;
  private panContainer: Container | null = null;
  private isDestroyed = false;
  private currentAnimation: string | null = null;
  private animationSpeed = 1;
  private isPausedState = false;
  private loadingPromise: Promise<void> | null = null;
  private controlsPanel: HTMLElement | null = null;
  private controlsVisible = false;
  private skeletonAlias: string;
  private atlasAlias: string;
  private readonly instanceId: string;

  // Pan & Zoom state
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private lastPan = { x: 0, y: 0 };
  private currentZoom = 1;
  private targetZoom = 1;
  private initialScale = 1;
  private touchPoints = new Map<number, { x: number; y: number }>();
  private lastPinchDistance = 0;
  private resizeObserver: ResizeObserver | null = null;
  
  // Easing state for smooth animations
  private targetPan = { x: 0, y: 0 };
  private currentPanSmooth = { x: 0, y: 0 };
  private easingSpeed = 0.15; // Controls how fast easing happens (0-1, higher = faster)
  
  // Attachment-level debug overlays
  private highlightAttachmentName: string | null = null;
  private highlightAttachmentColor = 0xff4d4f;
  private highlightAttachmentLineWidth = 2;
  private highlightAttachmentGraphics: Graphics | null = null;

  private debugMeshAttachmentName: string | null = null;
  private debugMeshAttachmentColor = 0x2dd4ff;
  private debugMeshAttachmentLineWidth = 2;
  private debugMeshAttachmentGraphics: Graphics | null = null;

  readonly element: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly options: SpineWidgetOptions & {
    loop: boolean;
    scale: number;
    x: number;
    y: number;
    nextAnimation?: string;
    nextAnimationLoop: boolean;
    premultipliedAlpha: boolean;
    fitToContainer: boolean;
    backgroundColor: string;
    showControls: boolean;
    controlsPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    allowSkinChange: boolean;
    enablePan: boolean;
    enableZoom: boolean;
    minZoom: number;
    maxZoom: number;
    zoomSpeed: number;
    highlightAttachmentBounds?: string;
    highlightAttachmentBoundsColor: number;
    highlightAttachmentBoundsLineWidth: number;
    debugMeshAttachment?: string;
    debugMeshAttachmentColor: number;
    debugMeshAttachmentLineWidth: number;
  };

  /**
   * Creates a new PixiSpineWidget instance
   * 
   * @param element - The HTML element to render into
   * @param options - Configuration options for the widget
   */
  constructor(element: HTMLElement, options: SpineWidgetOptions) {
    this.element = element;
    
    // Ensure the element has relative positioning for absolute positioning of controls
    if (getComputedStyle(this.element).position === 'static') {
      this.element.style.position = 'relative';
    }
    
    // Generate unique instance ID and asset aliases
    this.instanceId = `spine_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.skeletonAlias = `skeleton_${this.instanceId}`;
    this.atlasAlias = `atlas_${this.instanceId}`;
    
    // Set default options
    this.options = {
      skeleton: options.skeleton,
      atlas: options.atlas,
      images: options.images,
      animation: options.animation,
      nextAnimation: options.nextAnimation,
      nextAnimationLoop: options.nextAnimationLoop ?? true,
      skin: options.skin,
      loop: options.loop ?? true,
      scale: options.scale ?? 1,
      x: options.x ?? 0,
      y: options.y ?? 0,
      premultipliedAlpha: options.premultipliedAlpha ?? true,
      fitToContainer: options.fitToContainer ?? true,
      backgroundColor: options.backgroundColor ?? 'transparent',
      showControls: options.showControls ?? false,
      controlsPosition: options.controlsPosition ?? 'top-left',
      allowSkinChange: options.allowSkinChange ?? false,
      enablePan: options.enablePan ?? true,
      enableZoom: options.enableZoom ?? true,
      minZoom: options.minZoom ?? 0.25,
      maxZoom: options.maxZoom ?? 4,
      zoomSpeed: options.zoomSpeed ?? 0.1,
      highlightAttachmentBounds: options.highlightAttachmentBounds,
      highlightAttachmentBoundsColor: this.normalizeDebugColor(options.highlightAttachmentBoundsColor, 0xff4d4f),
      highlightAttachmentBoundsLineWidth: this.normalizeLineWidth(options.highlightAttachmentBoundsLineWidth, 2),
      debugMeshAttachment: options.debugMeshAttachment,
      debugMeshAttachmentColor: this.normalizeDebugColor(options.debugMeshAttachmentColor, 0x2dd4ff),
      debugMeshAttachmentLineWidth: this.normalizeLineWidth(options.debugMeshAttachmentLineWidth, 2),
      copyright: options.copyright,
      copyrightIcon: options.copyrightIcon,
      font: options.font,
      onLoad: options.onLoad,
      onError: options.onError,
      onAnimationComplete: options.onAnimationComplete,
    };

    this.highlightAttachmentName = this.options.highlightAttachmentBounds?.trim() || null;
    this.highlightAttachmentColor = this.options.highlightAttachmentBoundsColor;
    this.highlightAttachmentLineWidth = this.options.highlightAttachmentBoundsLineWidth;
    this.debugMeshAttachmentName = this.options.debugMeshAttachment?.trim() || null;
    this.debugMeshAttachmentColor = this.options.debugMeshAttachmentColor;
    this.debugMeshAttachmentLineWidth = this.options.debugMeshAttachmentLineWidth;

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.element.appendChild(this.canvas);

    // Initialize PixiJS application and load assets
    this.loadingPromise = this.initialize();
  }

  /**
   * Initialize PixiJS application and load Spine assets
   */
  private async initialize(): Promise<void> {
    try {
      // Create PixiJS application
      this.app = new Application();
      
      await this.app.init({
        canvas: this.canvas,
        backgroundColor: this.parseColor(this.options.backgroundColor),
        backgroundAlpha: this.parseAlpha(this.options.backgroundColor),
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        resizeTo: this.element,
      });

      // Create camera container hierarchy
      // cameraContainer handles zoom (scale)
      this.cameraContainer = new Container();
      this.app.stage.addChild(this.cameraContainer);
      
      // Set camera container pivot to viewport center for centered zoom
      this.cameraContainer.position.set(
        this.app.screen.width / 2,
        this.app.screen.height / 2
      );
      this.cameraContainer.pivot.set(
        this.app.screen.width / 2,
        this.app.screen.height / 2
      );
      
      // panContainer handles pan (position)
      this.panContainer = new Container();
      this.cameraContainer.addChild(this.panContainer);

      // Load Spine assets
      await this.loadSpineAssets();

      // Set up resize handler
      this.setupResizeHandler();

      // Set up interaction (pan & zoom)
      this.setupInteraction();

      // Create control panel if enabled
      if (this.options.showControls) {
        this.createControlPanel();
      }

      // Call onLoad callback
      if (this.options.onLoad) {
        this.options.onLoad();
      }
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * Load Spine skeleton and atlas files
   */
  private async loadSpineAssets(): Promise<void> {
    if (!this.app) {
      throw new Error('PixiJS application not initialized');
    }

    try {
      const atlasAssetData = await this.buildAtlasAssetData();

      // Add assets to the PixiJS Assets cache with unique aliases
      Assets.add({ alias: this.skeletonAlias, src: this.options.skeleton });
      Assets.add({
        alias: this.atlasAlias,
        src: this.options.atlas,
        ...(atlasAssetData ? { data: atlasAssetData } : {}),
      });

      // Load the assets into the cache
      await Assets.load([this.skeletonAlias, this.atlasAlias]);

      // Create Spine instance using the ALIASES from the Assets cache
      // Spine.from() will retrieve the assets from cache and parse them with SkeletonJson
      console.log('🦴 Creating Spine instance from asset aliases...');
      console.log('Skeleton alias:', this.skeletonAlias);
      console.log('Atlas alias:', this.atlasAlias);
      
      this.spine = Spine.from({
        skeleton: this.skeletonAlias,
        atlas: this.atlasAlias,
      });
      
      console.log('✅ Spine instance created');
      console.log('Available animations:', this.spine.skeleton.data.animations.map((a: any) => a.name));

      if (!this.spine || !this.panContainer) {
        throw new Error('Failed to create Spine instance');
      }

      // Add spine to panContainer
      this.panContainer.addChild(this.spine);
      this.createDebugOverlayGraphics();

      // Set initial skin if specified
      if (this.options.skin) {
        this.setSkin(this.options.skin);
      }

      // Set initial animation sequence if specified
      this.applyInitialAnimationSequence();

      // Apply initial scale
      if (this.options.scale !== 1) {
        this.setScale(this.options.scale);
      }

      // Apply initial position
      if (this.options.x !== 0 || this.options.y !== 0) {
        this.setPosition(this.options.x, this.options.y);
      }

      // Fit to container if enabled
      if (this.options.fitToContainer) {
        this.fitToContainer();
      }

      // Set up ticker for smooth easing
      this.app.ticker.add(() => {
        if (!this.isDestroyed) {
          // Apply smooth easing to pan and zoom
          this.updateEasing();
          this.updateDebugOverlays();
        }
      });

      // Keep currentAnimation in sync with active track.
      this.spine.state.addListener({
        start: (entry: any) => {
          if (entry?.animation?.name) {
            this.currentAnimation = entry.animation.name;
          }
          this.isPausedState = false;
        },
        complete: (entry: any) => {
          if (this.options.onAnimationComplete) {
            this.options.onAnimationComplete(entry.animation.name);
          }
        },
      });
    } catch (error) {
      throw new Error(`Failed to load Spine assets: ${(error as Error).message}`);
    }
  }

  private parseImagesList(images?: string): string[] {
    if (!images) return [];
    return images
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private extractAtlasPageNames(atlasText: string): string[] {
    const lines = atlasText.split(/\r?\n/);
    const pages: string[] = [];
    const metadataKeys = new Set(['size', 'format', 'filter', 'repeat', 'pma', 'scale']);

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!line || line.includes(':')) continue;

      const next = lines
        .slice(i + 1)
        .map((item) => item.trim())
        .find(Boolean) ?? '';
      if (!next.includes(':')) continue;

      const key = next.split(':')[0].trim();
      if (metadataKeys.has(key) && !pages.includes(line)) {
        pages.push(line);
      }
    }

    return pages;
  }

  private async fetchAtlasText(): Promise<string> {
    const response = await fetch(this.options.atlas);
    if (!response.ok) {
      throw new Error(`Failed to fetch atlas for image mapping: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  private async buildAtlasAssetData(): Promise<Record<string, unknown> | undefined> {
    const imageList = this.parseImagesList(this.options.images);
    if (imageList.length === 0) return undefined;
    if (imageList.length === 1) return { images: imageList[0] };

    try {
      const atlasText = await this.fetchAtlasText();
      const pageNames = this.extractAtlasPageNames(atlasText);
      if (pageNames.length === 0) {
        return { images: imageList[0] };
      }

      const imageMap: Record<string, string> = {};
      pageNames.forEach((pageName, index) => {
        const mappedImage = imageList[Math.min(index, imageList.length - 1)];
        imageMap[pageName] = mappedImage;
      });

      return { images: imageMap };
    } catch (error) {
      console.warn('[Spinefolio] Failed to parse atlas pages for data-images, using first image URL fallback.', error);
      return { images: imageList[0] };
    }
  }

  private applyInitialAnimationSequence(): void {
    if (!this.spine) return;

    const initialAnimation = this.options.animation;
    const queuedAnimation = this.options.nextAnimation;

    // Backward-compatible behavior: if only `animation` is provided, play it exactly as before.
    if (initialAnimation) {
      this.setAnimation(initialAnimation, this.options.loop);
      if (queuedAnimation) {
        this.addAnimation(queuedAnimation, this.options.nextAnimationLoop, 0);
      }
      return;
    }

    // If only queued animation is provided, treat it as the initial animation.
    if (queuedAnimation) {
      this.setAnimation(queuedAnimation, this.options.nextAnimationLoop);
    }
  }

  /**
   * Set up window resize handler
   */
  private setupResizeHandler(): void {
    this.resizeObserver = new ResizeObserver(() => {
      if (this.options.fitToContainer && !this.isDestroyed) {
        this.fitToContainer();
      }
    });

    this.resizeObserver.observe(this.element);
  }

  /**
   * Parse color string to number
   */
  private parseColor(color: string): number {
    if (color === 'transparent') {
      return 0x000000;
    }
    
    if (color.startsWith('#')) {
      return parseInt(color.slice(1), 16);
    }
    
    return 0x000000;
  }

  /**
   * Parse alpha value from color string
   */
  private parseAlpha(color: string): number {
    if (color === 'transparent') {
      return 0;
    }
    
    return 1;
  }

  private normalizeDebugColor(color: number | undefined, fallback: number): number {
    if (typeof color === 'number' && Number.isFinite(color)) {
      return color & 0xffffff;
    }
    return fallback;
  }

  private normalizeLineWidth(width: number | undefined, fallback: number): number {
    if (typeof width === 'number' && Number.isFinite(width) && width > 0) {
      return width;
    }
    return fallback;
  }

  private createDebugOverlayGraphics(): void {
    if (!this.spine) return;

    this.spine.sortableChildren = true;

    if (!this.highlightAttachmentGraphics) {
      this.highlightAttachmentGraphics = new Graphics();
      this.highlightAttachmentGraphics.eventMode = 'none';
      this.highlightAttachmentGraphics.zIndex = 10_001;
      this.spine.addChild(this.highlightAttachmentGraphics);
    }

    if (!this.debugMeshAttachmentGraphics) {
      this.debugMeshAttachmentGraphics = new Graphics();
      this.debugMeshAttachmentGraphics.eventMode = 'none';
      this.debugMeshAttachmentGraphics.zIndex = 10_002;
      this.spine.addChild(this.debugMeshAttachmentGraphics);
    }
  }

  private updateDebugOverlays(): void {
    this.drawAttachmentBoundsHighlight();
    this.drawMeshAttachmentOutline();
  }

  private drawAttachmentBoundsHighlight(): void {
    const graphics = this.highlightAttachmentGraphics;
    if (!graphics) return;

    graphics.clear();
    if (!this.highlightAttachmentName) return;

    const target = this.findAttachmentTarget(this.highlightAttachmentName);
    if (!target) return;

    const worldVertices = this.computeAttachmentWorldVertices(target.slot, target.attachment);
    if (worldVertices.length < 2) return;

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < worldVertices.length; i += 2) {
      const x = worldVertices[i];
      const y = worldVertices[i + 1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    const width = maxX - minX;
    const height = maxY - minY;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return;
    }

    graphics
      .lineStyle(this.highlightAttachmentLineWidth, this.highlightAttachmentColor, 1)
      .drawRect(minX, minY, width, height);
  }

  private drawMeshAttachmentOutline(): void {
    const graphics = this.debugMeshAttachmentGraphics;
    if (!graphics) return;

    graphics.clear();
    if (!this.debugMeshAttachmentName) return;

    const target = this.findAttachmentTarget(this.debugMeshAttachmentName);
    if (!target || !(target.attachment instanceof MeshAttachment)) return;

    const worldVertices = this.computeAttachmentWorldVertices(target.slot, target.attachment);
    if (worldVertices.length < 6) return;

    const triangles = target.attachment.triangles ?? [];
    if (triangles.length < 3) return;

    const edges = new Map<string, { a: number; b: number; count: number }>();
    const addEdge = (a: number, b: number) => {
      const start = Math.min(a, b);
      const end = Math.max(a, b);
      const key = `${start}:${end}`;
      const existing = edges.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        edges.set(key, { a: start, b: end, count: 1 });
      }
    };

    for (let i = 0; i < triangles.length; i += 3) {
      const a = triangles[i];
      const b = triangles[i + 1];
      const c = triangles[i + 2];
      addEdge(a, b);
      addEdge(b, c);
      addEdge(c, a);
    }

    graphics.lineStyle(this.debugMeshAttachmentLineWidth, this.debugMeshAttachmentColor, 1);

    for (const edge of edges.values()) {
      if (edge.count !== 1) continue;

      const x1 = worldVertices[edge.a * 2];
      const y1 = worldVertices[edge.a * 2 + 1];
      const x2 = worldVertices[edge.b * 2];
      const y2 = worldVertices[edge.b * 2 + 1];

      if (
        !Number.isFinite(x1) ||
        !Number.isFinite(y1) ||
        !Number.isFinite(x2) ||
        !Number.isFinite(y2)
      ) {
        continue;
      }

      graphics.moveTo(x1, y1);
      graphics.lineTo(x2, y2);
    }
  }

  private findAttachmentTarget(
    attachmentName: string
  ): { slot: SpineSlotLike; attachment: SpineAttachmentLike } | null {
    if (!this.spine) return null;

    const slots = this.spine.skeleton.drawOrder as unknown as SpineSlotLike[];
    for (const slot of slots) {
      const attachment = slot.getAttachment();
      if (attachment && attachment.name === attachmentName) {
        return { slot, attachment };
      }
    }

    return null;
  }

  private computeAttachmentWorldVertices(
    slot: SpineSlotLike,
    attachment: SpineAttachmentLike
  ): number[] {
    if (attachment instanceof RegionAttachment) {
      const worldVertices = new Float32Array(8);
      attachment.computeWorldVertices(slot as any, worldVertices, 0, 2);
      return Array.from(worldVertices);
    }

    if (attachment instanceof MeshAttachment) {
      const worldVertices = new Float32Array(attachment.worldVerticesLength);
      attachment.computeWorldVertices(
        slot as any,
        0,
        attachment.worldVerticesLength,
        worldVertices,
        0,
        2
      );
      return Array.from(worldVertices);
    }

    return [];
  }

  /**
   * Handle errors
   */
  private handleError(error: Error): void {
    console.error('PixiSpineWidget Error:', error);
    
    if (this.options.onError) {
      this.options.onError(error);
    }

    // Display error message in the widget
    this.displayError(error.message);
  }

  /**
   * Display error message in the widget
   */
  private displayError(message: string): void {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 0, 0, 0.1);
      border: 2px solid rgba(255, 0, 0, 0.5);
      border-radius: 8px;
      padding: 20px;
      color: #ff0000;
      font-family: monospace;
      font-size: 14px;
      max-width: 80%;
      text-align: center;
      z-index: 1000;
    `;
    errorDiv.textContent = `Error: ${message}`;
    this.element.appendChild(errorDiv);
  }

  /**
   * Fit spine to container bounds
   */
  private fitToContainer(): void {
    if (!this.spine || !this.panContainer || !this.cameraContainer || !this.app) return;

    const bounds = this.spine.getBounds();
    const containerWidth = this.app.screen.width;
    const containerHeight = this.app.screen.height;

    // Update camera container pivot to viewport center for centered zoom
    this.cameraContainer.position.set(containerWidth / 2, containerHeight / 2);
    this.cameraContainer.pivot.set(containerWidth / 2, containerHeight / 2);

    if (bounds.width === 0 || bounds.height === 0) return;

    // Calculate scale to fit
    const scaleX = containerWidth / bounds.width;
    const scaleY = containerHeight / bounds.height;
    const scale = Math.min(scaleX, scaleY) * 0.9; // 90% to add some padding

    // Apply initial scale to spine (this is the base scale, not zoom)
    this.spine.scale.set(scale);

    // Center the spine in panContainer
    this.spine.x = containerWidth / 2;
    this.spine.y = containerHeight / 2;

    // Reset zoom state - zoom is applied to cameraContainer
    this.currentZoom = 1;
    this.targetZoom = 1;
    this.cameraContainer.scale.set(1);

    // Reset pan state - pan is applied to panContainer
    this.lastPan = { x: 0, y: 0 };
    this.targetPan = { x: 0, y: 0 };
    this.currentPanSmooth = { x: 0, y: 0 };
    this.panContainer.position.set(0, 0);
  }

  /**
   * Set up interaction handlers for pan & zoom
   */
  private setupInteraction(): void {
    if (!this.app || !this.cameraContainer) return;
    if (!this.options.enablePan && !this.options.enableZoom) return;

    // Enable interaction on the stage
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;

    // Mouse/touch pan handlers
    if (this.options.enablePan) {
      this.app.stage.on('pointerdown', this.onPointerDown.bind(this));
      this.app.stage.on('pointermove', this.onPointerMove.bind(this));
      this.app.stage.on('pointerup', this.onPointerUp.bind(this));
      this.app.stage.on('pointercancel', this.onPointerUp.bind(this));
      this.app.stage.on('pointerupoutside', this.onPointerUp.bind(this));
    }

    // Mouse wheel zoom handler
    if (this.options.enableZoom) {
      this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    }
  }

  /**
   * Handle pointer down event (start pan or pinch)
   */
  private onPointerDown(event: any): void {
    if (!this.panContainer || !this.app) return;

    const pointerId = event.data.pointerId;
    const position = event.data.global;

    // Store touch point
    this.touchPoints.set(pointerId, { x: position.x, y: position.y });

    // Single touch/mouse - start dragging
    if (this.touchPoints.size === 1) {
      this.isDragging = true;
      this.dragStart = { x: position.x, y: position.y };
    }

    // Two touches - prepare for pinch zoom
    if (this.touchPoints.size === 2 && this.options.enableZoom) {
      const points = Array.from(this.touchPoints.values());
      this.lastPinchDistance = this.getDistance(points[0], points[1]);
      this.isDragging = false; // Disable pan during pinch
    }
  }

  /**
   * Handle pointer move event (pan or pinch zoom)
   */
  private onPointerMove(event: any): void {
    if (!this.panContainer || !this.app) return;

    const pointerId = event.data.pointerId;
    const position = event.data.global;

    // Update touch point
    if (this.touchPoints.has(pointerId)) {
      this.touchPoints.set(pointerId, { x: position.x, y: position.y });
    }

    // Handle pinch zoom (two touches)
    if (this.touchPoints.size === 2 && this.options.enableZoom) {
      const points = Array.from(this.touchPoints.values());
      const currentDistance = this.getDistance(points[0], points[1]);

      if (this.lastPinchDistance > 0) {
        const scale = currentDistance / this.lastPinchDistance;
        const newZoom = Math.max(
          this.options.minZoom,
          Math.min(this.options.maxZoom, this.currentZoom * scale)
        );

        // Calculate center point between fingers
        const centerX = (points[0].x + points[1].x) / 2;
        const centerY = (points[0].y + points[1].y) / 2;

        this.applyZoom(newZoom, centerX, centerY);
      }

      this.lastPinchDistance = currentDistance;
      return;
    }

    // Handle single touch/mouse pan
    if (this.isDragging && this.touchPoints.size === 1) {
      const dx = position.x - this.dragStart.x;
      const dy = position.y - this.dragStart.y;

      // Update target pan for smooth easing
      this.targetPan.x = this.lastPan.x + dx;
      this.targetPan.y = this.lastPan.y + dy;

      // Apply immediately during drag for responsive feel
      this.currentPanSmooth.x = this.targetPan.x;
      this.currentPanSmooth.y = this.targetPan.y;

      this.panContainer.position.set(
        this.targetPan.x,
        this.targetPan.y
      );
    }
  }

  /**
   * Handle pointer up event (end pan or pinch)
   */
  private onPointerUp(event: any): void {
    const pointerId = event.data.pointerId;

    // Remove touch point
    this.touchPoints.delete(pointerId);

    // End dragging if no more touches
    if (this.touchPoints.size === 0) {
      if (this.isDragging && this.panContainer) {
        this.lastPan = {
          x: this.panContainer.position.x,
          y: this.panContainer.position.y,
        };
        // Sync target pan with current position
        this.targetPan = { ...this.lastPan };
        this.currentPanSmooth = { ...this.lastPan };
      }
      this.isDragging = false;
      this.lastPinchDistance = 0;
    }

    // Reset pinch if only one touch remains
    if (this.touchPoints.size === 1) {
      this.lastPinchDistance = 0;
      const remaining = Array.from(this.touchPoints.values())[0];
      this.dragStart = { x: remaining.x, y: remaining.y };
      this.isDragging = true;
    }
  }

  /**
   * Handle mouse wheel event (zoom)
   */
  private onWheel(event: WheelEvent): void {
    if (!this.panContainer || !this.app || !this.options.enableZoom) return;

    event.preventDefault();

    // Calculate zoom delta
    const delta = event.deltaY > 0 ? (1 - this.options.zoomSpeed) : (1 + this.options.zoomSpeed);
    const newZoom = Math.max(
      this.options.minZoom,
      Math.min(this.options.maxZoom, this.targetZoom * delta)
    );

    // Use Spine character center as zoom anchor
    const spineCenter = this.getSpineCenter();

    this.applyZoom(newZoom, spineCenter.x, spineCenter.y);
  }

  /**
   * Apply zoom transformation - now simplified since zoom and pan are separated
   */
  private applyZoom(newZoom: number, pivotX: number, pivotY: number): void {
    if (!this.spine || !this.panContainer || !this.cameraContainer) return;

    // Simply update the target zoom
    // The cameraContainer will be scaled in updateEasing()
    // No need to adjust pan since zoom and pan are now independent
    this.targetZoom = newZoom;
  }

  /**
   * Calculate distance between two points
   */
  private getDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Exponential easing function for smooth animations
   *
   * @param t - Progress value between 0 and 1
   * @returns Eased value
   */
  private easeOutExpo(t: number): number {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  /**
   * Update smooth easing for pan and zoom
   * Called every frame by the ticker
   */
  private updateEasing(): void {
    if (!this.cameraContainer || !this.spine) return;

    // Smooth zoom easing - apply to cameraContainer scale
    if (Math.abs(this.currentZoom - this.targetZoom) > 0.001) {
      const zoomDiff = this.targetZoom - this.currentZoom;
      const easedZoomDiff = zoomDiff * this.easingSpeed;
      this.currentZoom += easedZoomDiff;

      // Apply zoom to cameraContainer scale (not spine scale)
      this.cameraContainer.scale.set(this.currentZoom);

      // Update zoom slider if controls are visible
      if (this.controlsPanel) {
        const zoomValue = this.controlsPanel.querySelector('#zoom-value');
        const zoomSlider = this.controlsPanel.querySelector('#zoom-slider') as HTMLInputElement;
        if (zoomValue) zoomValue.textContent = `${this.currentZoom.toFixed(2)}x`;
        if (zoomSlider) zoomSlider.value = this.currentZoom.toString();
      }
    }

    // Smooth pan easing (only when not actively dragging)
    if (!this.isDragging && this.panContainer) {
      const panDiffX = this.targetPan.x - this.currentPanSmooth.x;
      const panDiffY = this.targetPan.y - this.currentPanSmooth.y;

      if (Math.abs(panDiffX) > 0.1 || Math.abs(panDiffY) > 0.1) {
        this.currentPanSmooth.x += panDiffX * this.easingSpeed;
        this.currentPanSmooth.y += panDiffY * this.easingSpeed;

        this.panContainer.position.set(
          this.currentPanSmooth.x,
          this.currentPanSmooth.y
        );
      }
    }
  }

  /**
   * Get the center point of the Spine character bounds
   *
   * @returns Center point in screen coordinates
   */
  private getSpineCenter(): { x: number; y: number } {
    if (!this.spine || !this.app) {
      return { x: this.app?.screen.width ?? 0 / 2, y: this.app?.screen.height ?? 0 / 2 };
    }

    // Get spine bounds in world coordinates
    const bounds = this.spine.getBounds();
    
    // Calculate center of bounds
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    return { x: centerX, y: centerY };
  }

  /**
   * Create control panel UI with Windows-style menu system
   */
  private createControlPanel(): void {
    if (this.controlsPanel) return;

    // Create main container
    this.controlsPanel = document.createElement('div');
    this.controlsPanel.className = 'spine-controls-windows-menu';
    this.controlsPanel.setAttribute('data-position', this.options.controlsPosition);

    // Create menu bar
    const menuBar = document.createElement('div');
    menuBar.className = 'spine-menu-bar';

    // Create menu items
    const menuItems = [
      { label: 'Animation', items: [
        { type: 'select', id: 'animation-select', label: 'Select Animation', options: this.getAnimations(), value: this.currentAnimation },
        { type: 'separator' },
        { type: 'buttons', items: [
          { id: 'play-btn', label: 'Play', shortcut: 'Space' },
          { id: 'pause-btn', label: 'Pause', shortcut: 'P' },
          { id: 'stop-btn', label: 'Stop', shortcut: 'S' }
        ]},
        { type: 'separator' },
        { type: 'slider', id: 'speed-slider', label: 'Speed', min: 0.1, max: 2, step: 0.1, value: this.animationSpeed, valueId: 'speed-value' },
        { type: 'checkbox', id: 'loop-checkbox', label: 'Loop Animation', checked: this.options.loop }
      ]},
      { label: 'View', items: [
        { type: 'button', id: 'reset-view-btn', label: 'Reset View', shortcut: 'R' },
        { type: 'button', id: 'fit-to-container-btn', label: 'Fit to Container', shortcut: 'F' },
        { type: 'separator' },
        { type: 'slider', id: 'zoom-slider', label: 'Zoom', min: this.options.minZoom, max: this.options.maxZoom, step: 0.25, value: this.currentZoom, valueId: 'zoom-value' }
      ]}
    ];

    // Add skin menu if multiple skins available
    const skins = this.getSkins();
    if (this.options.allowSkinChange && skins.length > 1) {
      menuItems.push({
        label: 'Skin', items: [
          { type: 'select', id: 'skin-select', label: 'Select Skin', options: skins, value: null }
        ]
      });
    }

    // Create each menu
    menuItems.forEach((menu, index) => {
      const menuItem = this.createWindowsMenuItem(menu.label, menu.items, index);
      menuBar.appendChild(menuItem);
    });

    this.controlsPanel.appendChild(menuBar);

    // Add to DOM
    this.element.appendChild(this.controlsPanel);
    this.controlsVisible = true;

    // Set up event listeners
    this.setupControlListeners();
    this.setupWindowsMenuBehavior();
  }
 
   /**
    * Create a Windows-style menu item with dropdown
    */
   private createWindowsMenuItem(label: string, items: any[], index: number): HTMLElement {
     const menuItem = document.createElement('div');
     menuItem.className = 'spine-menu-item';
     
     const menuButton = document.createElement('button');
     menuButton.className = 'spine-menu-button-windows';
     menuButton.textContent = label;
     menuButton.setAttribute('data-menu-index', index.toString());
     
     const dropdown = document.createElement('div');
     dropdown.className = 'spine-menu-dropdown';
     dropdown.style.display = 'none';
     
     items.forEach(item => {
       if (item.type === 'separator') {
         const separator = document.createElement('div');
         separator.className = 'spine-menu-separator';
         dropdown.appendChild(separator);
       } else if (item.type === 'select') {
         const selectContainer = document.createElement('div');
         selectContainer.className = 'spine-menu-item-container';
         
         const selectLabel = document.createElement('div');
         selectLabel.className = 'spine-menu-item-label';
         selectLabel.textContent = item.label;
         selectContainer.appendChild(selectLabel);
         
         const select = document.createElement('select');
         select.className = 'spine-control-select spine-menu-select';
         select.id = item.id;
         item.options.forEach((opt: string) => {
           const option = document.createElement('option');
           option.value = opt;
           option.textContent = opt;
           if (item.value && opt === item.value) option.selected = true;
           select.appendChild(option);
         });
         selectContainer.appendChild(select);
         dropdown.appendChild(selectContainer);
       } else if (item.type === 'buttons') {
         const buttonContainer = document.createElement('div');
         buttonContainer.className = 'spine-menu-button-group';
         
         item.items.forEach((btn: any) => {
           const menuItemButton = document.createElement('div');
           menuItemButton.className = 'spine-menu-item-button';
           
           const button = document.createElement('button');
           button.className = 'spine-control-button spine-menu-action-btn';
           button.id = btn.id;
           button.textContent = btn.label;
           
           if (btn.shortcut) {
             const shortcut = document.createElement('span');
             shortcut.className = 'spine-menu-shortcut';
             shortcut.textContent = btn.shortcut;
             menuItemButton.appendChild(button);
             menuItemButton.appendChild(shortcut);
           } else {
             menuItemButton.appendChild(button);
           }
           
           buttonContainer.appendChild(menuItemButton);
         });
         dropdown.appendChild(buttonContainer);
       } else if (item.type === 'button') {
         const menuItemButton = document.createElement('div');
         menuItemButton.className = 'spine-menu-item-button';
         
         const button = document.createElement('button');
         button.className = 'spine-control-button spine-menu-action-btn';
         button.id = item.id;
         button.textContent = item.label;
         
         if (item.shortcut) {
           const shortcut = document.createElement('span');
           shortcut.className = 'spine-menu-shortcut';
           shortcut.textContent = item.shortcut;
           menuItemButton.appendChild(button);
           menuItemButton.appendChild(shortcut);
         } else {
           menuItemButton.appendChild(button);
         }
         
         dropdown.appendChild(menuItemButton);
       } else if (item.type === 'slider') {
         const sliderContainer = document.createElement('div');
         sliderContainer.className = 'spine-menu-item-container';
         
         const sliderLabel = document.createElement('div');
         sliderLabel.className = 'spine-menu-item-label';
         sliderLabel.innerHTML = `${item.label}: <span id="${item.valueId}" class="spine-menu-value">${item.value.toFixed(item.step < 1 ? 1 : 2)}x</span>`;
         sliderContainer.appendChild(sliderLabel);
         
         const slider = document.createElement('input');
         slider.type = 'range';
         slider.className = 'spine-control-slider spine-menu-slider';
         slider.id = item.id;
         slider.min = item.min.toString();
         slider.max = item.max.toString();
         slider.step = item.step.toString();
         slider.value = item.value.toString();
         sliderContainer.appendChild(slider);
         dropdown.appendChild(sliderContainer);
       } else if (item.type === 'checkbox') {
         const checkboxContainer = document.createElement('div');
         checkboxContainer.className = 'spine-menu-item-button';
         
         const label = document.createElement('label');
         label.className = 'spine-menu-checkbox-label';
         label.innerHTML = `
           <input type="checkbox" class="spine-control-checkbox spine-menu-checkbox" id="${item.id}" ${item.checked ? 'checked' : ''}>
           <span class="spine-menu-checkbox-text">${item.label}</span>
         `;
         checkboxContainer.appendChild(label);
         dropdown.appendChild(checkboxContainer);
       }
     });
     
     menuItem.appendChild(menuButton);
     menuItem.appendChild(dropdown);
     
     return menuItem;
   }
 
   /**
    * Set up Windows-style menu behavior
    */
   private setupWindowsMenuBehavior(): void {
     if (!this.controlsPanel) return;
     
     const menuButtons = this.controlsPanel.querySelectorAll('.spine-menu-button-windows');
     const menuDropdowns = this.controlsPanel.querySelectorAll('.spine-menu-dropdown');
     let activeMenuIndex = -1;
     
     // Handle menu button clicks
     menuButtons.forEach((button, index) => {
       button.addEventListener('click', (e) => {
         e.stopPropagation();
         const dropdown = menuDropdowns[index] as HTMLElement;
         const isCurrentlyActive = activeMenuIndex === index;
         
         // Close all menus
         menuDropdowns.forEach(d => (d as HTMLElement).style.display = 'none');
         menuButtons.forEach(b => b.classList.remove('active'));
         
         if (!isCurrentlyActive) {
           // Open clicked menu
           dropdown.style.display = 'block';
           button.classList.add('active');
           activeMenuIndex = index;
         } else {
           activeMenuIndex = -1;
         }
       });
       
       // Handle menu button hover when a menu is already open
       button.addEventListener('mouseenter', () => {
         if (activeMenuIndex !== -1 && activeMenuIndex !== index) {
           // Close current menu
           menuDropdowns.forEach(d => (d as HTMLElement).style.display = 'none');
           menuButtons.forEach(b => b.classList.remove('active'));
           
           // Open hovered menu
           const dropdown = menuDropdowns[index] as HTMLElement;
           dropdown.style.display = 'block';
           button.classList.add('active');
           activeMenuIndex = index;
         }
       });
     });
     
     // Close menus when clicking outside
     document.addEventListener('click', (e) => {
       if (!this.controlsPanel?.contains(e.target as Node)) {
         menuDropdowns.forEach(d => (d as HTMLElement).style.display = 'none');
         menuButtons.forEach(b => b.classList.remove('active'));
         activeMenuIndex = -1;
       }
     });
     
     // Handle clicks on menu items (should close menu)
     this.controlsPanel.addEventListener('click', (e) => {
       const target = e.target as HTMLElement;
       if (target.closest('.spine-menu-action-btn') || target.closest('.spine-menu-checkbox-label')) {
         // Close all menus after action
         setTimeout(() => {
           menuDropdowns.forEach(d => (d as HTMLElement).style.display = 'none');
           menuButtons.forEach(b => b.classList.remove('active'));
           activeMenuIndex = -1;
         }, 100);
       }
     });
   }
  /**
   * Create a submenu with items
   */
  private createSubmenu(title: string, items: any[]): HTMLElement {
    const submenu = document.createElement('div');
    submenu.className = 'spine-submenu';

    const submenuHeader = document.createElement('button');
    submenuHeader.className = 'spine-submenu-header';
    submenuHeader.innerHTML = `<span>${title}</span><span class="spine-submenu-arrow">▼</span>`;
    submenu.appendChild(submenuHeader);

    const submenuContent = document.createElement('div');
    submenuContent.className = 'spine-submenu-content';
    submenuContent.style.display = 'block'; // Start expanded

    items.forEach(item => {
      if (item.type === 'select') {
        const select = document.createElement('select');
        select.className = 'spine-control-select';
        select.id = item.id;
        item.options.forEach((opt: string) => {
          const option = document.createElement('option');
          option.value = opt;
          option.textContent = opt;
          if (item.value && opt === item.value) option.selected = true;
          select.appendChild(option);
        });
        submenuContent.appendChild(select);
      } else if (item.type === 'buttons') {
        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'spine-control-buttons';
        item.items.forEach((btn: any) => {
          const button = document.createElement('button');
          button.className = 'spine-control-button';
          button.id = btn.id;
          button.textContent = btn.label;
          button.title = btn.title;
          buttonGroup.appendChild(button);
        });
        submenuContent.appendChild(buttonGroup);
      } else if (item.type === 'button') {
        const button = document.createElement('button');
        button.className = 'spine-control-button';
        button.id = item.id;
        button.textContent = item.label;
        submenuContent.appendChild(button);
      } else if (item.type === 'slider') {
        const label = document.createElement('label');
        label.innerHTML = `${item.label}: <span id="${item.valueId}">${item.value.toFixed(item.step < 1 ? 1 : 2)}x</span>`;
        submenuContent.appendChild(label);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'spine-control-slider';
        slider.id = item.id;
        slider.min = item.min.toString();
        slider.max = item.max.toString();
        slider.step = item.step.toString();
        slider.value = item.value.toString();
        submenuContent.appendChild(slider);
      } else if (item.type === 'checkbox') {
        const label = document.createElement('label');
        label.innerHTML = `
          <input type="checkbox" class="spine-control-checkbox" id="${item.id}" ${item.checked ? 'checked' : ''}>
          ${item.label}
        `;
        submenuContent.appendChild(label);
      }
    });

    submenu.appendChild(submenuContent);

    // Toggle submenu on header click
    submenuHeader.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = submenuContent.style.display !== 'none';
      submenuContent.style.display = isVisible ? 'none' : 'block';
      const arrow = submenuHeader.querySelector('.spine-submenu-arrow');
      if (arrow) {
        arrow.textContent = isVisible ? '▶' : '▼';
      }
      submenuHeader.classList.toggle('collapsed', isVisible);
    });

    return submenu;
  }

  /**
   * Set up control panel event listeners
   */
  private setupControlListeners(): void {
    if (!this.controlsPanel) return;

    // Close button
    const closeBtn = this.controlsPanel.querySelector('.spine-controls-close');
    closeBtn?.addEventListener('click', () => this.setShowControls(false));

    // Animation select
    const animSelect = this.controlsPanel.querySelector('#animation-select') as HTMLSelectElement;
    animSelect?.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      const loopCheckbox = this.controlsPanel?.querySelector('#loop-checkbox') as HTMLInputElement;
      this.setAnimation(target.value, loopCheckbox?.checked ?? true);
    });

    // Play button
    const playBtn = this.controlsPanel.querySelector('#play-btn');
    playBtn?.addEventListener('click', () => this.play());

    // Pause button
    const pauseBtn = this.controlsPanel.querySelector('#pause-btn');
    pauseBtn?.addEventListener('click', () => this.pause());

    // Stop button
    const stopBtn = this.controlsPanel.querySelector('#stop-btn');
    stopBtn?.addEventListener('click', () => this.stop());

    // Speed slider
    const speedSlider = this.controlsPanel.querySelector('#speed-slider') as HTMLInputElement;
    const speedValue = this.controlsPanel.querySelector('#speed-value');
    speedSlider?.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      const speed = parseFloat(target.value);
      this.setSpeed(speed);
      if (speedValue) speedValue.textContent = `${speed.toFixed(1)}x`;
    });

    // Loop checkbox
    const loopCheckbox = this.controlsPanel.querySelector('#loop-checkbox') as HTMLInputElement;
    loopCheckbox?.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      if (this.currentAnimation) {
        this.setAnimation(this.currentAnimation, target.checked);
      }
    });

    // Skin select
    const skinSelect = this.controlsPanel.querySelector('#skin-select') as HTMLSelectElement;
    skinSelect?.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      this.setSkin(target.value);
    });

    // Reset view button
    // Reset view button
    const resetViewBtn = this.controlsPanel.querySelector('#reset-view-btn');
    resetViewBtn?.addEventListener('click', () => this.resetView());

    // Fit to container button
    const fitToContainerBtn = this.controlsPanel.querySelector('#fit-to-container-btn');
    fitToContainerBtn?.addEventListener('click', () => this.fitToContainer());

    // Zoom slider
    const zoomSlider = this.controlsPanel.querySelector('#zoom-slider') as HTMLInputElement;
    const zoomValue = this.controlsPanel.querySelector('#zoom-value');
    zoomSlider?.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      const zoom = parseFloat(target.value);
      this.setZoom(zoom);
      if (zoomValue) zoomValue.textContent = `${zoom.toFixed(2)}x`;
    });

  }
  /**
   * Set animation
   * 
   * @param name - Animation name
   * @param loop - Whether to loop the animation
   */
  setAnimation(name: string, loop: boolean = true): void {
    if (!this.spine) {
      console.warn('Spine not loaded yet');
      return;
    }

    try {
      this.spine.state.setAnimation(0, name, loop);
      this.currentAnimation = name;
      this.isPausedState = false;
    } catch (error) {
      console.error(`Failed to set animation "${name}":`, error);
    }
  }

  /**
   * Queue an animation to play after the current track.
   *
   * @param name - Animation name
   * @param loop - Whether queued animation should loop
   * @param delay - Delay in seconds before queued animation starts (default: 0)
   */
  addAnimation(name: string, loop: boolean = true, delay: number = 0): void {
    if (!this.spine) {
      console.warn('Spine not loaded yet');
      return;
    }

    try {
      this.spine.state.addAnimation(0, name, loop, delay);
      this.isPausedState = false;
    } catch (error) {
      console.error(`Failed to add animation "${name}":`, error);
    }
  }

  /**
   * Set skin
   * 
   * @param name - Skin name
   */
  setSkin(name: string): void {
    if (!this.spine) {
      console.warn('Spine not loaded yet');
      return;
    }

    try {
      this.spine.skeleton.setSkinByName(name);
      this.spine.skeleton.setSlotsToSetupPose();
    } catch (error) {
      console.error(`Failed to set skin "${name}":`, error);
    }
  }

  /**
   * Set animation speed (time scale)
   * 
   * @param speed - Speed multiplier (1 = normal, 2 = double speed, 0.5 = half speed)
   */
  setSpeed(speed: number): void {
    if (!this.spine) {
      console.warn('Spine not loaded yet');
      return;
    }

    this.animationSpeed = speed;
    this.spine.state.timeScale = speed;
  }

  /**
   * Set scale
   * 
   * @param scale - Scale factor
   */
  setScale(scale: number): void {
    if (!this.spine) {
      console.warn('Spine not loaded yet');
      return;
    }

    this.spine.scale.set(scale);
  }

  /**
   * Set position
   * 
   * @param x - X position
   * @param y - Y position
   */
  setPosition(x: number, y: number): void {
    if (!this.spine) {
      console.warn('Spine not loaded yet');
      return;
    }

    this.spine.x = x;
    this.spine.y = y;
  }

  /**
   * Play current animation
   */
  play(): void {
    if (!this.spine) {
      console.warn('Spine not loaded yet');
      return;
    }

    this.isPausedState = false;
    this.spine.state.timeScale = this.animationSpeed;
  }

  /**
   * Pause current animation
   */
  pause(): void {
    if (!this.spine) {
      console.warn('Spine not loaded yet');
      return;
    }

    this.isPausedState = true;
    this.spine.state.timeScale = 0;
  }

  /**
   * Stop current animation
   */
  stop(): void {
    if (!this.spine) {
      console.warn('Spine not loaded yet');
      return;
    }

    this.spine.state.clearTracks();
    this.currentAnimation = null;
    this.isPausedState = false;
  }

  /**
   * Resume paused animation
   */
  resume(): void {
    this.play();
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    if (!this.spine) {
      console.warn('Spine not loaded yet');
      return;
    }

    this.spine.skeleton.setToSetupPose();
    
    this.applyInitialAnimationSequence();

    if (this.options.fitToContainer) {
      this.fitToContainer();
    }
  }

  /**
   * Reset view (pan and zoom to initial state)
   */
  resetView(): void {
    if (!this.cameraContainer || !this.spine) return;

    // Reset zoom and easing state
    this.currentZoom = 1;
    this.targetZoom = 1;
    
    // Fit to container (this will reset scale, position, and easing state)
    this.fitToContainer();
  }

  /**
   * Get list of available animations
   */
  getAnimations(): string[] {
    if (!this.spine) {
      return [];
    }

    return this.spine.skeleton.data.animations.map((anim: any) => anim.name);
  }

  /**
   * Get list of available skins
   */
  getSkins(): string[] {
    if (!this.spine) {
      return [];
    }

    return this.spine.skeleton.data.skins.map((skin: any) => skin.name);
  }

  /**
   * Get current animation name
   */
  getCurrentAnimation(): string | null {
    return this.currentAnimation;
  }

  /**
   * Check if animation is playing
   */
  isPlaying(): boolean {
    return !this.isPausedState && this.currentAnimation !== null;
  }

  /**
   * Check if animation is paused
   */
  isPaused(): boolean {
    return this.isPausedState;
  }

  /**
   * Set time scale (same as setSpeed)
   */
  setTimeScale(scale: number): void {
    this.setSpeed(scale);
  }

  /**
   * Get time scale
   */
  getTimeScale(): number {
    return this.animationSpeed;
  }

  setHighlightAttachmentBounds(
    attachmentName: string | null,
    color?: number,
    lineWidth?: number
  ): void {
    this.highlightAttachmentName = attachmentName?.trim() || null;

    if (typeof color === 'number') {
      this.highlightAttachmentColor = this.normalizeDebugColor(color, this.highlightAttachmentColor);
    }
    if (typeof lineWidth === 'number') {
      this.highlightAttachmentLineWidth = this.normalizeLineWidth(
        lineWidth,
        this.highlightAttachmentLineWidth
      );
    }

    this.createDebugOverlayGraphics();
    this.drawAttachmentBoundsHighlight();
  }

  clearHighlightAttachmentBounds(): void {
    this.highlightAttachmentName = null;
    this.highlightAttachmentGraphics?.clear();
  }

  setDebugMeshAttachment(
    attachmentName: string | null,
    color?: number,
    lineWidth?: number
  ): void {
    this.debugMeshAttachmentName = attachmentName?.trim() || null;

    if (typeof color === 'number') {
      this.debugMeshAttachmentColor = this.normalizeDebugColor(color, this.debugMeshAttachmentColor);
    }
    if (typeof lineWidth === 'number') {
      this.debugMeshAttachmentLineWidth = this.normalizeLineWidth(
        lineWidth,
        this.debugMeshAttachmentLineWidth
      );
    }

    this.createDebugOverlayGraphics();
    this.drawMeshAttachmentOutline();
  }

  clearDebugMeshAttachment(): void {
    this.debugMeshAttachmentName = null;
    this.debugMeshAttachmentGraphics?.clear();
  }


  /**
   * Set controls visibility
   */
  setShowControls(show: boolean): void {
    this.options.showControls = show;
    
    if (show && !this.controlsPanel) {
      this.createControlPanel();
    } else if (!show && this.controlsPanel) {
      this.controlsPanel.remove();
      this.controlsPanel = null;
      this.controlsVisible = false;
    }
  }

  /**
   * Get controls visibility state
   */
  getShowControls(): boolean {
    return this.controlsVisible;
  }

  /**
   * Enable or disable pan interaction
   */
  setPanEnabled(enabled: boolean): void {
    this.options.enablePan = enabled;
    
    if (!enabled) {
      this.isDragging = false;
      this.touchPoints.clear();
    }
  }

  /**
   * Enable or disable zoom interaction
   */
  setZoomEnabled(enabled: boolean): void {
    this.options.enableZoom = enabled;
    
    if (!enabled) {
      this.lastPinchDistance = 0;
    }
  }

  /**
   * Get current zoom level
   */
  getZoom(): number {
    return this.currentZoom;
  }

  /**
   * Set zoom level programmatically
   *
   * @param zoom - Zoom level (1 = 100%, 2 = 200%, etc.)
   * @param animate - Whether to animate the zoom (default: true with easing)
   */
  setZoom(zoom: number, animate: boolean = true): void {
    if (!this.spine || !this.panContainer || !this.app) return;

    const clampedZoom = Math.max(
      this.options.minZoom,
      Math.min(this.options.maxZoom, zoom)
    );

    // Zoom towards Spine character center
    const spineCenter = this.getSpineCenter();

    this.applyZoom(clampedZoom, spineCenter.x, spineCenter.y);
  }

  /**
   * Get current pan offset
   */
  getPan(): { x: number; y: number } {
    if (!this.panContainer) {
      return { x: 0, y: 0 };
    }

    return {
      x: this.panContainer.position.x,
      y: this.panContainer.position.y,
    };
  }

  /**
   * Set pan offset programmatically
   *
   * @param x - X offset in pixels
   * @param y - Y offset in pixels
   * @param animate - Whether to animate the pan (default: true with easing)
   */
  setPan(x: number, y: number, animate: boolean = true): void {
    if (!this.panContainer) return;

    if (animate) {
      // Use smooth easing
      this.targetPan = { x, y };
      this.lastPan = { x, y };
    } else {
      // Immediate update
      this.panContainer.position.set(x, y);
      this.targetPan = { x, y };
      this.currentPanSmooth = { x, y };
      this.lastPan = { x, y };
    }
  }

  /**
   * Export canvas to data URL
   */
  toDataURL(type: string = 'image/png', quality: number = 1): string {
    if (!this.app) {
      throw new Error('PixiJS application not initialized');
    }

    return this.canvas.toDataURL(type, quality);
  }

  /**
   * Destroy the widget and clean up resources
   */
  async destroy(): Promise<void> {
    if (this.isDestroyed) return;

    this.isDestroyed = true;

    // Wait for loading to complete before destroying
    if (this.loadingPromise) {
      try {
        await this.loadingPromise;
      } catch {
        // Ignore errors during loading
      }
    }

    // Clean up interaction state
    this.isDragging = false;
    this.touchPoints.clear();

    // Remove event listeners
    if (this.app?.stage) {
      this.app.stage.off('pointerdown');
      this.app.stage.off('pointermove');
      this.app.stage.off('pointerup');
      this.app.stage.off('pointercancel');
      this.app.stage.off('pointerupoutside');
    }

    // Remove wheel listener
    this.canvas.removeEventListener('wheel', this.onWheel.bind(this));

    // Clean up resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Clean up control panel
    if (this.controlsPanel) {
      this.controlsPanel.remove();
      this.controlsPanel = null;
      this.controlsVisible = false;
    }

    if (this.highlightAttachmentGraphics) {
      this.highlightAttachmentGraphics.destroy();
      this.highlightAttachmentGraphics = null;
    }

    if (this.debugMeshAttachmentGraphics) {
      this.debugMeshAttachmentGraphics.destroy();
      this.debugMeshAttachmentGraphics = null;
    }

    // Clean up Spine
    if (this.spine) {
      this.spine.destroy();
      this.spine = null;
    }

    // Clean up containers
    if (this.panContainer) {
      this.panContainer.destroy({ children: true });
      this.panContainer = null;
    }
    
    if (this.cameraContainer) {
      this.cameraContainer.destroy({ children: true });
      this.cameraContainer = null;
    }

    // Clean up PixiJS app
    if (this.app) {
      this.app.destroy(true, { children: true });
      this.app = null;
    }

    // Remove canvas
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}
