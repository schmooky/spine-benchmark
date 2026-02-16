import { Graphics } from 'pixi.js';
import { Spine, MeshAttachment } from '@esotericsoftware/spine-pixi-v8';
import { DebugLayer, DebugLayerOptions } from '../DebugLayer';

export interface MeshDebugOptions extends DebugLayerOptions {
  triangleColor?: number;
  hullColor?: number;
  vertexColor?: number;
  showTriangles?: boolean;
  showHull?: boolean;
  showVertices?: boolean;
  triangleAlpha?: number;
  hullAlpha?: number;
  vertexAlpha?: number;
  vertexRadius?: number;
}

const PROBLEM_COLOR = 0xF87171;
const PROBLEM_FILL_ALPHA = 0.25;
const HIGHLIGHT_COLOR = 0x2DD4A8;
const HIGHLIGHT_ALPHA = 0.6;
const DIM_ALPHA = 0.08;
const OVERCLUSTERED_THRESHOLD = 0.15;

export class MeshDebugLayer extends DebugLayer {
  private triangleColor: number;
  private hullColor: number;
  private vertexColor: number;
  private showTriangles: boolean;
  private showHull: boolean;
  private showVertices: boolean;
  private triangleAlpha: number;
  private hullAlpha: number;
  private vertexAlpha: number;
  private vertexRadius: number;
  private highlightedSlotName: string | null = null;

  constructor(options: MeshDebugOptions) {
    super(options);
    this.triangleColor = options.triangleColor ?? 0x00FF00;
    this.hullColor = options.hullColor ?? 0xFF00FF;
    this.vertexColor = options.vertexColor ?? 0xFFFF00;
    this.showTriangles = options.showTriangles ?? true;
    this.showHull = options.showHull ?? true;
    this.showVertices = options.showVertices ?? false;
    this.triangleAlpha = options.triangleAlpha ?? 0.3;
    this.hullAlpha = options.hullAlpha ?? 0.5;
    this.vertexAlpha = options.vertexAlpha ?? 0.6;
    this.vertexRadius = options.vertexRadius ?? 2;
  }

  public setHighlightedSlot(slotName: string | null): void {
    this.highlightedSlotName = slotName;
  }

  public getHighlightedSlot(): string | null {
    return this.highlightedSlotName;
  }

  public update(spine: Spine): void {
    if (!this.isVisible) return;
    this.clear();

    const skeleton = spine.skeleton;

    // Process each slot to find mesh attachments
    for (const slot of skeleton.slots) {
      const attachment = slot.getAttachment();
      if (attachment instanceof MeshAttachment) {
        const verticesLength = attachment.worldVerticesLength;
        if (verticesLength === 0) continue;

        const vertices = new Float32Array(verticesLength);
        attachment.computeWorldVertices(slot, 0, verticesLength, vertices, 0, 2);

        const isHighlighted = this.highlightedSlotName !== null && slot.data.name === this.highlightedSlotName;
        const isDimmed = this.highlightedSlotName !== null && !isHighlighted;

        if (isHighlighted) {
          // Draw highlighted mesh with problem detection
          if (this.showTriangles && attachment.triangles && attachment.triangles.length > 0) {
            this.drawHighlightedTriangles(this.graphics, vertices, attachment.triangles);
          }
          if (this.showHull && verticesLength >= 4) {
            this.drawHull(this.graphics, vertices, HIGHLIGHT_ALPHA);
          }
          if (this.showVertices && verticesLength >= 2) {
            this.drawVertices(this.graphics, vertices);
          }
        } else if (!isDimmed) {
          // Draw normal mesh (skip entirely if another mesh is highlighted)
          if (this.showTriangles && attachment.triangles && attachment.triangles.length > 0) {
            this.drawTriangles(this.graphics, vertices, attachment.triangles);
          }
          if (this.showHull && verticesLength >= 4) {
            this.drawHull(this.graphics, vertices);
          }
          if (this.showVertices && verticesLength >= 2) {
            this.drawVertices(this.graphics, vertices);
          }
        }
      }
    }
  }

