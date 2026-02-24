import { Graphics } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { DebugLayer, DebugLayerOptions } from '../DebugLayer.js';

export interface TransformConstraintDebugOptions extends DebugLayerOptions {
  constraintBoneColor?: number;
  targetBoneColor?: number;
  limitColor?: number;
  showConstraints?: boolean;
  showTargets?: boolean;
  showLimits?: boolean;
  constraintBoneAlpha?: number;
  targetBoneAlpha?: number;
  limitAlpha?: number;
}

export class TransformConstraintDebugLayer extends DebugLayer {
  private constraintBoneColor: number;
  private targetBoneColor: number;
  private limitColor: number;
  private showConstraints: boolean;
  private showTargets: boolean;
  private showLimits: boolean;
  private constraintBoneAlpha: number;
  private targetBoneAlpha: number;
  private limitAlpha: number;

  constructor(options: TransformConstraintDebugOptions) {
    super(options);
    this.constraintBoneColor = options.constraintBoneColor ?? 0x00FFFF; // Cyan
    this.targetBoneColor = options.targetBoneColor ?? 0xADD8E6; // Light blue
    this.limitColor = options.limitColor ?? 0x00FFFF; // Cyan
    this.showConstraints = options.showConstraints ?? true;
    this.showTargets = options.showTargets ?? true;
    this.showLimits = options.showLimits ?? false;
    this.constraintBoneAlpha = options.constraintBoneAlpha ?? 0.6;
    this.targetBoneAlpha = options.targetBoneAlpha ?? 0.7;
    this.limitAlpha = options.limitAlpha ?? 0.5;
  }

  public update(spine: Spine): void {
    if (!this.isVisible) return;
    this.clear();

    const skeleton = spine.skeleton;
    const transformConstraints = skeleton.transformConstraints || [];

    for (const constraint of transformConstraints) {
      // Check if constraint is active
      if (typeof constraint?.isActive === 'function' && !constraint.isActive()) continue;

      // Visualize constraint bones
      if (this.showConstraints && constraint.bones) {
        this.drawConstraintBones(constraint.bones);
      }

      // Visualize target bone
      if (this.showTargets && constraint.target) {
        this.drawTargetBone(constraint.target);
      }

      // Visualize limits if enabled
      if (this.showLimits) {
        this.drawLimits(constraint);
      }
    }
  }

  private drawConstraintBones(bones: any[]): void {
    const g = this.graphics;
    
    g.stroke({ 
      color: this.constraintBoneColor, 
      width: 2, 
      alpha: this.constraintBoneAlpha, 
      pixelLine: true 
    });

    for (const bone of bones) {
      const x = bone.worldX;
      const y = bone.worldY;
      
      if (this.isCircleVisible(x, y, 5)) {
        // Draw a diamond shape to indicate constraint bones
        const size = 6;
        g.moveTo(x - size, y)
         .lineTo(x, y - size)
         .lineTo(x + size, y)
         .lineTo(x, y + size)
         .lineTo(x - size, y);
      }
    }
  }

  private drawTargetBone(target: any): void {
    const g = this.graphics;
    const x = target.worldX;
    const y = target.worldY;
    
    if (this.isCircleVisible(x, y, 8)) {
      // Draw a target circle with crosshair
      const radius = 8;
      
      g.stroke({ 
        color: this.targetBoneColor, 
        width: 2, 
        alpha: this.targetBoneAlpha, 
        pixelLine: true 
      });
      
      g.circle(x, y, radius);
      
      // Draw crosshair
      g.moveTo(x - radius, y).lineTo(x + radius, y);
      g.moveTo(x, y - radius).lineTo(x, y + radius);
    }
  }

  private drawLimits(constraint: any): void {
    // For transform constraints, we'll draw a simple visualization of the affected area
    if (!constraint.bones || constraint.bones.length === 0) return;
    
    const g = this.graphics;
    const bone = constraint.bones[0]; // Use the first bone as reference
    const x = bone.worldX;
    const y = bone.worldY;
    
    // Draw a dashed circle to represent limits
    g.stroke({ 
      color: this.limitColor, 
      width: 1, 
      alpha: this.limitAlpha, 
      pixelLine: true 
    });
    
    const radius = 30;
    const segments = 8;
    for (let i = 0; i < segments; i += 2) {
      const startAngle = (i / segments) * Math.PI * 2;
      const endAngle = ((i + 1) / segments) * Math.PI * 2;
      
      const startX = x + Math.cos(startAngle) * radius;
      const startY = y + Math.sin(startAngle) * radius;
      const endX = x + Math.cos(endAngle) * radius;
      const endY = y + Math.sin(endAngle) * radius;
      
      if (this.isSegmentVisible(startX, startY, endX, endY)) {
        g.moveTo(startX, startY).lineTo(endX, endY);
      }
    }
  }

  // Configuration methods
  public setShowConstraints(show: boolean): void { this.showConstraints = show; }
  public setShowTargets(show: boolean): void { this.showTargets = show; }
  public setShowLimits(show: boolean): void { this.showLimits = show; }

  public setColors(colors: {
    constraintBone?: number;
    targetBone?: number;
    limit?: number;
  }): void {
    if (colors.constraintBone !== undefined) this.constraintBoneColor = colors.constraintBone;
    if (colors.targetBone !== undefined) this.targetBoneColor = colors.targetBone;
    if (colors.limit !== undefined) this.limitColor = colors.limit;
  }

  public setAlphas(alphas: {
    constraintBone?: number;
    targetBone?: number;
    limit?: number;
  }): void {
    if (alphas.constraintBone !== undefined) this.constraintBoneAlpha = alphas.constraintBone;
    if (alphas.targetBone !== undefined) this.targetBoneAlpha = alphas.targetBone;
    if (alphas.limit !== undefined) this.limitAlpha = alphas.limit;
  }
}
