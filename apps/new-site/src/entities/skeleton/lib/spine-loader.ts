/**
 * Spine asset loader, vendored from @spine-benchmark/spine-loader so this app
 * has no build-order dependency on the monorepo's publishable packages. It
 * turns a dropped FileList (.json/.skel + .atlas + images) into a ready-to-mount
 * pixi Spine instance, and is intentionally lenient about missing atlas regions.
 */
import {
  AtlasAttachmentLoader,
  Physics,
  RegionAttachment,
  MeshAttachment,
  SkeletonBinary,
  SkeletonData,
  SkeletonJson,
  Spine,
  SpineTexture,
  TextureAtlas,
} from "@esotericsoftware/spine-pixi-v8";
import { Assets, Texture } from "pixi.js";

class LenientAtlasAttachmentLoader extends AtlasAttachmentLoader {
  private missingRegions: string[] = [];

  newRegionAttachment(skin: any, name: string, path: string, sequence: any): RegionAttachment {
    try {
      return super.newRegionAttachment(skin, name, path, sequence);
    } catch (err: any) {
      if (err?.message?.includes("Region not found")) {
        this.missingRegions.push(path);
        return new RegionAttachment(name, path);
      }
      throw err;
    }
  }

  newMeshAttachment(skin: any, name: string, path: string, sequence: any): MeshAttachment {
    try {
      return super.newMeshAttachment(skin, name, path, sequence);
    } catch (err: any) {
      if (err?.message?.includes("Region not found")) {
        this.missingRegions.push(path);
        return new MeshAttachment(name, path);
      }
      throw err;
    }
  }

  getMissingRegions(): string[] {
    return this.missingRegions;
  }
}

export class SpineLoader {
  private isPageHeaderLine(lines: string[], index: number): boolean {
    const line = lines[index].trim();
    if (line === "") return false;
    if (line.startsWith("size:")) return false;
    for (let j = index + 1; j < lines.length; j++) {
      const next = lines[j].trim();
      if (next === "") continue;
      return next.startsWith("size:");
    }
    return false;
  }