  private drawHighlightedTriangles(g: Graphics, vertices: Float32Array, triangles: Array<number>): void {
    if (triangles.length === 0 || vertices.length === 0) return;

    const triangleCount = triangles.length / 3;

    // Compute bounding box for ideal area calculation
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < vertices.length; i += 2) {
      const x = vertices[i], y = vertices[i + 1];
      if (!isFinite(x) || !isFinite(y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const meshW = maxX - minX || 1;
    const meshH = maxY - minY || 1;
    const idealArea = (meshW * meshH) / (triangleCount || 1);

    // Detect overclustered triangles
    const overclustered = new Set<number>();
    for (let t = 0; t < triangleCount; t++) {
      const i0 = triangles[t * 3], i1 = triangles[t * 3 + 1], i2 = triangles[t * 3 + 2];
      const x0 = vertices[i0 * 2], y0 = vertices[i0 * 2 + 1];
      const x1 = vertices[i1 * 2], y1 = vertices[i1 * 2 + 1];
      const x2 = vertices[i2 * 2], y2 = vertices[i2 * 2 + 1];
      if (!isFinite(x0) || !isFinite(y0) || !isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) continue;
      const area = 0.5 * Math.abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0));
      if (area < idealArea * OVERCLUSTERED_THRESHOLD) {
        overclustered.add(t);
      }
    }

    // Pass 1: Draw normal triangles with teal stroke (same proven pattern as drawTriangles)
    g.stroke({ width: 1, color: HIGHLIGHT_COLOR, alpha: HIGHLIGHT_ALPHA, pixelLine: true });
    for (let t = 0; t < triangleCount; t++) {
      if (overclustered.has(t)) continue;
      const i0 = triangles[t * 3], i1 = triangles[t * 3 + 1], i2 = triangles[t * 3 + 2];
      const v1x = i0 * 2, v1y = i0 * 2 + 1;
      const v2x = i1 * 2, v2y = i1 * 2 + 1;
      const v3x = i2 * 2, v3y = i2 * 2 + 1;
      if (v1y >= vertices.length || v2y >= vertices.length || v3y >= vertices.length) continue;
      if (!isFinite(vertices[v1x]) || !isFinite(vertices[v1y]) ||
          !isFinite(vertices[v2x]) || !isFinite(vertices[v2y]) ||
          !isFinite(vertices[v3x]) || !isFinite(vertices[v3y])) continue;
      g.moveTo(vertices[v1x], vertices[v1y])
       .lineTo(vertices[v2x], vertices[v2y])
       .lineTo(vertices[v3x], vertices[v3y])
       .lineTo(vertices[v1x], vertices[v1y]);
    }

    // Pass 2: Draw overclustered triangles with red stroke
    g.stroke({ width: 1.5, color: PROBLEM_COLOR, alpha: 0.8, pixelLine: true });
    for (let t = 0; t < triangleCount; t++) {
      if (!overclustered.has(t)) continue;
      const i0 = triangles[t * 3], i1 = triangles[t * 3 + 1], i2 = triangles[t * 3 + 2];
      const v1x = i0 * 2, v1y = i0 * 2 + 1;
      const v2x = i1 * 2, v2y = i1 * 2 + 1;
      const v3x = i2 * 2, v3y = i2 * 2 + 1;
      if (v1y >= vertices.length || v2y >= vertices.length || v3y >= vertices.length) continue;
      if (!isFinite(vertices[v1x]) || !isFinite(vertices[v1y]) ||
          !isFinite(vertices[v2x]) || !isFinite(vertices[v2y]) ||
          !isFinite(vertices[v3x]) || !isFinite(vertices[v3y])) continue;
      g.moveTo(vertices[v1x], vertices[v1y])
       .lineTo(vertices[v2x], vertices[v2y])
       .lineTo(vertices[v3x], vertices[v3y])
       .lineTo(vertices[v1x], vertices[v1y]);
    }
  }

