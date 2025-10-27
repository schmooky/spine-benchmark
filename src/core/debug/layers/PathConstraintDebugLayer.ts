import { Graphics } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { DebugLayer, DebugLayerOptions } from '../DebugLayer';

export interface PathConstraintDebugOptions extends DebugLayerOptions {
  /** Main path color */
  pathColor?: number;
  /** Start/End node color */
  startEndColor?: number;
  /** Lines from bones to nearest path point */
  boneConnectionColor?: number;
  /** Target bone marker color */
  targetColor?: number;

  showPath?: boolean;
  showStartEnd?: boolean;
  showBoneConnections?: boolean;
  showTarget?: boolean;

  /** Pixel radius for node dots placed along the path. Default 3. */
  pathDotRadius?: number;
  /** Stroke width used for the path. Falls back to DebugLayer.strokeWidth. */
  pathStrokeWidth?: number;
}

export class PathConstraintDebugLayer extends DebugLayer {
  private pathColor: number;
  private startEndColor: number;
  private boneConnectionColor: number;
  private targetColor: number;
  
  private showPath: boolean;
  private showStartEnd: boolean;
  private showBoneConnections: boolean;
  private showTarget: boolean;

  private pathDotRadius: number;
  private pathStrokeWidth?: number;

  constructor(options: PathConstraintDebugOptions) {
    super(options);
    this.pathColor = options.pathColor ?? 0xffa500;
    this.startEndColor = options.startEndColor ?? 0xffc266;
    this.boneConnectionColor = options.boneConnectionColor ?? 0xff8c00;
    this.targetColor = options.targetColor ?? 0xffa500;
    
    this.showPath = options.showPath ?? true;
    this.showStartEnd = options.showStartEnd ?? true;
    this.showBoneConnections = options.showBoneConnections ?? true;
    this.showTarget = options.showTarget ?? true;

    this.pathDotRadius = options.pathDotRadius ?? 3;
    this.pathStrokeWidth = options.pathStrokeWidth;
  }

  public update(spine: Spine): void {
    if (!this.isVisible) return;
    this.clear();

    const skeleton = spine.skeleton;
    const pathConstraints = skeleton.pathConstraints || [];

    for (const constraint of pathConstraints) {
      if (typeof constraint?.isActive === 'function' && !constraint.isActive()) continue;
      
      const world = constraint.world as number[] | undefined;
      if (!world || world.length < 3) continue;

      if (this.showPath) this.drawPath(world);
      if (this.showStartEnd) this.drawStartEndCircles(world);
      if (this.showBoneConnections) this.drawBoneConnections(constraint, world);
      if (this.showTarget && constraint.target?.bone) this.drawTarget(constraint.target.bone);
    }
  }

  private drawPath(world: number[]): void {
    if (!this.isPolylineVisible(world, 3, 0, 1)) return;

    const g = this.graphics;
    const width = this.pathStrokeWidth ?? this.strokeWidth;

    g.stroke({ color: this.pathColor, width, pixelLine: true, alpha: this.alpha })
      .moveTo(world[0], world[1]);

    for (let i = 3; i < world.length; i += 3) {
      const px = world[i];
      const py = world[i + 1];
      g.lineTo(px, py);
    }

    const r = this.pathDotRadius;
    if (r > 0) {
      g.stroke({ width: 0, alpha: 0 });
      for (let i = 0; i < world.length; i += 3) {
        const px = world[i];
        const py = world[i + 1];
        if (this.isCircleVisible(px, py, r)) {
          g.fill({ color: this.pathColor, alpha: this.alpha * 0.35 })
            .circle(px, py, r)
            .fill();
        }
      }
    }

    const arrowEvery = 9;
    const arrowSize = Math.max(4, width * 1.5);
    for (let i = 3; i < world.length; i += 3 * arrowEvery) {
      const sx = world[i - 3];
      const sy = world[i - 2];
      const tx = world[i];
      const ty = world[i + 1];
      this.drawArrowhead(sx, sy, tx, ty, arrowSize, this.pathColor, this.alpha * 0.9);
    }
  }

