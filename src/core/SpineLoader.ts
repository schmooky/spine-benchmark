import { Application, Assets, Texture } from 'pixi.js';
import {
  AtlasAttachmentLoader,
  SkeletonJson,
  Spine,
  SpineTexture,
  TextureAtlas,
} from '@esotericsoftware/spine-pixi-v8';
import { createId } from '@paralleldrive/cuid2';

export class SpineLoader {
  private app: Application;

  constructor(app: Application) {
    this.app = app;
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
                  fileName.endsWith('.webp')) {
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
      
      // Read atlas content
      const atlasText = await this.readFileAsText(atlasFile);
      
      // Load skeleton data
      let skeletonData;
      const isBinary = !!skelFile;
      
      if (skelFile) {
        // Binary format
        skeletonData = await this.readFileAsArrayBuffer(skelFile);
      } else if (jsonFile) {
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
      for (const imageFile of imageFiles) {
        const base64 = await this.fileToBase64(imageFile);
        const fileName = this.getFileName(imageFile.name);
        
        // Store with filename as key
        assetBundle[fileName] = {
          src: base64,
          data: { type: imageFile.type || 'image/png' }
        };
        
        // Also store without extension for better matching
        const fileNameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
        if (fileNameWithoutExt) {
          assetBundle[fileNameWithoutExt] = {
            src: base64,
            data: { type: imageFile.type || 'image/png' }
          };
        }
      }
      
      // Load textures
      Assets.addBundle('spineAssets', assetBundle);
      const textures = await Assets.loadBundle('spineAssets');
      
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
    console.log("Creating Spine Asset");

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
    const skeletonJson = new SkeletonJson(atlasLoader);
    const skeletonData = skeletonJson.readSkeletonData(data);

    // Create spine instance
    return new Spine(skeletonData);
  }
}