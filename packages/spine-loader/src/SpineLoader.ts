import {
  AtlasAttachmentLoader,
  Physics,
  SkeletonBinary,
  SkeletonData,
  SkeletonJson,
  Spine,
  SpineTexture,
  TextureAtlas,
} from '@esotericsoftware/spine-pixi-v8';
import { Application, Assets, Texture } from 'pixi.js';

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
      console.log('Loading Spine files from URLs:', { jsonUrl, atlasUrl });
      
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
      console.log('Extracted image URLs:', imageUrls);
      
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
        console.log('Updating Spine version from 4.1 to 4.2.0');
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
            console.error(`Missing texture for page: ${pageName}`);
            throw new Error(`Missing texture for page: ${pageName}`);
          }
          
          page.setTexture(SpineTexture.from(altTexture.source));
        } else {
          page.setTexture(SpineTexture.from(texture.source));
        }
      }
      
      // Create attachment loader and skeleton
      const atlasLoader = new AtlasAttachmentLoader(spineAtlas);
      const skeletonJson = new SkeletonJson(atlasLoader);
      const skeletonDataObj = skeletonJson.readSkeletonData(skeletonData);

      // Workaround for spine-pixi-v8: see initializeSequenceAttachments doc.
      this.initializeSequenceAttachments(skeletonDataObj);

      // Create spine instance with autoUpdate disabled until initialised.
      const spineInstance = new Spine({ skeletonData: skeletonDataObj, autoUpdate: false });
      spineInstance.skeleton.setToSetupPose();
      spineInstance.skeleton.updateWorldTransform(Physics.update);
      spineInstance.autoUpdate = true;
      return spineInstance;
      
    } catch (error) {
      console.error('Error loading Spine files from URLs:', error);
      throw error;
    } finally {
      // Note: We don't unload assets here as they might be needed for the spine instance
    }
  }

  /**
   * Extract image URLs from atlas content, resolving relative paths
   * @param atlasText The atlas file content
   * @param atlasUrl The URL of the atlas file (used to resolve relative paths)
   * @returns Map of image names to URLs
   */
  private extractImageUrlsFromAtlas(atlasText: string, atlasUrl: string): Record<string, string> {
    const lines = atlasText.split('\n');
    const imageUrls: Record<string, string> = {};
    const atlasBaseUrl = atlasUrl.substring(0, atlasUrl.lastIndexOf('/') + 1);
    
    let currentName = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line === '') continue;
      
      if (line.startsWith('size:')) {
        if (currentName) {
          // Construct full URL for the image
          const imageUrl = this.resolveImageUrl(currentName, atlasBaseUrl);
          imageUrls[currentName] = imageUrl;
          
          // Also add without extension
          const nameWithoutExt = currentName.substring(0, currentName.lastIndexOf('.'));
          if (nameWithoutExt) {
            imageUrls[nameWithoutExt] = imageUrl;
          }
        }
        currentName = '';
      } else if (currentName === '') {
        // If we don't have a current name and this line is not a property,
        // it must be an image name
        if (!line.includes(':')) {
          currentName = line;
        }
      }
    }
    
    // Add the last image name if we have one
    if (currentName) {
      const imageUrl = this.resolveImageUrl(currentName, atlasBaseUrl);
      imageUrls[currentName] = imageUrl;
      
      const nameWithoutExt = currentName.substring(0, currentName.lastIndexOf('.'));
      if (nameWithoutExt) {
        imageUrls[nameWithoutExt] = imageUrl;
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
      console.log('Processing files:', acceptedFiles.map(f => (f as any).fullPath || f.name).join(', '));
      
      // Initialize tracking variables
      let atlasFile: File | undefined;
      let jsonFile: File | undefined;
      let skelFile: File | undefined;
      let imageFiles: File[] = [];
      
      // First pass - categorize files
      acceptedFiles.forEach((file) => {
        const fileName = file.name;
        const fullPath = (file as any).fullPath || file.name;
        
        if (fileName.endsWith('.atlas')) {
          atlasFile = file;
          console.log("Atlas file found:", fullPath);
        } else if (fileName.endsWith('.json')) {
          jsonFile = file;
          console.log("JSON file found:", fullPath);
        } else if (fileName.endsWith('.skel')) {
          skelFile = file;
          console.log("Skel file found:", fullPath);
        } else if (file.type.startsWith('image/') ||
                  fileName.endsWith('.png') ||
                  fileName.endsWith('.jpg') ||
                  fileName.endsWith('.jpeg') ||
                  fileName.endsWith('.webp') ||
                  fileName.endsWith('.ktx2') ||
                  fileName.endsWith('.basis')) {
          imageFiles.push(file);
          console.log("Image file found:", fullPath);
        } else {
          console.log("Unrecognized file type:", fullPath);
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
      
      // Read atlas content and rewrite image references to match actual uploaded files
      const rawAtlasText = await this.readFileAsText(atlasFile);
      const imageFileNames = imageFiles.map(f => this.getFileName(f.name));
      const atlasText = this.rewriteAtlasImageNames(rawAtlasText, imageFileNames);

      // Load skeleton data
      let skeletonData;
      const isBinary = !!skelFile;
      
      if (skelFile) {
        console.log('Binary Format')
        // Binary format
        skeletonData = await this.readFileAsArrayBuffer(skelFile);
      } else if (jsonFile) {
        console.log('JSON Format')
        // JSON format
        const jsonText = await this.readFileAsText(jsonFile);
        try {
          skeletonData = JSON.parse(jsonText);
          
          // Check for Spine 4.1 vs 4.2 version
          if (skeletonData && skeletonData.spine && skeletonData.spine.startsWith('4.1')) {
            console.log('Updating Spine version from 4.1 to 4.2.0');
            skeletonData.spine = '4.2.0';
          }
        } catch (error) {
          console.error("Error parsing JSON:", error);
          throw new Error("Invalid JSON format in skeleton file");
        }
      }
      
      // Extract image names from atlas
      const imageNames = this.extractImageNamesFromAtlas(atlasText);
      console.log("Image names referenced in atlas:", imageNames);
      
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
      console.error('Error loading Spine files:', error);
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
        console.log(`Atlas image substitution: "${atlasName}" -> "${match}"`);
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

  private extractImageNamesFromAtlas(atlasText: string): string[] {
    const lines = atlasText.split('\n');
    const imageNames: string[] = [];
    
    // In spine atlas format, the image names are the first non-empty lines 
    // before each "size:" line
    let currentName = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line === '') continue;
      
      if (line.startsWith('size:')) {
        if (currentName && !imageNames.includes(currentName)) {
          imageNames.push(currentName);
        }
        currentName = '';
      } else if (currentName === '') {
        // If we don't have a current name and this line is not a property,
        // it must be an image name
        if (!line.includes(':')) {
          currentName = line;
        }
      }
    }
    
    // Add the last image name if we have one
    if (currentName && !imageNames.includes(currentName)) {
      imageNames.push(currentName);
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
    console.log(`Creating ${isBinary ? 'Binary' : 'JSON'} Spine Asset`);

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
        console.error(`Missing texture for page: ${pageName}`);
        console.log("Available textures:", Object.keys(textures).join(", "));
        throw new Error(`Missing texture for page: ${pageName}`);
      }

      // Create SpineTexture from the PIXI Texture
      const spineTexture = SpineTexture.from(texture.source);
      
      // Set the texture for the page
      page.setTexture(spineTexture);
    }

    // Create attachment loader
    const atlasLoader = new AtlasAttachmentLoader(spineAtlas);

    // Create skeleton data
    let skeletonData: SkeletonData | undefined = undefined;

    if(isBinary) {
      const skeletonBinary = new SkeletonBinary(atlasLoader);
      console.log(skeletonBinary)
     skeletonData = skeletonBinary.readSkeletonData(data);
    } else {
      const skeletonJson = new SkeletonJson(atlasLoader);
      console.log(skeletonJson)
     skeletonData = skeletonJson.readSkeletonData(data);
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