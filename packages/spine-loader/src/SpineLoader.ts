import {
  AtlasAttachmentLoader,
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
      
      // Create and return spine instance
      return new Spine(skeletonDataObj);
      
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
      
      // Create asset bundle
      const assetBundle: Record<string, any> = {};
      
      // Process each image file
      const blobUrls: string[] = [];
      for (const imageFile of imageFiles) {
        const fileName = this.getFileName(imageFile.name);
        const isCompressed = fileName.endsWith('.ktx2') || fileName.endsWith('.basis');

        let src: string;
        let assetEntry: Record<string, any>;

        if (isCompressed) {
          // Compressed textures need blob URLs + parser hint for PixiJS loader detection
          const blobUrl = URL.createObjectURL(imageFile);
          blobUrls.push(blobUrl);
          src = blobUrl;
          const parser = fileName.endsWith('.ktx2') ? 'loadKTX2' : 'loadBasis';
          assetEntry = { src, loadParser: parser };
        } else {
          const base64 = await this.fileToBase64(imageFile);
          src = base64;
          assetEntry = { src, data: { type: imageFile.type || 'image/png' } };
        }

        // Store with filename as key
        assetBundle[fileName] = assetEntry;

        // Also store without extension for better matching
        const fileNameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
        if (fileNameWithoutExt) {
          assetBundle[fileNameWithoutExt] = assetEntry;
        }
      }
      
      // Load textures
      const bundleName = `spineAssets-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      Assets.addBundle(bundleName, assetBundle);
      const textures = await Assets.loadBundle(bundleName);

      // Revoke blob URLs after loading (textures are already uploaded to GPU)
      for (const blobUrl of blobUrls) {
        URL.revokeObjectURL(blobUrl);
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
        console.log(`Atlas image substitution: "${atlasName}" → "${match}"`);
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
  
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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
    
    // Create spine instance
    return new Spine(skeletonData);
  }
}