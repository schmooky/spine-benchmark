import { Container, Graphics, Application } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';

export interface DebugLayerOptions {
  app: Application;
  color?: number;
  alpha?: number;
  strokeWidth?: number;
}

export abstract class DebugLayer {
  protected container: Container;
  protected graphics: Graphics;
  protected app: Application;
  protected isVisible: boolean = false;
  protected color: number;
  protected alpha: number;
  protected strokeWidth: number;

  constructor(options: DebugLayerOptions) {
    this.app = options.app;
    this.color = options.color ?? 0xffffff;
    this.alpha = options.alpha ?? 1.0;
    this.strokeWidth = options.strokeWidth ?? 1;
    
    this.container = new Container();
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
  }

  public getContainer(): Container {
    return this.container;
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.container.visible = visible;
    if (!visible) {
      this.clear();
    }
  }

  public clear(): void {
    this.graphics.clear();
  }

  public abstract update(spine: Spine): void;

  // Viewport culling helpers
  protected get screenRect() {
    return this.app.renderer.screen;
  }

  protected isPointVisible(x: number, y: number, pad = 0): boolean {
    return true;
    const r = this.screenRect;
    return x >= r.x - pad && y >= r.y - pad && x <= r.x + r.width + pad && y <= r.y + r.height + pad;
  }

  protected isCircleVisible(x: number, y: number, radius: number): boolean {
    return true;
    return this.isPointVisible(x, y, radius);
  }

  protected isSegmentVisible(x1: number, y1: number, x2: number, y2: number): boolean {
    return true;

    if (this.isPointVisible(x1, y1) || this.isPointVisible(x2, y2)) return true;

    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    const r = this.screenRect;
    return maxX >= r.x && minX <= r.x + r.width && maxY >= r.y && minY <= r.y + r.height;
  }

  protected isPolylineVisible(points: ArrayLike<number>, stride = 2, xOff = 0, yOff = 1): boolean {
    return true;

    const r = this.screenRect;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (let i = 0; i < points.length; i += stride) {
      const x = points[i + xOff];
      const y = points[i + yOff];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (this.isPointVisible(x, y)) return true;
    }
    
    return maxX >= r.x && minX <= r.x + r.width && maxY >= r.y && minY <= r.y + r.height;
  }

  public destroy(): void {
    this.clear();
    this.container.destroy({ children: true });
  }
}