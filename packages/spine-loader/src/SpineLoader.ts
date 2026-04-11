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
} from '@esotericsoftware/spine-pixi-v8';
import { Application, Assets, Texture } from 'pixi.js';

/**
 * Lenient attachment loader that skips missing atlas regions instead of
 * throwing. In production game pipelines, a shared atlas often covers
 * many skeletons, and any individual skeleton may reference regions
 * that live in a different atlas or haven't been packed yet. spine-core's
 * default AtlasAttachmentLoader hard-throws on any lookup miss, which
 * makes the entire skeleton fail to parse. This subclass catches those
 * throws and returns an attachment with no region - the slot renders
 * nothing for that attachment, which matches real runtime behavior.
 */
class LenientAtlasAttachmentLoader extends AtlasAttachmentLoader {
  private missingRegions: string[] = [];

  newRegionAttachment(skin: any, name: string, path: string, sequence: any): RegionAttachment {
    try {
      return super.newRegionAttachment(skin, name, path, sequence);
    } catch (err: any) {
      if (err?.message?.includes('Region not found')) {
        this.missingRegions.push(path);
        // Return an attachment with no region. It won't render but won't crash.
        return new RegionAttachment(name, path);
      }
      throw err;
    }
  }

  newMeshAttachment(skin: any, name: string, path: string, sequence: any): MeshAttachment {
    try {
      return super.newMeshAttachment(skin, name, path, sequence);
    } catch (err: any) {
      if (err?.message?.includes('Region not found')) {
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
  private app: Application;

  constructor(app: Application) {
    this.app = app;
  }

  /**
   * Load Spine files from remote URLs (simplified approach similar to widget)
   * @param jsonUrl URL to the JSON file
   * @param atlasUrl URL to the atlas file
   * @returns Spine instance or null
   */
  public async loadSpineFromUrls(jsonUrl: string, atlasUrl: string): Promise<Spine | null> {
    try {
      // Generate unique aliases for caching
      const timestamp = Date.now();
      const atlasAlias = `atlas-${timestamp}-${atlasUrl}`;
      const jsonAlias = `json-${timestamp}-${jsonUrl}`;
      
      // Add assets to PIXI
      Assets.add({ alias: atlasAlias, src: atlasUrl });
      Assets.add({ alias: jsonAlias, src: jsonUrl });
      
      // First, fetch the atlas to extract image URLs
      const atlasResponse = await fetch(atlasUrl);
      if (!atlasResponse.ok) {
        throw new Error(`Failed to fetch atlas: ${atlasResponse.statusText}`);
      }
      const atlasText = await atlasResponse.text();
      
      // Extract and add image assets
      const imageUrls = this.extractImageUrlsFromAtlas(atlasText, atlasUrl);

      // Pre-flight: verify every atlas page has a resolvable URL.
      // extractImageUrlsFromAtlas populates keys for both "page.png" and "page"
      // (base without extension), so we only need to check that at least one
      // matching key exists for each page name declared in the atlas.
      const urlAtlasPageNames = this.extractImageNamesFromAtlas(atlasText);
      const availableUrlKeys = Object.keys(imageUrls);
      const missingUrlPages = urlAtlasPageNames.filter(pageName => {
        if (availableUrlKeys.includes(pageName)) return false;
        const dotIdx = pageName.lastIndexOf('.');
        const pageBase = dotIdx > 0 ? pageName.substring(0, dotIdx) : pageName;
        return !availableUrlKeys.includes(pageBase);
      });
      if (missingUrlPages.length > 0) {
        const expected = missingUrlPages.map(p => {
          const dotIdx = p.lastIndexOf('.');
          const base = dotIdx > 0 ? p.substring(0, dotIdx) : p;
          return `"${p}" (or ${base}.<png|jpg|webp|…>)`;
        }).join(', ');
        throw new Error(
          `Atlas references ${missingUrlPages.length} texture page(s) that could not be resolved: ${expected}. ` +
          `Ensure all texture pages are available at the same base URL as the atlas.`
        );
      }

      // Add image assets
      for (const [imageName, imageUrl] of Object.entries(imageUrls)) {
        const imageAlias = `${timestamp}-${imageName}`;
        Assets.add({ alias: imageAlias, src: imageUrl });
      }
      
      // Load all assets
      const allAliases = [atlasAlias, jsonAlias, ...Object.keys(imageUrls).map(name => `${timestamp}-${name}`)];
      await Assets.load(allAliases);
      
      // Fetch JSON data
      const jsonResponse = await fetch(jsonUrl);
      if (!jsonResponse.ok) {
        throw new Error(`Failed to fetch JSON: ${jsonResponse.statusText}`);
      }
      let skeletonData = await jsonResponse.json();
      
      // Check for Spine version compatibility
      if (skeletonData && skeletonData.spine && skeletonData.spine.startsWith('4.1')) {
        console.warn('[spine-loader] Rewriting skeleton Spine version from 4.1 to 4.2.0');
        skeletonData.spine = '4.2.0';
      }

      // Create texture atlas
      const spineAtlas = new TextureAtlas(atlasText);
      
      // Assign textures to atlas pages
      for (const page of spineAtlas.pages) {
        const pageName = page.name;
        const imageAlias = `${timestamp}-${pageName}`;
        const texture = await Assets.load(imageAlias);
        
        if (!texture) {
          // Try without extension
          const nameWithoutExt = pageName.substring(0, pageName.lastIndexOf('.'));
          const altAlias = `${timestamp}-${nameWithoutExt}`;
          const altTexture = await Assets.load(altAlias);
          
          if (!altTexture) {
            console.warn(`[spine-loader] Missing texture for page: ${pageName} - slots on this page will not render`);
            continue;
          }

          page.setTexture(SpineTexture.from(altTexture.source));
        } else {
          page.setTexture(SpineTexture.from(texture.source));
        }
      }
      
      // Create attachment loader and skeleton
      const atlasLoader = new LenientAtlasAttachmentLoader(spineAtlas);
      const skeletonJson = new SkeletonJson(atlasLoader);
      const skeletonDataObj = skeletonJson.readSkeletonData(skeletonData);

      if (atlasLoader.getMissingRegions().length > 0) {
        console.warn(
          `[spine-loader] ${atlasLoader.getMissingRegions().length} atlas region(s) not found and skipped: ` +
          atlasLoader.getMissingRegions().slice(0, 10).join(', ') +
          (atlasLoader.getMissingRegions().length > 10 ? '...' : ''),
        );
      }

      // Workaround for spine-pixi-v8: see initializeSequenceAttachments doc.
      this.initializeSequenceAttachments(skeletonDataObj);

      // Create spine instance with autoUpdate disabled until initialised.
      const spineInstance = new Spine({ skeletonData: skeletonDataObj, autoUpdate: false });
      spineInstance.skeleton.setToSetupPose();
      spineInstance.skeleton.updateWorldTransform(Physics.update);
      spineInstance.autoUpdate = true;
      return spineInstance;
      
    } catch (error) {
      throw error;
    } finally {
      // Note: We don't unload assets here as they might be needed for the spine instance
    }
  }

  /**
   * Decide whether the line at `index` is a page-header line.
   *
   * A page header is any non-property line whose next non-blank
   * line starts with `size:`. This is a robust definition for
   * every atlas flavour we care about:
   *
   * - Modern Spine export (compact, tab-indented or unindented
   *   properties): page name on its own, followed by `size:`.
   * - Legacy v3 / v4 export: same, sometimes with an `index:` line
   *   above the `size:`. The lookahead skips blanks so a stray
   *   blank line between pages doesn't fool it.
   * - Absolute URL page names (https://...) - worked-around: the
   *   old check used line.includes(':'), which rejected any URL.
   *   The lookahead form doesn't care what's in the page name.
   *
   * Region lines are rejected because the next non-blank line
   * after a region starts with `bounds:` / `xy:` / `rotate:` -
   * never `size:`.
   */
  private isPageHeaderLine(lines: string[], index: number): boolean {
    const line = lines[index].trim();
    if (line === '') return false;
    // A page header never starts with a property key itself.
    if (line.startsWith('size:')) return false;
    for (let j = index + 1; j < lines.length; j++) {
      const next = lines[j].trim();
      if (next === '') continue;
      return next.startsWith('size:');
    }
    return false;
  }

  /**
   * Extract image URLs from atlas content, resolving relative paths.
   * Returns a map keyed by both "name.ext" and "name" so callers can
   * look up with or without the extension.
   */
  private extractImageUrlsFromAtlas(atlasText: string, atlasUrl: string): Record<string, string> {
    const lines = atlasText.split('\n');
    const imageUrls: Record<string, string> = {};
    const atlasBaseUrl = atlasUrl.substring(0, atlasUrl.lastIndexOf('/') + 1);

    for (let i = 0; i < lines.length; i++) {
      if (!this.isPageHeaderLine(lines, i)) continue;
      const name = lines[i].trim();
      const imageUrl = this.resolveImageUrl(name, atlasBaseUrl);
      imageUrls[name] = imageUrl;
      const dotIdx = name.lastIndexOf('.');
      if (dotIdx > 0) {
        imageUrls[name.substring(0, dotIdx)] = imageUrl;
      }
    }

    return imageUrls;
  }

  /**
   * Resolve image URL relative to atlas URL
   * @param imageName The image name from the atlas
   * @param atlasBaseUrl The base URL of the atlas file
   * @returns Full URL to the image
   */
  private resolveImageUrl(imageName: string, atlasBaseUrl: string): string {
    // If the image name is already a full URL, return it
    if (imageName.startsWith('http://') || imageName.startsWith('https://')) {
      return imageName;
    }
    
    // Otherwise, resolve it relative to the atlas URL
    return atlasBaseUrl + imageName;
  }

  public async loadSpineFiles(files: FileList): Promise<Spine | null> {
    try {
      const acceptedFiles = Array.from(files);

      // Initialize tracking variables
      let atlasFile: File | undefined;
      let jsonFile: File | undefined;
      let skelFile: File | undefined;
      let imageFiles: File[] = [];
      
      // First pass - categorize files
      acceptedFiles.forEach((file) => {
        const fileName = file.name;

        if (fileName.endsWith('.atlas')) {
          atlasFile = file;
        } else if (fileName.endsWith('.json')) {
          jsonFile = file;
        } else if (fileName.endsWith('.skel')) {
          skelFile = file;
        } else if (file.type.startsWith('image/') ||
                  fileName.endsWith('.png') ||
                  fileName.endsWith('.jpg') ||
                  fileName.endsWith('.jpeg') ||
                  fileName.endsWith('.webp') ||
                  fileName.endsWith('.ktx2') ||
                  fileName.endsWith('.basis')) {
          imageFiles.push(file);
        }
      });
      
      // Validate required files
      if (!atlasFile) {
        throw new Error('Missing atlas file (.atlas). Please include an atlas file with your Spine data.');
      }
      
      if (!jsonFile && !skelFile) {
        throw new Error('Missing skeleton file (.json or .skel). Please include a skeleton file with your Spine data.');
      }
      
      if (imageFiles.length === 0) {
        throw new Error('Missing image files. Please include image files referenced by your atlas.');
      }

      // --- Pre-flight bundle validation ---

      // 1. Atlas page coverage: every page name in the atlas must be matched by
      //    an uploaded image file (exact filename OR same base name with a
      //    different extension, since rewriteAtlasImageNames handles the swap).
      const rawAtlasText = await this.readFileAsText(atlasFile);
      const atlasPageNames = this.extractImageNamesFromAtlas(rawAtlasText);
      const uploadedFileNames = imageFiles.map(f => this.getFileName(f.name));

      const missingPages = atlasPageNames.filter(pageName => {
        // Exact match
        if (uploadedFileNames.includes(pageName)) return false;
        // Base-name match (different extension)
        const dotIdx = pageName.lastIndexOf('.');
        const pageBase = dotIdx > 0 ? pageName.substring(0, dotIdx) : pageName;
        return !uploadedFileNames.some(f => {
          const fDot = f.lastIndexOf('.');
          const fBase = fDot > 0 ? f.substring(0, fDot) : f;
          return fBase === pageBase;
        });
      });

      if (missingPages.length > 0) {
        const expected = missingPages.map(p => {
          const dotIdx = p.lastIndexOf('.');
          const base = dotIdx > 0 ? p.substring(0, dotIdx) : p;
          return `"${p}" (or ${base}.<png|jpg|webp|ktx2|…>)`;
        }).join(', ');
        console.warn(
          `[spine-loader] ${missingPages.length} atlas page(s) not provided: ${expected}. ` +
          `Slots using regions from those pages will not render.`,
        );
      }

      // 2. JSON-only checks (not applicable to binary .skel bundles).
      if (jsonFile) {
        const jsonText = await this.readFileAsText(jsonFile);
        let parsedSkel: any;
        try {
          parsedSkel = JSON.parse(jsonText);
        } catch {
          // Invalid JSON will be caught again below with a proper message; skip checks.
          parsedSkel = null;
        }

        if (parsedSkel) {
          // 2a. Spine version check.
          const spineVersion: string | undefined = parsedSkel?.skeleton?.spine;
          if (spineVersion) {
            if (!spineVersion.startsWith('4.2') && !spineVersion.startsWith('4.1')) {
              console.warn(
                `[spine-loader] Pre-flight warning: skeleton was exported with Spine ${spineVersion}. ` +
                `This runtime targets Spine 4.2 (4.1 is auto-rewritten). ` +
                `Behaviour may be incorrect or the loader may crash.`
              );
            }
          }

          // 2b. Sequence attachment check.
          const skins: any[] = parsedSkel?.skins ?? [];
          const hasSequence = skins.some(skin => {
            const attachments: Record<string, any> = skin?.attachments ?? {};
            return Object.values(attachments).some(slotAttachments =>
              Object.values(slotAttachments as Record<string, any>).some(
                (att: any) => att && 'sequence' in att
              )
            );
          });
          if (hasSequence) {
            console.warn(
              '[spine-loader] Pre-flight note: skeleton contains sequence attachments (Spine 4.2 feature). ' +
              'Ensure you are using a Spine 4.2-compatible runtime.'
            );
          }
        }
      }

      // --- End pre-flight validation ---

      // Read atlas content and rewrite image references to match actual uploaded files
      // (rawAtlasText was already read above during pre-flight validation)
      const imageFileNames = imageFiles.map(f => this.getFileName(f.name));
      const atlasText = this.rewriteAtlasImageNames(rawAtlasText, imageFileNames);

      // Load skeleton data
      let skeletonData;
      const isBinary = !!skelFile;
      
      if (skelFile) {
        skeletonData = await this.readFileAsArrayBuffer(skelFile);
      } else if (jsonFile) {
        const jsonText = await this.readFileAsText(jsonFile);
        try {
          skeletonData = JSON.parse(jsonText);
          
          // Check for Spine 4.1 vs 4.2 version
          if (skeletonData && skeletonData.spine && skeletonData.spine.startsWith('4.1')) {
            console.warn('[spine-loader] Rewriting skeleton Spine version from 4.1 to 4.2.0');
            skeletonData.spine = '4.2.0';
          }
        } catch {
          throw new Error("Invalid JSON format in skeleton file");
        }
      }
      
      // Decode each image file directly via the browser's native image
      // decoder. createImageBitmap dispatches on the actual file bytes
      // rather than the URL extension, so png/jpg/jpeg/webp all work
      // uniformly. We then hand the resulting ImageBitmap to Texture.from,
      // which wraps it as a real ImageSource.
      //
      // We deliberately bypass Pixi's Assets loader-parser chain for
      // raster images here. That chain dispatches on URL extension, and
      // base64 data: URLs (which the previous implementation used) have
      // no extension. The result on .webp pages was that loadBundle came
      // back with a half-initialised Texture object whose `_source` was
      // never populated; the truthy check below passed, then the renderer
      // exploded inside Batcher.break on the first frame trying to read
      // `texture._source`. createImageBitmap + Texture.from sidesteps the
      // parser chain entirely.
      //
      // Compressed textures (.ktx2 / .basis) still go through the Pixi
      // loader because they need the dedicated transcoders.
      const textures: Record<string, Texture> = {};
      const compressedAssetBundle: Record<string, any> = {};
      const compressedBlobUrls: string[] = [];

      for (const imageFile of imageFiles) {
        const fileName = this.getFileName(imageFile.name);
        const dotIdx = fileName.lastIndexOf('.');
        const baseName = dotIdx > 0 ? fileName.substring(0, dotIdx) : '';
        const isCompressed = fileName.endsWith('.ktx2') || fileName.endsWith('.basis');

        if (isCompressed) {
          const blobUrl = URL.createObjectURL(imageFile);
          compressedBlobUrls.push(blobUrl);
          const parser = fileName.endsWith('.ktx2') ? 'loadKTX2' : 'loadBasis';
          const entry = { src: blobUrl, loadParser: parser };
          compressedAssetBundle[fileName] = entry;
          if (baseName) compressedAssetBundle[baseName] = entry;
        } else {
          // createImageBitmap throws on a corrupted / wrong-format file,
          // which is what we want - it surfaces a real "this image is not
          // a valid png/jpg/webp" error to the user instead of silently
          // producing a stub texture that explodes at render time.
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

      // Create spine asset
      return await this.createSpineAsset(skeletonData, atlasText, textures, isBinary);

    } catch (error) {
      throw error;
    }
  }

  private getFileName(path: string): string {
    // Extract just the filename without path
    return path.split('/').pop() || path;
  }
  
  /**
   * Rewrite atlas image references to match actual uploaded filenames.
   * Handles format substitution (e.g. atlas says "symbols.png" but file is "symbols.ktx2").
   */
  private rewriteAtlasImageNames(atlasText: string, availableFileNames: string[]): string {
    const atlasImageNames = this.extractImageNamesFromAtlas(atlasText);
    let rewritten = atlasText;

    for (const atlasName of atlasImageNames) {
      // Already have an exact match - no rewrite needed
      if (availableFileNames.includes(atlasName)) continue;

      const dotIdx = atlasName.lastIndexOf('.');
      const baseName = dotIdx > 0 ? atlasName.substring(0, dotIdx) : atlasName;

      // Find an uploaded file with the same base name but different extension
      const match = availableFileNames.find(f => {
        const fDot = f.lastIndexOf('.');
        const fBase = fDot > 0 ? f.substring(0, fDot) : f;
        return fBase === baseName;
      });

      if (match) {
        console.warn(`[spine-loader] Atlas image substitution: "${atlasName}" -> "${match}"`);
        // Replace only the page-header line (the image filename line before "size:")
        // Use a line-level replace to avoid accidentally replacing region names
        rewritten = rewritten.split('\n').map(line => {
          if (line.trim() === atlasName) return line.replace(atlasName, match);
          return line;
        }).join('\n');
      }
    }

    return rewritten;
  }

  /**
   * Extract page-header names from an atlas file.
   *
   * Implemented via `isPageHeaderLine` so this helper and its twin
   * `extractImageUrlsFromAtlas` can't drift - both use the same
   * lookahead rule. See `isPageHeaderLine` for the definition.
   */
  private extractImageNamesFromAtlas(atlasText: string): string[] {
    const lines = atlasText.split('\n');
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
    isBinary: boolean
  ): Promise<Spine> {
    // Create atlas
    const spineAtlas = new TextureAtlas(atlasText);
    
    // Process each page in the atlas
    for (const page of spineAtlas.pages) {
      const pageName = page.name;
      
      // Try different ways to match the texture
      let texture = textures[pageName];
      
      if (!texture) {
        // Try without path
        const baseFileName = this.getFileName(pageName);
        texture = textures[baseFileName];
        
        if (!texture) {
          // Try without extension
          const baseNameWithoutExt = baseFileName.substring(0, baseFileName.lastIndexOf('.'));
          if (baseNameWithoutExt) {
            texture = textures[baseNameWithoutExt];
          }
        }
      }

      if (!texture) {
        console.warn(`[spine-loader] Missing texture for page: ${pageName} - slots on this page will not render`);
        continue;
      }

      // Create SpineTexture from the PIXI Texture
      const spineTexture = SpineTexture.from(texture.source);

      // Set the texture for the page
      page.setTexture(spineTexture);
    }

    // Create attachment loader
    const atlasLoader = new LenientAtlasAttachmentLoader(spineAtlas);

    // Create skeleton data
    let skeletonData: SkeletonData | undefined = undefined;

    if(isBinary) {
      const skeletonBinary = new SkeletonBinary(atlasLoader);
      skeletonData = skeletonBinary.readSkeletonData(data);
    } else {
      const skeletonJson = new SkeletonJson(atlasLoader);
      skeletonData = skeletonJson.readSkeletonData(data);
    }

    if (atlasLoader.getMissingRegions().length > 0) {
      console.warn(
        `[spine-loader] ${atlasLoader.getMissingRegions().length} atlas region(s) not found and skipped: ` +
        atlasLoader.getMissingRegions().slice(0, 10).join(', ') +
        (atlasLoader.getMissingRegions().length > 10 ? '...' : ''),
      );
    }

    // Workaround for spine-pixi-v8: see initializeSequenceAttachments doc.
    this.initializeSequenceAttachments(skeletonData!);

    // Create spine instance.
    // Disable autoUpdate initially so the ticker doesn't fire before the
    // skeleton has been fully initialised with a world-transform pass.
    const spineInstance = new Spine({ skeletonData, autoUpdate: false });

    // Force setup pose + initial world transform so every bone, slot and
    // physics constraint is in a valid state before PixiJS ever tries to
    // collect renderables from this object.  Without this, skeletons with
    // many empty slots or physics constraints can crash with
    // "null is not an object (evaluating 'renderable.renderPipeId')"
    // because the render pipeline encounters uninitialised attachment data.
    spineInstance.skeleton.setToSetupPose();
    spineInstance.skeleton.updateWorldTransform(Physics.update);

    // Now safe to let the ticker drive updates.
    spineInstance.autoUpdate = true;

    return spineInstance;
  }

  /**
   * Workaround for a spine-pixi-v8 initialization gap with sequence attachments.
   *
   * Spine 4.2 introduced "sequence" attachments - region/mesh attachments that
   * cycle through N atlas regions over time (animated sprite frames). The
   * runtime stores the resolved frame regions on `attachment.sequence.regions[]`,
   * and `Sequence.apply(slot, attachment)` is the thing that copies
   * `regions[setupIndex]` into `attachment.region` so the renderer has something
   * to draw.
   *
   * The catch: `Sequence.apply` is only ever called from inside
   * `AnimationState.apply()` when a `SequenceTimeline` runs - i.e. on the next
   * animation tick, not at construction time. spine-pixi-v8's
   * `AtlasAttachmentLoader.newRegionAttachment` / `newMeshAttachment` paths
   * populate `sequence.regions[]` but leave `attachment.region` itself
   * `undefined`. If anything renders the spine instance before the first tick
   * (e.g. our viewer's first paint), the renderer dereferences
   * `attachment.region.texture._source` on `undefined` and crashes deep inside
   * the batcher / RenderTargetSystem with the cryptic
   * `Cannot read properties of undefined (reading '_source')`.
   *
   * Mirror what `Sequence.apply` would do, eagerly, before the first render:
   * for every attachment with a sequence and no current region, copy the
   * setup-frame region into `attachment.region` and call `updateRegion()`.
   * Subsequent SequenceTimeline applies (if any) take over from frame 2 onward
   * and behave normally.
   */
  private initializeSequenceAttachments(skeletonData: SkeletonData): void {
    for (const skin of skeletonData.skins) {
      // Skin.attachments is an array indexed by slot index, each entry an
      // object keyed by attachment name. We iterate every entry defensively;
      // some slot indices may be unset (sparse).
      const slotMap = (skin as unknown as { attachments: Array<Record<string, any>> }).attachments;
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
          const setupIndex = Math.min(sequence.setupIndex ?? 0, regions.length - 1);
          const setupRegion = regions[setupIndex];
          if (!setupRegion) continue;
          attachment.region = setupRegion;
          if (typeof attachment.updateRegion === 'function') {
            attachment.updateRegion();
          }
        }
      }
    }
  }
}