  private drawStartEndCircles(world: number[]): void {
    const g = this.graphics;
    const radius = 8;

    if (world.length >= 3 && this.isCircleVisible(world[0], world[1], radius)) {
      g.fill({ color: this.startEndColor, alpha: this.alpha * 0.6 })
        .circle(world[0], world[1], radius)
        .fill();
      g.stroke({ color: this.startEndColor, width: 2, pixelLine: true, alpha: this.alpha })
        .circle(world[0], world[1], radius);
    }

    const endX = world[world.length - 3];
    const endY = world[world.length - 2];
    if (this.isCircleVisible(endX, endY, radius)) {
      g.fill({ color: this.startEndColor, alpha: this.alpha * 0.6 })
        .circle(endX, endY, radius)
        .fill();
      g.stroke({ color: this.startEndColor, width: 2, pixelLine: true, alpha: this.alpha })
        .circle(endX, endY, radius);
    }
  }

  private drawBoneConnections(constraint: any, world: number[]): void {
    const bones = constraint.bones as any[];
    if (!bones || bones.length === 0) return;

    const g = this.graphics;
    g.stroke({ 
      color: this.boneConnectionColor, 
      width: Math.max(1, this.strokeWidth - 1), 
      pixelLine: true, 
      alpha: this.alpha * 0.6 
    });

    for (const bone of bones) {
      const bx = bone.worldX;
      const by = bone.worldY;

      let closestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < world.length; i += 3) {
        const dx = world[i] - bx;
        const dy = world[i + 1] - by;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist) {
          bestDist = d2;
          closestIdx = i;
        }
      }

      const px = world[closestIdx];
      const py = world[closestIdx + 1];

      if (this.isSegmentVisible(bx, by, px, py)) {
        g.moveTo(bx, by).lineTo(px, py);

        if (this.isCircleVisible(px, py, 2)) {
          g.fill({ color: this.boneConnectionColor, alpha: this.alpha * 0.8 })
            .circle(px, py, 2)
            .fill();
        }
      }
    }
  }

  private drawTarget(targetBone: any): void {
    const tx = targetBone.worldX;
    const ty = targetBone.worldY;
    const R = 15;
    if (!this.isCircleVisible(tx, ty, R)) return;

    const g = this.graphics;

    g.fill({ color: this.targetColor, alpha: this.alpha * 0.18 })
      .circle(tx, ty, R)
      .fill();

    g.stroke({ color: this.targetColor, width: this.strokeWidth, pixelLine: true, alpha: this.alpha })
      .circle(tx, ty, R)
      .moveTo(tx - R * 0.7, ty).lineTo(tx + R * 0.7, ty)
      .moveTo(tx, ty - R * 0.7).lineTo(tx, ty + R * 0.7);
  }

  private drawArrowhead(sx: number, sy: number, tx: number, ty: number, size: number, color: number, alpha: number) {
    const dx = tx - sx;
    const dy = ty - sy;
    const mag = Math.hypot(dx, dy);
    if (mag < 1e-4) return;

    const ux = dx / mag;
    const uy = dy / mag;
    const nx = -uy;
    const ny = ux;

    const baseX = tx - ux * size;
    const baseY = ty - uy * size;
    const bx1 = baseX + nx * (size * 0.5);
    const by1 = baseY + ny * (size * 0.5);
    const bx2 = baseX - nx * (size * 0.5);
    const by2 = baseY - ny * (size * 0.5);

    this.graphics
      .fill({ color, alpha })
      .poly([bx1, by1, bx2, by2, tx, ty])
      .fill();
  }

  public setShowPath(show: boolean): void { this.showPath = show; }
  public setShowStartEnd(show: boolean): void { this.showStartEnd = show; }
  public setShowBoneConnections(show: boolean): void { this.showBoneConnections = show; }
  public setShowTarget(show: boolean): void { this.showTarget = show; }

  public setColors(colors: {
    path?: number;
    startEnd?: number;
    boneConnection?: number;
    target?: number;
  }): void {
    if (colors.path !== undefined) this.pathColor = colors.path;
    if (colors.startEnd !== undefined) this.startEndColor = colors.startEnd;
    if (colors.boneConnection !== undefined) this.boneConnectionColor = colors.boneConnection;
    if (colors.target !== undefined) this.targetColor = colors.target;
  }

  public setPathStyle(opts: { dotRadius?: number; strokeWidth?: number }): void {
    if (opts.dotRadius !== undefined) this.pathDotRadius = opts.dotRadius;
    if (opts.strokeWidth !== undefined) this.pathStrokeWidth = opts.strokeWidth;
  }
}
