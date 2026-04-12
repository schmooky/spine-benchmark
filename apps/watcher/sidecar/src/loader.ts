/**
 * Headless Spine loader: parses .json/.skel + .atlas from the filesystem
 * using spine-core directly, without pixi or any DOM/canvas dependency.
 *
 * Mirrors packages/cli/src/loader.ts but with an added Spine 4.2 version
 * gate for the watcher's requirements.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import {
  AtlasAttachmentLoader,
  SkeletonBinary,
  type SkeletonData,
  SkeletonJson,
  TextureAtlas,
} from '@esotericsoftware/spine-core';

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
  spineVersion: string;
}

export function loadSkeleton(skeletonPath: string, atlasPath: string): LoadResult {
  const atlasText = readFileSync(atlasPath, 'utf8');
  const atlas = new TextureAtlas(atlasText);

  for (const page of atlas.pages) {
    const stub = new StubTexture(page.width, page.height);
    page.setTexture(stub as any);
  }
  const attachmentLoader = new AtlasAttachmentLoader(atlas);

  const isBinary = skeletonPath.endsWith('.skel');
  let skeletonData: SkeletonData;
  let rawVersion = '(unknown)';

  if (isBinary) {
    const skelBuf = readFileSync(skeletonPath);
    const binary = new SkeletonBinary(attachmentLoader);
    skeletonData = binary.readSkeletonData(
      new Uint8Array(skelBuf.buffer, skelBuf.byteOffset, skelBuf.byteLength),
    );
    rawVersion = (skeletonData as any).version || '(unknown)';
  } else {
    const jsonText = readFileSync(skeletonPath, 'utf8');
    const jsonData = JSON.parse(jsonText);
    rawVersion = jsonData?.skeleton?.spine || '(unknown)';

    const json = new SkeletonJson(attachmentLoader);
    skeletonData = json.readSkeletonData(jsonData);
  }

  const name = skeletonData.name || basename(skeletonPath, isBinary ? '.skel' : '.json');
  skeletonData.name = name;

  return { skeletonData, spineVersion: rawVersion };
}
