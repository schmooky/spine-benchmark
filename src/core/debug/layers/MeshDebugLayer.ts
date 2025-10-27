import { Graphics } from 'pixi.js';
import { Spine, MeshAttachment } from '@esotericsoftware/spine-pixi-v8';
import { DebugLayer, DebugLayerOptions } from '../DebugLayer';

interface MeshDebugOptions extends DebugLayerOptions {
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
  
  public update(spine: Spine): void {
    if (!this.isVisible) return;
    this.clear();
    
    const skeleton = spine.skeleton;
    
    for (const slot of skeleton.slots) {
      const attachment = slot.getAttachment();
      if (attachment instanceof MeshAttachment) {
        const verticesLength = attachment.worldVerticesLength;
        if (verticesLength === 0) continue;
        
        const vertices = new Float32Array(verticesLength);
        attachment.computeWorldVertices(slot, 0, verticesLength, vertices, 0, 2);
        
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
  
  private drawTriangles(g: Graphics, vertices: Float32Array, triangles: Array<number>): void {
    if (triangles.length === 0 || vertices.length === 0) return;
    
    g.stroke({ width: 1, color: this.triangleColor, alpha: this.triangleAlpha, pixelLine: true });
    
    for (let i = 0; i < triangles.length; i += 3) {
      if (i + 2 >= triangles.length) break;
      
      const v1 = triangles[i] * 2;
      const v2 = triangles[i + 1] * 2;
      const v3 = triangles[i + 2] * 2;
      
      if (v1 + 1 >= vertices.length || v2 + 1 >= vertices.length || v3 + 1 >= vertices.length) continue;
      
      if (!isFinite(vertices[v1]) || !isFinite(vertices[v1 + 1]) ||
          !isFinite(vertices[v2]) || !isFinite(vertices[v2 + 1]) ||
          !isFinite(vertices[v3]) || !isFinite(vertices[v3 + 1])) continue;
      
      g.moveTo(vertices[v1], vertices[v1 + 1])
       .lineTo(vertices[v2], vertices[v2 + 1])
       .lineTo(vertices[v3], vertices[v3 + 1])
       .lineTo(vertices[v1], vertices[v1 + 1]);
    }
  }
  
  private drawHull(g: Graphics, vertices: Float32Array): void {
    if (vertices.length < 4) return;
    
    g.stroke({ width: 1.5, color: this.hullColor, alpha: this.hullAlpha, pixelLine: true });
    
    if (!isFinite(vertices[0]) || !isFinite(vertices[1])) return;
    g.moveTo(vertices[0], vertices[1]);
    
    let validPoints = 1;
    for (let i = 2; i < vertices.length; i += 2) {
      if (i + 1 >= vertices.length) break;
      if (!isFinite(vertices[i]) || !isFinite(vertices[i + 1])) continue;
      g.lineTo(vertices[i], vertices[i + 1]);
      validPoints++;
    }
    
    if (validPoints >= 3) {
      g.lineTo(vertices[0], vertices[1]);
    }
  }
  
  private drawVertices(g: Graphics, vertices: Float32Array): void {
    if (vertices.length < 2) return;
    
    g.fill({ color: this.vertexColor, alpha: this.vertexAlpha });
    
    let drawnVertices = 0;
    for (let i = 0; i < vertices.length; i += 2) {
      if (i + 1 >= vertices.length) break;
      if (!isFinite(vertices[i]) || !isFinite(vertices[i + 1])) continue;
      if (this.isCircleVisible(vertices[i], vertices[i + 1], this.vertexRadius)) {
        g.circle(vertices[i], vertices[i + 1], this.vertexRadius).fill();
        drawnVertices++;
      }
    }
    
    console.log(`MeshDebugLayer: Drew ${drawnVertices} vertices`);
  }
  
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