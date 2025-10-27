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
      
      const timestamp = Date.now();
      const atlasAlias = `atlas-${timestamp}-${atlasUrl}`;
      const jsonAlias = `json-${timestamp}-${jsonUrl}`;
      
      Assets.add({ alias: atlasAlias, src: atlasUrl });
      Assets.add({ alias: jsonAlias, src: jsonUrl });
      
      const atlasResponse = await fetch(atlasUrl);
      if (!atlasResponse.ok) {
        throw new Error(`Failed to fetch atlas: ${atlasResponse.statusText}`);
      }
      const atlasText = await atlasResponse.text();
      
      const imageUrls = this.extractImageUrlsFromAtlas(atlasText, atlasUrl);
      console.log('Extracted image URLs:', imageUrls);
      
      for (const [imageName, imageUrl] of Object.entries(imageUrls)) {
        const imageAlias = `${timestamp}-${imageName}`;
        Assets.add({ alias: imageAlias, src: imageUrl });
      }
      
      const allAliases = [atlasAlias, jsonAlias, ...Object.keys(imageUrls).map(name => `${timestamp}-${name}`)];
      await Assets.load(allAliases);
      
      const jsonResponse = await fetch(jsonUrl);
      if (!jsonResponse.ok) {
        throw new Error(`Failed to fetch JSON: ${jsonResponse.statusText}`);
      }
      let skeletonData = await jsonResponse.json();
      
      if (skeletonData && skeletonData.spine && skeletonData.spine.startsWith('4.1')) {
        console.log('Updating Spine version from 4.1 to 4.2.0');
        skeletonData.spine = '4.2.0';
      }
      
      const spineAtlas = new TextureAtlas(atlasText);
      
      for (const page of spineAtlas.pages) {
        const pageName = page.name;
        const imageAlias = `${timestamp}-${pageName}`;
        const texture = await Assets.load(imageAlias);
        
        if (!texture) {
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
      
      const atlasLoader = new AtlasAttachmentLoader(spineAtlas);
      const skeletonJson = new SkeletonJson(atlasLoader);
      const skeletonDataObj = skeletonJson.readSkeletonData(skeletonData);
      
      return new Spine(skeletonDataObj);
      
    } catch (error) {
      console.error('Error loading Spine files from URLs:', error);
      throw error;
    } finally {
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
          const imageUrl = this.resolveImageUrl(currentName, atlasBaseUrl);
          imageUrls[currentName] = imageUrl;
          
          const nameWithoutExt = currentName.substring(0, currentName.lastIndexOf('.'));
          if (nameWithoutExt) {
            imageUrls[nameWithoutExt] = imageUrl;
          }
        }
        currentName = '';
      } else if (currentName === '') {
        if (!line.includes(':')) {
          currentName = line;
        }
      }
    }
    
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
    if (imageName.startsWith('http://') || imageName.startsWith('https://')) {
      return imageName;
    }
    
    return atlasBaseUrl + imageName;
  }

  public async loadSpineFiles(files: FileList): Promise<Spine | null> {
    try {
      const acceptedFiles = Array.from(files);
      console.log('Processing files:', acceptedFiles.map(f => (f as any).fullPath || f.name).join(', '));
      
      let atlasFile: File | undefined;
      let jsonFile: File | undefined;
      let skelFile: File | undefined;
      let imageFiles: File[] = [];
      
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
                  fileName.endsWith('.webp')) {
          imageFiles.push(file);
          console.log("Image file found:", fullPath);
        } else {
          console.log("Unrecognized file type:", fullPath);
        }
      });
      
      if (!atlasFile) {
        throw new Error('Missing atlas file (.atlas). Please include an atlas file with your Spine data.');
      }
      
      if (!jsonFile && !skelFile) {
        throw new Error('Missing skeleton file (.json or .skel). Please include a skeleton file with your Spine data.');
      }
      
      if (imageFiles.length === 0) {
        throw new Error('Missing image files. Please include image files referenced by your atlas.');
      }
      
      const atlasText = await this.readFileAsText(atlasFile);
      
      let skeletonData;
      const isBinary = !!skelFile;
      
      if (skelFile) {
        console.log('Binary Format')
        skeletonData = await this.readFileAsArrayBuffer(skelFile);
      } else if (jsonFile) {
        console.log('JSON Format')
        const jsonText = await this.readFileAsText(jsonFile);
        try {
          skeletonData = JSON.parse(jsonText);
          
          if (skeletonData && skeletonData.spine && skeletonData.spine.startsWith('4.1')) {
            console.log('Updating Spine version from 4.1 to 4.2.0');
            skeletonData.spine = '4.2.0';
          }
        } catch (error) {
          console.error("Error parsing JSON:", error);
          throw new Error("Invalid JSON format in skeleton file");
        }
      }
      
      const imageNames = this.extractImageNamesFromAtlas(atlasText);
      console.log("Image names referenced in atlas:", imageNames);
      
      const assetBundle: Record<string, any> = {};
      
      for (const imageFile of imageFiles) {
        const base64 = await this.fileToBase64(imageFile);
        const fileName = this.getFileName(imageFile.name);
        
        assetBundle[fileName] = {
          src: base64,
          data: { type: imageFile.type || 'image/png' }
        };
        
        const fileNameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
        if (fileNameWithoutExt) {
          assetBundle[fileNameWithoutExt] = {
            src: base64,
            data: { type: imageFile.type || 'image/png' }
          };
        }
      }
      
      Assets.addBundle('spineAssets', assetBundle);
      const textures = await Assets.loadBundle('spineAssets');
      
      return await this.createSpineAsset(skeletonData, atlasText, textures, isBinary);
      
    } catch (error) {
      console.error('Error loading Spine files:', error);
      throw error;
    }
  }

  private getFileName(path: string): string {
    return path.split('/').pop() || path;
  }
  
  private extractImageNamesFromAtlas(atlasText: string): string[] {
    const lines = atlasText.split('\n');
    const imageNames: string[] = [];
    
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
        if (!line.includes(':')) {
          currentName = line;
        }
      }
    }
    
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

    const spineAtlas = new TextureAtlas(atlasText);
    
    for (const page of spineAtlas.pages) {
      const pageName = page.name;
      
      let texture = textures[pageName];
      
      if (!texture) {
        const baseFileName = this.getFileName(pageName);
        texture = textures[baseFileName];
        
        if (!texture) {
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

      const spineTexture = SpineTexture.from(texture.source);
      
      page.setTexture(spineTexture);
    }

    const atlasLoader = new AtlasAttachmentLoader(spineAtlas);

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
    
    return new Spine(skeletonData);
  }
}