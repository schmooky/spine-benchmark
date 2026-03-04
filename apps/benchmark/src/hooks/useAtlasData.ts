import { useMemo } from 'react';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { RegionAttachment, MeshAttachment, TextureAtlasRegion, TextureAtlasPage } from '@esotericsoftware/spine-core';

export interface AtlasRegionInfo {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  degrees: number;
}

export interface AtlasPageInfo {
  name: string;
  width: number;
  height: number;
  imageSrc: string;
  regions: AtlasRegionInfo[];
}

export interface AtlasSnapshot {
  pages: AtlasPageInfo[];
}

const EMPTY_SNAPSHOT: AtlasSnapshot = { pages: [] };

function extractImageSrc(page: TextureAtlasPage): string {
  try {
    const texture = page.texture;
    if (!texture) return '';
    const img = texture.getImage();
    if (!img) return '';
    // Direct HTMLImageElement (has .src)
    if (img instanceof HTMLImageElement) return img.src;
    // Pixi TextureSource - resource may be HTMLImageElement
    if (img.resource) {
      if (img.resource instanceof HTMLImageElement) return img.resource.src;
      // ImageBitmap fallback - draw to canvas
      if (typeof ImageBitmap !== 'undefined' && img.resource instanceof ImageBitmap) {
        const canvas = document.createElement('canvas');
        canvas.width = img.resource.width;
        canvas.height = img.resource.height;
        canvas.getContext('2d')!.drawImage(img.resource, 0, 0);
        return canvas.toDataURL();
      }
    }
    // If img itself is an ImageBitmap
    if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      return canvas.toDataURL();
    }
  } catch {
    // texture may not be ready
  }
  return '';
}

function collectAtlasData(spineInstance: Spine): AtlasSnapshot {
  const skeleton = spineInstance.skeleton;
  const skins = skeleton.data.skins;
  if (!skins || skins.length === 0) return EMPTY_SNAPSHOT;

  const pageMap = new Map<string, TextureAtlasPage>();

  for (const skin of skins) {
    const entries = skin.getAttachments();
    for (const entry of entries) {
      const attachment = entry.attachment;
      if (!(attachment instanceof RegionAttachment) && !(attachment instanceof MeshAttachment)) continue;
      const region = attachment.region as TextureAtlasRegion | null;
      if (!region?.page) continue;
      const page = region.page;
      if (!pageMap.has(page.name)) {
        pageMap.set(page.name, page);
      }
    }
  }

  const pages: AtlasPageInfo[] = [];
  for (const [, page] of pageMap) {
    const imageSrc = extractImageSrc(page);
    const regions: AtlasRegionInfo[] = [];
    if (page.regions) {
      for (const region of page.regions) {
        regions.push({
          name: region.name,
          x: region.x,
          y: region.y,
          width: region.degrees === 90 ? region.height : region.width,
          height: region.degrees === 90 ? region.width : region.height,
          degrees: region.degrees,
        });
      }
    }
    pages.push({
      name: page.name,
      width: page.width,
      height: page.height,
      imageSrc,
      regions,
    });
  }

  return { pages };
}

export function useAtlasData(spineInstance: Spine | null): AtlasSnapshot {
  return useMemo(() => {
    if (!spineInstance) return EMPTY_SNAPSHOT;
    try {
      return collectAtlasData(spineInstance);
    } catch {
      return EMPTY_SNAPSHOT;
    }
  }, [spineInstance]);
}
