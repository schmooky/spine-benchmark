import { Graphics } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { DebugLayer, DebugLayerOptions } from '../DebugLayer';

export interface PhysicsConstraintDebugOptions extends DebugLayerOptions {
  boundsColor?: number;
  gravityColor?: number;
  windColor?: number;
  motionColor?: number;
  showBounds?: boolean;
  showGravity?: boolean;
  showWind?: boolean;
  showMotion?: boolean;
  boundsAlpha?: number;
  gravityAlpha?: number;
  windAlpha?: number;
  motionAlpha?: number;
}

export class PhysicsConstraintDebugLayer extends DebugLayer {
  private boundsColor: number;
  private gravityColor: number;
  private windColor: number;
  private motionColor: number;
  private showBounds: boolean;
  private showGravity: boolean;
  private showWind: boolean;
  private showMotion: boolean;
  private boundsAlpha: number;
  private gravityAlpha: number;
  private windAlpha: number;
  private motionAlpha: number;

  constructor(options: PhysicsConstraintDebugOptions) {
    super(options);
    this.boundsColor = options.boundsColor ?? 0x800080;
    this.gravityColor = options.gravityColor ?? 0x4B0082;
    this.windColor = options.windColor ?? 0x9370DB;
    this.motionColor = options.motionColor ?? 0x800080;
    this.showBounds = options.showBounds ?? true;
    this.showGravity = options.showGravity ?? true;
    this.showWind = options.showWind ?? true;
    this.showMotion = options.showMotion ?? true;
    this.boundsAlpha = options.boundsAlpha ?? 0.5;
    this.gravityAlpha = options.gravityAlpha ?? 0.7;
    this.windAlpha = options.windAlpha ?? 0.6;
    this.motionAlpha = options.motionAlpha ?? 0.6;
  }

  public update(spine: Spine): void {
    if (!this.isVisible) return;
    this.clear();

    const skeleton = spine.skeleton;
    const physicsConstraints = skeleton.physicsConstraints || [];

    for (const constraint of physicsConstraints) {
      if (typeof constraint?.isActive === 'function' && !constraint.isActive()) continue;

      if (this.showBounds && constraint.bone) {
        this.drawBounds(constraint);
      }

      if (this.showGravity && constraint.gravity !== 0) {
        this.drawGravity(constraint);
      }

      if (this.showWind && constraint.wind !== 0) {
        this.drawWind(constraint);
      }

      if (this.showMotion) {
        this.drawMotion(constraint);
      }
    }
  }

  private drawBounds(constraint: any): void {
    const g = this.graphics;
    const bone = constraint.bone;
    const x = bone.worldX;
    const y = bone.worldY;
    
    const width = 40;
    const height = 20;
    
    if (this.isSegmentVisible(x - width/2, y - height/2, x + width/2, y + height/2)) {
      g.stroke({ 
        color: this.boundsColor, 
        width: 1.5, 
        alpha: this.boundsAlpha, 
        pixelLine: true 
      });
      
      g.rect(x - width/2, y - height/2, width, height);
    }
  }

  private drawGravity(constraint: any): void {
    const g = this.graphics;
    const bone = constraint.bone;
    const x = bone.worldX;
    const y = bone.worldY;
    
    const arrowLength = 20 * Math.abs(constraint.gravity) / 100;
    const arrowX = x;
    const arrowY = y;
    const endX = arrowX;
    const endY = arrowY + arrowLength;
    
    if (this.isSegmentVisible(arrowX, arrowY, endX, endY)) {
      g.stroke({ 
        color: this.gravityColor, 
        width: 2, 
        alpha: this.gravityAlpha, 
        pixelLine: true 
      });
      
      g.moveTo(arrowX, arrowY).lineTo(endX, endY);
      
      const arrowheadSize = 5;
      g.moveTo(endX, endY)
       .lineTo(endX - arrowheadSize, endY - arrowheadSize)
       .moveTo(endX, endY)
       .lineTo(endX + arrowheadSize, endY - arrowheadSize);
    }
  }

  private drawWind(constraint: any): void {
    const g = this.graphics;
    const bone = constraint.bone;
    const x = bone.worldX;
    const y = bone.worldY;
    
    const windStrength = Math.abs(constraint.wind) / 100;
    const waveLength = 15;
    const amplitude = 3 * windStrength;
    
    if (this.isSegmentVisible(x - 20, y, x + 20, y)) {
      g.stroke({ 
        color: this.windColor, 
        width: 1, 
        alpha: this.windAlpha, 
        pixelLine: true 
      });
      
      g.moveTo(x - 20, y);
      for (let i = -20; i <= 20; i += 2) {
        const waveY = y + Math.sin(i / waveLength * Math.PI * 2) * amplitude;
        g.lineTo(x + i, waveY);
      }
    }
  }

  private drawMotion(constraint: any): void {
    const g = this.graphics;
    const bone = constraint.bone;
    const x = bone.worldX;
    const y = bone.worldY;
    
    const radius = 3;
    
    if (this.isCircleVisible(x, y, radius)) {
      g.fill({ color: this.motionColor, alpha: this.motionAlpha });
      g.circle(x, y, radius).fill();
    }
  }

  public setShowBounds(show: boolean): void { this.showBounds = show; }
  public setShowGravity(show: boolean): void { this.showGravity = show; }
  public setShowWind(show: boolean): void { this.showWind = show; }
  public setShowMotion(show: boolean): void { this.showMotion = show; }

  public setColors(colors: {
    bounds?: number;
    gravity?: number;
    wind?: number;
    motion?: number;
  }): void {
    if (colors.bounds !== undefined) this.boundsColor = colors.bounds;
    if (colors.gravity !== undefined) this.gravityColor = colors.gravity;
    if (colors.wind !== undefined) this.windColor = colors.wind;
    if (colors.motion !== undefined) this.motionColor = colors.motion;
  }

  public setAlphas(alphas: {
    bounds?: number;
    gravity?: number;
    wind?: number;
    motion?: number;
  }): void {
    if (alphas.bounds !== undefined) this.boundsAlpha = alphas.bounds;
    if (alphas.gravity !== undefined) this.gravityAlpha = alphas.gravity;
    if (alphas.wind !== undefined) this.windAlpha = alphas.wind;
    if (alphas.motion !== undefined) this.motionAlpha = alphas.motion;
  }
}