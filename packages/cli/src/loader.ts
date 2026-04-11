/**
 * Headless Spine loader: parses .json/.skel + .atlas from the filesystem
 * using spine-core directly, without pixi or any DOM/canvas dependency.
 *
 * Returns a SkeletonData that can be fed into the analysis pipeline.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import {
  AtlasAttachmentLoader,
  SkeletonBinary,
  SkeletonData,
  SkeletonJson,
  TextureAtlas,
} from '@esotericsoftware/spine-core';

/**
 * A no-op texture that satisfies spine-core's atlas page resolution without
 * needing an actual image decoder. CLI analysis only reads bone/slot/attachment
 * metadata, not pixel data, so we never need the actual texture bytes.
 */
class StubTexture {
  width: number;
  height: number;

  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }

  setFilters(): void {}
  setWraps(): void {}
  dispose(): void {}
}

export interface LoadResult {
  skeletonData: SkeletonData;
  atlasText: string;
  skeletonName: string;
}

/**
 * Load a Spine skeleton from .json or .skel + .atlas on disk.
 */
export function loadSkeleton(skeletonPath: string, atlasPath: string): LoadResult {
  const atlasText = readFileSync(atlasPath, 'utf8');

  // spine-core v4.2 TextureAtlas constructor takes only the atlas text.
  // Pages need their textures set manually after construction.
  const atlas = new TextureAtlas(atlasText);

  // Assign a stub texture to each atlas page so region lookups don't NPE.
  // We never actually render anything, so the stub is sufficient.
  for (const page of atlas.pages) {
    const stub = new StubTexture(page.width, page.height);
    page.setTexture(stub as any);
  }
  const attachmentLoader = new AtlasAttachmentLoader(atlas);

  const isBinary = skeletonPath.endsWith('.skel');
  let skeletonData: SkeletonData;

  if (isBinary) {
    const skelBuf = readFileSync(skeletonPath);
    const binary = new SkeletonBinary(attachmentLoader);
    skeletonData = binary.readSkeletonData(new Uint8Array(skelBuf.buffer, skelBuf.byteOffset, skelBuf.byteLength));
  } else {
    const jsonText = readFileSync(skeletonPath, 'utf8');
    let jsonData = JSON.parse(jsonText);

    // Spine 4.1 -> 4.2 compat
    if (jsonData?.skeleton?.spine?.startsWith('4.1')) {
      jsonData.skeleton.spine = '4.2.0';
    }

    const json = new SkeletonJson(attachmentLoader);
    skeletonData = json.readSkeletonData(jsonData);
  }

  const skeletonName = skeletonData.name || basename(skeletonPath, isBinary ? '.skel' : '.json');

  return { skeletonData, atlasText, skeletonName };
}
