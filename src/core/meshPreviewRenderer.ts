export interface MeshPreviewInput {
  worldVertices: Float32Array;
  triangles: number[];
  vertexCount: number;
  deformOffsets: Float32Array;
  meshPixelArea: number;
  textureCanvas?: HTMLCanvasElement;
}

export interface MeshProblem {
  type: 'overclustered' | 'invisible-deform';
  severity: 'warning' | 'error';
}

export interface MeshPreviewResult {
  dataUrl: string;
  densityScore: number;
  deformVisibility: number;
  maxDeformPx: number;
  meshPixelArea: number;
  problems: MeshProblem[];
}

const CANVAS_SIZE = 500;
const PADDING = 20;
const DRAW_SIZE = CANVAS_SIZE - PADDING * 2;

const BG_COLOR = '#0E1117';
const NORMAL_STROKE = 'rgba(45, 212, 168, 0.5)';
const PROBLEM_FILL = 'rgba(248, 113, 113, 0.25)';
const PROBLEM_STROKE = '#F87171';
const DEFORM_COLOR = '#FBBF24';

export function renderMeshPreview(input: MeshPreviewInput): MeshPreviewResult {
  const { worldVertices, triangles, vertexCount, deformOffsets, meshPixelArea } = input;

  // 1. Compute bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < vertexCount; i++) {
    const x = worldVertices[i * 2];
    const y = worldVertices[i * 2 + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const meshW = maxX - minX || 1;
  const meshH = maxY - minY || 1;

  // 2. Fit transform: scale into DRAW_SIZE area, flip Y
  const scale = Math.min(DRAW_SIZE / meshW, DRAW_SIZE / meshH);
  const scaledW = meshW * scale;
  const scaledH = meshH * scale;
  const offsetX = PADDING + (DRAW_SIZE - scaledW) / 2;
  const offsetY = PADDING + (DRAW_SIZE - scaledH) / 2;

  const toCanvasX = (wx: number) => offsetX + (wx - minX) * scale;
  const toCanvasY = (wy: number) => offsetY + (maxY - wy) * scale; // flip Y

  // 3. Analyze triangles
  const triangleCount = triangles.length / 3;
  const idealArea = (meshW * meshH) / (triangleCount || 1);
  const overclusteredSet = new Set<number>();

  for (let t = 0; t < triangleCount; t++) {
    const i0 = triangles[t * 3];
    const i1 = triangles[t * 3 + 1];
    const i2 = triangles[t * 3 + 2];

    const x0 = worldVertices[i0 * 2], y0 = worldVertices[i0 * 2 + 1];
    const x1 = worldVertices[i1 * 2], y1 = worldVertices[i1 * 2 + 1];
    const x2 = worldVertices[i2 * 2], y2 = worldVertices[i2 * 2 + 1];

    const area = 0.5 * Math.abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0));
    if (area < idealArea * 0.15) {
      overclusteredSet.add(t);
    }
  }

  const densityScore = triangleCount > 0 ? overclusteredSet.size / triangleCount : 0;

  // 4. Analyze deformation
  let maxDeformPx = 0;
  if (deformOffsets.length > 0) {
    for (let i = 0; i < deformOffsets.length / 2; i++) {
      const dx = deformOffsets[i * 2];
      const dy = deformOffsets[i * 2 + 1];
      const disp = Math.sqrt(dx * dx + dy * dy);
      if (disp > maxDeformPx) maxDeformPx = disp;
    }
  }

  const meshSize = Math.sqrt(meshPixelArea) || 1;
  const deformVisibility = maxDeformPx / meshSize;

  // Collect problems
  const problems: MeshProblem[] = [];
  if (overclusteredSet.size > 0) {
    problems.push({
      type: 'overclustered',
      severity: densityScore > 0.5 ? 'error' : 'warning',
    });
  }
  if (deformOffsets.length > 0 && deformVisibility < 0.02) {
    problems.push({
      type: 'invisible-deform',
      severity: 'warning',
    });
  }

  // 5. Render to offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Draw texture background if available
  // Flip X to match the Y-flipped wireframe (toCanvasY inverts Y, changing handedness)
  if (input.textureCanvas) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.translate(offsetX + scaledW, offsetY);
    ctx.scale(-1, 1);
    ctx.drawImage(input.textureCanvas, 0, 0, scaledW, scaledH);
    ctx.restore();
  }

  // Draw triangles
  for (let t = 0; t < triangleCount; t++) {
    const i0 = triangles[t * 3];
    const i1 = triangles[t * 3 + 1];
    const i2 = triangles[t * 3 + 2];

    const cx0 = toCanvasX(worldVertices[i0 * 2]);
    const cy0 = toCanvasY(worldVertices[i0 * 2 + 1]);
    const cx1 = toCanvasX(worldVertices[i1 * 2]);
    const cy1 = toCanvasY(worldVertices[i1 * 2 + 1]);
    const cx2 = toCanvasX(worldVertices[i2 * 2]);
    const cy2 = toCanvasY(worldVertices[i2 * 2 + 1]);

    ctx.beginPath();
    ctx.moveTo(cx0, cy0);
    ctx.lineTo(cx1, cy1);
    ctx.lineTo(cx2, cy2);
    ctx.closePath();

    if (overclusteredSet.has(t)) {
      ctx.fillStyle = PROBLEM_FILL;
      ctx.fill();
      ctx.strokeStyle = PROBLEM_STROKE;
      ctx.lineWidth = 1.5;
    } else {
      ctx.strokeStyle = NORMAL_STROKE;
      ctx.lineWidth = 1;
    }
    ctx.stroke();
  }

  // Draw deformation arrows if deform exists
  if (deformOffsets.length > 0 && maxDeformPx > 0) {
    ctx.strokeStyle = DEFORM_COLOR;
    ctx.lineWidth = 1.5;
    const arrowScale = scale * Math.min(5, 20 / maxDeformPx); // scale arrows for visibility

    for (let i = 0; i < Math.min(vertexCount, deformOffsets.length / 2); i++) {
      const dx = deformOffsets[i * 2];
      const dy = deformOffsets[i * 2 + 1];
      const disp = Math.sqrt(dx * dx + dy * dy);
      if (disp < 0.1) continue;

      const sx = toCanvasX(worldVertices[i * 2]);
      const sy = toCanvasY(worldVertices[i * 2 + 1]);
      const ex = sx + dx * arrowScale;
      const ey = sy - dy * arrowScale; // flip Y for canvas

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Arrowhead
      const angle = Math.atan2(ey - sy, ex - sx);
      const headLen = 4;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - headLen * Math.cos(angle - 0.4), ey - headLen * Math.sin(angle - 0.4));
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - headLen * Math.cos(angle + 0.4), ey - headLen * Math.sin(angle + 0.4));
      ctx.stroke();
    }
  }

  const dataUrl = canvas.toDataURL('image/png');

  return {
    dataUrl,
    densityScore,
    deformVisibility,
    maxDeformPx,
    meshPixelArea,
    problems,
  };
}
