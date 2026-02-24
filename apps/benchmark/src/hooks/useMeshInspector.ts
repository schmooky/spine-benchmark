import { useEffect, useRef, useState } from 'react';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { MeshAttachment, TextureAtlasRegion } from '@esotericsoftware/spine-core';
import { MeshPreviewInput } from '../core/meshPreviewRenderer';

export interface MeshSlotInfo {
  index: number;
  slotName: string;
  attachmentName: string;
  vertexCount: number;
  triangleCount: number;
  boneCount: number;
  isDeformed: boolean;
}

export interface MeshSnapshot {
  meshes: MeshSlotInfo[];
  totalMeshes: number;
  totalVertices: number;
  totalTriangles: number;
  weightedCount: number;
  deformedCount: number;
}

const EMPTY_SNAPSHOT: MeshSnapshot = {
  meshes: [],
  totalMeshes: 0,
  totalVertices: 0,
  totalTriangles: 0,
  weightedCount: 0,
  deformedCount: 0,
};

const THROTTLE_MS = 100;

function collectMeshSnapshot(skeleton: { drawOrder: any[] }): MeshSnapshot {
  const meshes: MeshSlotInfo[] = [];
  let totalVertices = 0;
  let totalTriangles = 0;
  let weightedCount = 0;
  let deformedCount = 0;

  for (let i = 0; i < skeleton.drawOrder.length; i++) {
    const slot = skeleton.drawOrder[i];
    const attachment = slot.getAttachment();
    if (!attachment || !(attachment instanceof MeshAttachment)) continue;

    const vertexCount = attachment.worldVerticesLength / 2;
    const triangleCount = attachment.triangles.length / 3;
    const boneCount = attachment.bones?.length ?? 0;
    const isDeformed = slot.deform.length > 0;

    totalVertices += vertexCount;
    totalTriangles += triangleCount;
    if (boneCount > 0) weightedCount++;
    if (isDeformed) deformedCount++;

    meshes.push({
      index: i,
      slotName: slot.data.name,
      attachmentName: attachment.name,
      vertexCount,
      triangleCount,
      boneCount,
      isDeformed,
    });
  }

  return {
    meshes,
    totalMeshes: meshes.length,
    totalVertices,
    totalTriangles,
    weightedCount,
    deformedCount,
  };
}

function getDrawableImage(page: { texture?: { getImage?: () => any } | null }): CanvasImageSource | null {
  try {
    const texture = page.texture;
    if (!texture) return null;
    const img = texture.getImage?.();
    if (!img) return null;
    if (img instanceof HTMLImageElement) return img;
    if (img.resource) {
      if (img.resource instanceof HTMLImageElement) return img.resource;
      if (typeof ImageBitmap !== 'undefined' && img.resource instanceof ImageBitmap) return img.resource;
    }
    if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) return img;
  } catch {
    // texture may not be ready
  }
  return null;
}

function cropRegionTexture(attachment: MeshAttachment): HTMLCanvasElement | undefined {
  const region = attachment.region as TextureAtlasRegion | null;
  if (!region?.page) return undefined;

  const pageImg = getDrawableImage(region.page);
  if (!pageImg) return undefined;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;

  if (region.degrees === 90) {
    const atlasW = region.height;
    const atlasH = region.width;
    canvas.width = region.width;
    canvas.height = region.height;
    ctx.translate(0, canvas.height);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(pageImg, region.x, region.y, atlasW, atlasH, 0, 0, atlasW, atlasH);
  } else {
    canvas.width = region.width;
    canvas.height = region.height;
    ctx.drawImage(pageImg, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
  }

  return canvas;
}

export function captureMeshData(
  spineInstance: Spine,
  slotIndex: number,
): MeshPreviewInput | null {
  const skeleton = spineInstance.skeleton;
  const slot = skeleton.drawOrder[slotIndex];
  if (!slot) return null;

  const attachment = slot.getAttachment();
  if (!attachment || !(attachment instanceof MeshAttachment)) return null;

  const verticesLength = attachment.worldVerticesLength;
  if (verticesLength === 0) return null;

  const worldVertices = new Float32Array(verticesLength);
  attachment.computeWorldVertices(slot, 0, verticesLength, worldVertices, 0, 2);

  const vertexCount = verticesLength / 2;

  // Snapshot deform offsets
  const deformOffsets = slot.deform.length > 0
    ? new Float32Array(slot.deform)
    : new Float32Array(0);

  // Compute bounding box area
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < vertexCount; i++) {
    const x = worldVertices[i * 2];
    const y = worldVertices[i * 2 + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const meshPixelArea = (maxX - minX) * (maxY - minY);

  const textureCanvas = cropRegionTexture(attachment);

  return {
    worldVertices,
    triangles: Array.from(attachment.triangles),
    vertexCount,
    deformOffsets,
    meshPixelArea,
    textureCanvas,
  };
}

export function useMeshInspector(spineInstance: Spine | null): MeshSnapshot {
  const [snapshot, setSnapshot] = useState<MeshSnapshot>(EMPTY_SNAPSHOT);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    if (!spineInstance) {
      setSnapshot(EMPTY_SNAPSHOT);
      return;
    }

    let rafId: number;
    let running = true;

    const tick = () => {
      if (!running) return;
      const now = performance.now();
      if (now - lastUpdateRef.current >= THROTTLE_MS) {
        lastUpdateRef.current = now;
        try {
          const result = collectMeshSnapshot(spineInstance.skeleton);
          setSnapshot(result);
        } catch {
          // skeleton may not be ready yet
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
    };
  }, [spineInstance]);

  return snapshot;
}