  private drawTriangles(g: Graphics, vertices: Float32Array, triangles: Array<number>, alphaOverride?: number): void {
    if (triangles.length === 0 || vertices.length === 0) return;

    g.stroke({ width: 1, color: this.triangleColor, alpha: alphaOverride ?? this.triangleAlpha, pixelLine: true });

    // Draw each triangle
    for (let i = 0; i < triangles.length; i += 3) {
      // Ensure we don't access out of bounds
      if (i + 2 >= triangles.length) break;

      const v1 = triangles[i] * 2;
      const v2 = triangles[i + 1] * 2;
      const v3 = triangles[i + 2] * 2;

      // Ensure vertex indices are within bounds
      if (v1 + 1 >= vertices.length || v2 + 1 >= vertices.length || v3 + 1 >= vertices.length) continue;

      // Skip invalid coordinates (NaN or Infinity)
      if (!isFinite(vertices[v1]) || !isFinite(vertices[v1 + 1]) ||
          !isFinite(vertices[v2]) || !isFinite(vertices[v2 + 1]) ||
          !isFinite(vertices[v3]) || !isFinite(vertices[v3 + 1])) continue;

      g.moveTo(vertices[v1], vertices[v1 + 1])
       .lineTo(vertices[v2], vertices[v2 + 1])
       .lineTo(vertices[v3], vertices[v3 + 1])
       .lineTo(vertices[v1], vertices[v1 + 1]);
    }
  }
  
  private drawHull(g: Graphics, vertices: Float32Array, alphaOverride?: number): void {
    if (vertices.length < 4) return;

    g.stroke({ width: 1.5, color: this.hullColor, alpha: alphaOverride ?? this.hullAlpha, pixelLine: true });
    
    // Draw hull as a polygon connecting all vertices in order
    if (!isFinite(vertices[0]) || !isFinite(vertices[1])) return;
    g.moveTo(vertices[0], vertices[1]);
    
    let validPoints = 1;
    for (let i = 2; i < vertices.length; i += 2) {
      // Skip invalid vertices
      if (i + 1 >= vertices.length) break;
      if (!isFinite(vertices[i]) || !isFinite(vertices[i + 1])) continue;
      g.lineTo(vertices[i], vertices[i + 1]);
      validPoints++;
    }
    
    // Only close polygon if we have enough valid points
    if (validPoints >= 3) {
      g.lineTo(vertices[0], vertices[1]); // Close the polygon
    }
  }
  
  private drawVertices(g: Graphics, vertices: Float32Array): void {
    if (vertices.length < 2) return;
    
    g.fill({ color: this.vertexColor, alpha: this.vertexAlpha });
    
    let drawnVertices = 0;
    for (let i = 0; i < vertices.length; i += 2) {
      // Skip invalid vertices
      if (i + 1 >= vertices.length) break;
      // Skip non-finite coordinates
      if (!isFinite(vertices[i]) || !isFinite(vertices[i + 1])) continue;
      if (this.isCircleVisible(vertices[i], vertices[i + 1], this.vertexRadius)) {
        g.circle(vertices[i], vertices[i + 1], this.vertexRadius).fill();
        drawnVertices++;
      }
    }
    
    // drew drawnVertices vertices
  }
  
  // Configuration methods
  public setShowTriangles(show: boolean): void { this.showTriangles = show; }
  public setShowHull(show: boolean): void { this.showHull = show; }
  public setShowVertices(show: boolean): void { this.showVertices = show; }
  
  public setColors(colors: { 
    triangle?: number; 
    hull?: number; 
    vertex?: number; 
  }): void {
    if (colors.triangle !== undefined) this.triangleColor = colors.triangle;
    if (colors.hull !== undefined) this.hullColor = colors.hull;
    if (colors.vertex !== undefined) this.vertexColor = colors.vertex;
  }
  
  public setAlphas(alphas: { 
    triangle?: number; 
    hull?: number; 
    vertex?: number; 
  }): void {
    if (alphas.triangle !== undefined) this.triangleAlpha = alphas.triangle;
    if (alphas.hull !== undefined) this.hullAlpha = alphas.hull;
    if (alphas.vertex !== undefined) this.vertexAlpha = alphas.vertex;
  }
  
  public setVertexRadius(radius: number): void { this.vertexRadius = radius; }
}