import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { DebugLayer, DebugLayerOptions } from '../DebugLayer';

export interface BoneDebugOptions extends DebugLayerOptions {
  boneColor?: number;
  jointColor?: number;
  jointRadius?: number;
  showBones?: boolean;
  showJoints?: boolean;
  showHierarchy?: boolean;

  /** Width of triangle base at bone start as fraction of bone length (default 0.25) */
  triangleBaseScale?: number;
  /** Minimum triangle base width in pixels (default 8) */
  triangleMinBase?: number;
  /** Maximum triangle base width in pixels (default 30) */
  triangleMaxBase?: number;
  /** Radius of circles drawn at bone start/end (default 3) */
  boneEndCircleRadius?: number;
}

export class BoneDebugLayer extends DebugLayer {
  private boneColor: number;
  private jointColor: number;
  private jointRadius: number;
  private showBones: boolean;
  private showJoints: boolean;
  private showHierarchy: boolean;

  private triangleBaseScale: number;
  private triangleMinBase: number;
  private triangleMaxBase: number;
  private boneEndCircleRadius: number;

  constructor(options: BoneDebugOptions) {
    super(options);

    this.boneColor = options.boneColor ?? 0xFFFFFF;
    this.jointColor = options.jointColor ?? 0xFFFFFF;
    this.jointRadius = options.jointRadius ?? 3;
    this.showBones = options.showBones ?? true;
    this.showJoints = options.showJoints ?? true;
    this.showHierarchy = options.showHierarchy ?? false;

    this.triangleBaseScale = options.triangleBaseScale ?? 0.25;
    this.triangleMinBase = options.triangleMinBase ?? 8;
    this.triangleMaxBase = options.triangleMaxBase ?? 30;
    this.boneEndCircleRadius = options.boneEndCircleRadius ?? 3;
  }

  public update(spine: Spine): void {
    if (!this.isVisible) return;

    this.clear();

    const skeleton = spine.skeleton;
    const bones = skeleton.bones || [];

    const g = this.graphics;

    if (this.showBones) {
      let drawn = 0;

      for (const bone of bones) {
        const sx = bone.worldX;
        const sy = bone.worldY;

        if (bone.parent) {
          const parentData = bone.parent.data;
          const parentLen = parentData?.length ?? 0;
          
          const parentEndX = bone.parent.worldX + bone.parent.a * parentLen;
          const parentEndY = bone.parent.worldY + bone.parent.c * parentLen;
          
          if (this.isSegmentVisible(sx, sy, parentEndX, parentEndY)) {
            g.stroke({ 
              color: 0xFFFFFF,
              width: 1,
              alpha: this.alpha * 0.5,
              pixelLine: true 
            })
              .moveTo(sx, sy)
              .lineTo(parentEndX, parentEndY);
          }
        }

        const len = bone.data?.length ?? 0;
        
        if (len < 1e-4) {
          if (this.isCircleVisible(sx, sy, this.boneEndCircleRadius)) {
            g.stroke({ 
              color: this.boneColor, 
              width: this.strokeWidth, 
              alpha: this.alpha, 
              pixelLine: true 
            })
              .circle(sx, sy, this.boneEndCircleRadius);
            
            g.fill({ color: this.boneColor, alpha: this.alpha * 0.3 })
              .circle(sx, sy, this.boneEndCircleRadius)
              .fill();
            
            drawn++;
          }
          continue;
        }

        let tx = sx + bone.a * len;
        let ty = sy + bone.c * len;

        const dx = tx - sx;
        const dy = ty - sy;
        const mag = Math.hypot(dx, dy);
        if (mag < 1e-4) continue;

        const ux = dx / mag;
        const uy = dy / mag;
        const nx = -uy;
        const ny = ux;

        const baseWidth = this.clamp(mag * this.triangleBaseScale, this.triangleMinBase, this.triangleMaxBase);

        const base1X = sx + nx * (baseWidth / 2);
        const base1Y = sy + ny * (baseWidth / 2);
        const base2X = sx - nx * (baseWidth / 2);
        const base2Y = sy - ny * (baseWidth / 2);
        
        const tipX = tx;
        const tipY = ty;

        const visible =
          this.isSegmentVisible(sx, sy, tx, ty) ||
          this.isSegmentVisible(base1X, base1Y, tipX, tipY) ||
          this.isSegmentVisible(base2X, base2Y, tipX, tipY) ||
          this.isCircleVisible(sx, sy, this.boneEndCircleRadius);
        
        if (!visible) continue;

        g.stroke({ 
          color: this.boneColor,
          width: this.strokeWidth, 
          alpha: this.alpha * 0.8, 
          pixelLine: true, 
          miterLimit: 2 
        })
          .poly([base1X, base1Y, tipX, tipY, base2X, base2Y])
          .closePath();

        g.fill({ color: this.boneColor, alpha: this.alpha * 0.2 })
          .poly([base1X, base1Y, tipX, tipY, base2X, base2Y])
          .fill();

        drawn++;
      }

      console.log(`BoneDebugLayer: Drew ${drawn} bones`);
    }

    if (this.showJoints) {
      g.stroke({ width: 1 });
      let drawnJoints = 0;

      for (const bone of bones) {
        const x = bone.worldX;
        const y = bone.worldY;

        if (this.isCircleVisible(x, y, this.jointRadius)) {
          g.stroke({ 
            color: this.jointColor, 
            width: 2,
            alpha: this.alpha, 
            pixelLine: true 
          })
            .circle(x, y, this.jointRadius);
          
          g.fill({ color: this.jointColor, alpha: this.alpha * 0.6 })
            .circle(x, y, this.jointRadius)
            .fill();
          
          drawnJoints++;
        }
      }

      console.log(`BoneDebugLayer: Drew ${drawnJoints} joints`);
    }
  }

  public setShowBones(show: boolean): void { this.showBones = show; }
  public setShowJoints(show: boolean): void { this.showJoints = show; }
  public setShowHierarchy(show: boolean): void { this.showHierarchy = show; }
  public setColors(colors: { bone?: number; joint?: number }): void {
    if (colors.bone !== undefined) this.boneColor = colors.bone;
    if (colors.joint !== undefined) this.jointColor = colors.joint;
  }
  public setJointRadius(radius: number): void { this.jointRadius = radius; }
  public setBoneEndCircleRadius(radius: number): void { this.boneEndCircleRadius = radius; }
  public setTriangleParams(opts: { 
    baseScale?: number;
    minBase?: number;
    maxBase?: number;
  }): void {
    if (opts.baseScale !== undefined) this.triangleBaseScale = opts.baseScale;
    if (opts.minBase !== undefined) this.triangleMinBase = opts.minBase;
    if (opts.maxBase !== undefined) this.triangleMaxBase = opts.maxBase;
  }

  private clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }
}