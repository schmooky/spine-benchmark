import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { DebugLayer, DebugLayerOptions } from '../DebugLayer.js';

export interface IkConstraintDebugOptions extends DebugLayerOptions {
  boneColor?: number;
  targetColor?: number;
  startCircleColor?: number;
  startCircleRadius?: number;
  targetCircleRadius?: number;
  showBoneChain?: boolean;
  showTarget?: boolean;
  showStartCircle?: boolean;
}

export class IkConstraintDebugLayer extends DebugLayer {
  private boneColor: number;
  private targetColor: number;
  private startCircleColor: number;
  private startCircleRadius: number;
  private targetCircleRadius: number;
  
  private showBoneChain: boolean;
  private showTarget: boolean;
  private showStartCircle: boolean;

  constructor(options: IkConstraintDebugOptions) {
    super(options);
    
    this.boneColor = options.boneColor ?? 0x00ffff;
    this.targetColor = options.targetColor ?? 0x00ffff;
    this.startCircleColor = options.startCircleColor ?? 0x00ffff;
    this.startCircleRadius = options.startCircleRadius ?? 6;
    this.targetCircleRadius = options.targetCircleRadius ?? 10;
    
    this.showBoneChain = options.showBoneChain ?? true;
    this.showTarget = options.showTarget ?? true;
    this.showStartCircle = options.showStartCircle ?? true;
  }

  public update(spine: Spine): void {
    if (!this.isVisible) return;
    
    this.clear();
    const skeleton = spine.skeleton;
    const ikConstraints = skeleton.ikConstraints || [];

    for (const constraint of ikConstraints) {
      if (!constraint?.isActive?.()) continue;
      
      const bones = constraint.bones || [];
      if (bones.length === 0) continue;

      // Draw start circle at the first bone
      if (this.showStartCircle && bones.length > 0) {
        this.drawStartCircle(bones[0]);
      }

      // Draw bone chain
      if (this.showBoneChain) {
        this.drawBoneChain(bones);
      }

      // Draw connection to target and target itself
      if (this.showTarget && constraint.target) {
        this.drawTarget(bones[bones.length - 1], constraint.target);
      }
    }
  }

  private drawStartCircle(firstBone: any): void {
    if (!this.isCircleVisible(firstBone.worldX, firstBone.worldY, this.startCircleRadius)) return;

    const g = this.graphics;
    
    // Fill
    g.fill({ color: this.startCircleColor, alpha: this.alpha * 0.5 })
      .circle(firstBone.worldX, firstBone.worldY, this.startCircleRadius)
      .fill();
    
    // Stroke
    g.stroke({ 
      color: this.startCircleColor, 
      width: 2, 
      pixelLine: true, 
      alpha: this.alpha 
    })
      .circle(firstBone.worldX, firstBone.worldY, this.startCircleRadius);
  }

  private drawBoneChain(bones: any[]): void {
    const g = this.graphics;
    
    g.stroke({ 
      color: this.boneColor, 
      width: this.strokeWidth, 
      pixelLine: true, 
      alpha: this.alpha 
    });

    for (let i = 0; i < bones.length - 1; i++) {
      const b1 = bones[i];
      const b2 = bones[i + 1];
      
      if (this.isSegmentVisible(b1.worldX, b1.worldY, b2.worldX, b2.worldY)) {
        g.moveTo(b1.worldX, b1.worldY)
          .lineTo(b2.worldX, b2.worldY);
      }
    }
  }

  private drawTarget(lastBone: any, target: any): void {
    const tx = target.worldX;
    const ty = target.worldY;

    // Draw line from last bone to target
    if (this.isSegmentVisible(lastBone.worldX, lastBone.worldY, tx, ty)) {
      const g = this.graphics;
      g.stroke({ 
        color: this.targetColor, 
        width: this.strokeWidth, 
        pixelLine: true, 
        alpha: this.alpha 
      })
        .moveTo(lastBone.worldX, lastBone.worldY)
        .lineTo(tx, ty);
    }

    // Draw target circle with crosshair
    if (this.isCircleVisible(tx, ty, this.targetCircleRadius)) {
      const g = this.graphics;
      
      // Fill
      g.fill({ color: this.targetColor, alpha: this.alpha * 0.3 })
        .circle(tx, ty, this.targetCircleRadius)
        .fill();
      
      // Stroke circle
      g.stroke({ 
        color: this.targetColor, 
        width: 2, 
        pixelLine: true, 
        alpha: this.alpha 
      })
        .circle(tx, ty, this.targetCircleRadius);
      
      // Crosshair
      const crossSize = 5;
      g.moveTo(tx - crossSize, ty)
        .lineTo(tx + crossSize, ty)
        .moveTo(tx, ty - crossSize)
        .lineTo(tx, ty + crossSize);
    }
  }

  // Configuration methods
  public setShowBoneChain(show: boolean): void {
    this.showBoneChain = show;
  }

  public setShowTarget(show: boolean): void {
    this.showTarget = show;
  }

  public setShowStartCircle(show: boolean): void {
    this.showStartCircle = show;
  }

  public setColors(colors: {
    bone?: number;
    target?: number;
    startCircle?: number;
  }): void {
    if (colors.bone !== undefined) this.boneColor = colors.bone;
    if (colors.target !== undefined) this.targetColor = colors.target;
    if (colors.startCircle !== undefined) this.startCircleColor = colors.startCircle;
  }
}