  public async loadSpineFiles(files: FileList | File[]): Promise<Spine | null> {
    const acceptedFiles = Array.from(files);

    let atlasFile: File | undefined;
    let jsonFile: File | undefined;
    let skelFile: File | undefined;
    const imageFiles: File[] = [];

    acceptedFiles.forEach((file) => {
      const fileName = file.name;
      if (fileName.endsWith(".atlas")) {
        atlasFile = file;
      } else if (fileName.endsWith(".json")) {
        jsonFile = file;
      } else if (fileName.endsWith(".skel")) {
        skelFile = file;
      } else if (
        file.type.startsWith("image/") ||
        fileName.endsWith(".png") ||
        fileName.endsWith(".jpg") ||
        fileName.endsWith(".jpeg") ||
        fileName.endsWith(".webp") ||
        fileName.endsWith(".ktx2") ||
        fileName.endsWith(".basis")
      ) {
        imageFiles.push(file);
      }
    });

    if (!atlasFile) {
      throw new Error(
        "Missing atlas file (.atlas). Please include an atlas file with your Spine data.",
      );
    }
    if (!jsonFile && !skelFile) {
      throw new Error(
        "Missing skeleton file (.json or .skel). Please include a skeleton file with your Spine data.",
      );
    }
    if (imageFiles.length === 0) {
      throw new Error(
        "Missing image files. Please include image files referenced by your atlas.",
      );
    }

    const rawAtlasText = await this.readFileAsText(atlasFile);
    const imageFileNames = imageFiles.map((f) => this.getFileName(f.name));
    const atlasText = this.rewriteAtlasImageNames(rawAtlasText, imageFileNames);

    let skeletonData: any;
    const isBinary = !!skelFile;

    if (skelFile) {
      skeletonData = await this.readFileAsArrayBuffer(skelFile);
    } else if (jsonFile) {
      const jsonText = await this.readFileAsText(jsonFile);
      try {
        skeletonData = JSON.parse(jsonText);
        if (skeletonData?.spine?.startsWith?.("4.1")) {
          skeletonData.spine = "4.2.0";
        }
      } catch {
        throw new Error("Invalid JSON format in skeleton file");
      }
    }

    const textures: Record<string, Texture> = {};
    const compressedAssetBundle: Record<string, any> = {};
    const compressedBlobUrls: string[] = [];

    for (const imageFile of imageFiles) {
      const fileName = this.getFileName(imageFile.name);
      const dotIdx = fileName.lastIndexOf(".");
      const baseName = dotIdx > 0 ? fileName.substring(0, dotIdx) : "";
      const isCompressed =
        fileName.endsWith(".ktx2") || fileName.endsWith(".basis");

      if (isCompressed) {
        const blobUrl = URL.createObjectURL(imageFile);
        compressedBlobUrls.push(blobUrl);
        const parser = fileName.endsWith(".ktx2") ? "loadKTX2" : "loadBasis";
        const entry = { src: blobUrl, loadParser: parser };
        compressedAssetBundle[fileName] = entry;
        if (baseName) compressedAssetBundle[baseName] = entry;
      } else {
        const bitmap = await createImageBitmap(imageFile);
        const texture = Texture.from(bitmap);
        textures[fileName] = texture;
        if (baseName) textures[baseName] = texture;
      }
    }

    if (Object.keys(compressedAssetBundle).length > 0) {
      const bundleName = `spineCompressed-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      Assets.addBundle(bundleName, compressedAssetBundle);
      const compressedTextures = await Assets.loadBundle(bundleName);
      Object.assign(textures, compressedTextures);
      for (const blobUrl of compressedBlobUrls) URL.revokeObjectURL(blobUrl);
    }

    return await this.createSpineAsset(skeletonData, atlasText, textures, isBinary);
  }

  private getFileName(path: string): string {
    return path.split("/").pop() || path;
  }

  private rewriteAtlasImageNames(
    atlasText: string,
    availableFileNames: string[],
  ): string {
    const atlasImageNames = this.extractImageNamesFromAtlas(atlasText);
    let rewritten = atlasText;

    for (const atlasName of atlasImageNames) {
      if (availableFileNames.includes(atlasName)) continue;
      const dotIdx = atlasName.lastIndexOf(".");
      const baseName = dotIdx > 0 ? atlasName.substring(0, dotIdx) : atlasName;
      const match = availableFileNames.find((f) => {
        const fDot = f.lastIndexOf(".");
        const fBase = fDot > 0 ? f.substring(0, fDot) : f;
        return fBase === baseName;
      });
      if (match) {
        rewritten = rewritten
          .split("\n")
          .map((line) =>
            line.trim() === atlasName ? line.replace(atlasName, match) : line,
          )
          .join("\n");
      }
    }
    return rewritten;
  }

  private extractImageNamesFromAtlas(atlasText: string): string[] {
    const lines = atlasText.split("\n");
    const imageNames: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (!this.isPageHeaderLine(lines, i)) continue;
      const name = lines[i].trim();
      if (!imageNames.includes(name)) imageNames.push(name);
    }
    return imageNames;
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  private async createSpineAsset(
    data: any,
    atlasText: string,
    textures: Record<string, Texture>,
    isBinary: boolean,
  ): Promise<Spine> {
    const spineAtlas = new TextureAtlas(atlasText);

    for (const page of spineAtlas.pages) {
      const pageName = page.name;
      let texture = textures[pageName];
      if (!texture) {
        const baseFileName = this.getFileName(pageName);
        texture = textures[baseFileName];
        if (!texture) {
          const baseNameWithoutExt = baseFileName.substring(
            0,
            baseFileName.lastIndexOf("."),
          );
          if (baseNameWithoutExt) texture = textures[baseNameWithoutExt];
        }
      }
      if (!texture) {
        console.warn(
          `[spine-loader] Missing texture for page: ${pageName} - slots on this page will not render`,
        );
        continue;
      }
      page.setTexture(SpineTexture.from(texture.source));
    }

    const atlasLoader = new LenientAtlasAttachmentLoader(spineAtlas);
    let skeletonData: SkeletonData | undefined;

    if (isBinary) {
      const skeletonBinary = new SkeletonBinary(atlasLoader);
      skeletonData = skeletonBinary.readSkeletonData(data);
    } else {
      const skeletonJson = new SkeletonJson(atlasLoader);
      skeletonData = skeletonJson.readSkeletonData(data);
    }

    this.initializeSequenceAttachments(skeletonData!);

    const spineInstance = new Spine({ skeletonData, autoUpdate: false });
    spineInstance.skeleton.setToSetupPose();
    spineInstance.skeleton.updateWorldTransform(Physics.update);
    spineInstance.autoUpdate = true;
    return spineInstance;
  }

  private initializeSequenceAttachments(skeletonData: SkeletonData): void {
    for (const skin of skeletonData.skins) {
      const slotMap = (skin as unknown as { attachments: Array<Record<string, any>> })
        .attachments;
      if (!slotMap) continue;
      for (let slotIndex = 0; slotIndex < slotMap.length; slotIndex++) {
        const attachmentsAtSlot = slotMap[slotIndex];
        if (!attachmentsAtSlot) continue;
        for (const name in attachmentsAtSlot) {
          const attachment = attachmentsAtSlot[name];
          const sequence = attachment?.sequence;
          if (!sequence || attachment.region != null) continue;
          const regions = sequence.regions;
          if (!regions || regions.length === 0) continue;
          const setupIndex = Math.min(
            sequence.setupIndex ?? 0,
            regions.length - 1,
          );
          const setupRegion = regions[setupIndex];
          if (!setupRegion) continue;
          attachment.region = setupRegion;
          if (typeof attachment.updateRegion === "function") {
            attachment.updateRegion();
          }
        }
      }
    }
  }
}
