// Spine Widget types for PixiJS v8 integration

export interface SpineWidgetOptions {
  skeleton: string;
  atlas: string;
  images?: string; // Space-separated image URLs for atlas pages
  animation?: string;
  nextAnimation?: string;
  nextAnimationLoop?: boolean;
  skin?: string;
  loop?: boolean;
  scale?: number;
  x?: number;
  y?: number;
  premultipliedAlpha?: boolean;
  fitToContainer?: boolean;
  backgroundColor?: string;
  // Advanced features
  showControls?: boolean;
  controlsPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  allowSkinChange?: boolean;
  enablePan?: boolean;
  enableZoom?: boolean;
  minZoom?: number;
  maxZoom?: number;
  zoomSpeed?: number;
  // Debug overlays
  highlightAttachmentBounds?: string;
  highlightAttachmentBoundsColor?: number;
  highlightAttachmentBoundsLineWidth?: number;
  debugMeshAttachment?: string;
  debugMeshAttachmentColor?: number;
  debugMeshAttachmentLineWidth?: number;
  // Copyright/attribution
  copyright?: string;
  copyrightIcon?: string;
  // Theming
  font?: string;
  // Callbacks
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onAnimationComplete?: (animation: string) => void;
}

export interface SpineWidgetInstance {
  element: HTMLElement;
  canvas: HTMLCanvasElement;
  play(animation?: string, loop?: boolean): void;
  addAnimation(animation: string, loop?: boolean, delay?: number): void;
  stop(): void;
  pause(): void;
  resume(): void;
  setSkin(skin: string): void;
  setScale(scale: number): void;
  setPosition(x: number, y: number): void;
  resetView(): void;
  destroy(): void;
  getAnimations(): string[];
  getSkins(): string[];
  getCurrentAnimation(): string | null;
  isPlaying(): boolean;
  isPaused(): boolean;
  // Controls
  setShowControls(show: boolean): void;
  getShowControls(): boolean;
  // Timing
  setTimeScale(scale: number): void;
  getTimeScale(): number;
  // Screenshot
  toDataURL(type?: string, quality?: number): string;
  // Attachment debug overlays
  setHighlightAttachmentBounds(attachmentName: string | null, color?: number, lineWidth?: number): void;
  clearHighlightAttachmentBounds(): void;
  setDebugMeshAttachment(attachmentName: string | null, color?: number, lineWidth?: number): void;
  clearDebugMeshAttachment(): void;
}

// Internal types for PixiJS integration
export interface PixiSpineWidgetOptions extends SpineWidgetOptions {
  // All fields from SpineWidgetOptions with proper defaults applied internally
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Bone {
  name: string;
  parent: Bone | null;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  worldX: number;
  worldY: number;
}

export interface Slot {
  name: string;
  bone: Bone;
  color: Color;
  attachment: Attachment | null;
}

export interface Attachment {
  name: string;
  type: string;
}

export interface Region {
  u: number;
  v: number;
  u2: number;
  v2: number;
  width: number;
  height: number;
  rotate: boolean;
  texture: WebGLTexture | null;
}

export interface AtlasPage {
  name: string;
  texture: WebGLTexture | null;
  width: number;
  height: number;
}

export interface AtlasRegion {
  name: string;
  page: AtlasPage;
  u: number;
  v: number;
  u2: number;
  v2: number;
  width: number;
  height: number;
  rotate: boolean;
  offsetX: number;
  offsetY: number;
  originalWidth: number;
  originalHeight: number;
}
