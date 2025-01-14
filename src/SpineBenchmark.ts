import { Application, Assets, Sprite } from "pixi.js";
import { PerformanceMonitor } from "./PerformanceMonitor";
import { SpineAnalyzer } from "./SpineAnalyzer";
import { createId } from "@paralleldrive/cuid2";
import { CameraContainer } from "./CameraContainer";
import { toast } from "./utils/toast";
import {
  AtlasAttachmentLoader,
  SkeletonBinary,
  SkeletonData,
  SkeletonJson,
  Spine,
  SpineTexture,
  TextureAtlas,
} from "@esotericsoftware/spine-pixi-v8";
import * as PIXI from 'pixi.js'

import { ALPHA_MODES } from 'pixi.js';
import { extensions, ExtensionType, Texture } from 'pixi.js';

const blobParser = {
    extension: ExtensionType.LoadParser,
    test: (url: string) => url.startsWith('blob:'),
    async load(url: string) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(Texture.from(img));
            img.onerror = reject;
            img.src = url;
        });
    }
};

extensions.add(blobParser);

export class SpineBenchmark {
  private app: Application;
  private spineInstance: Spine | null = null; // Store the single Spine instance

  constructor(app: Application) {
    this.app = app;
  }
  private async loadSpineFiles(files: FileList) {
    const acceptedFiles = Array.from(files);
    const imageFiles = acceptedFiles.filter(file => file.type.match(/image/));
    
    try {
        // Load textures
        const assetBundle: Record<string, any> = {};
        
        await Promise.all(imageFiles.map(async (file) => {
            const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.readAsDataURL(file);
            });
            
            assetBundle[file.name] = {
                src: base64,
                data: { type: file.type }
            };
        }));
        
        // Add and load bundle
        Assets.addBundle('spineAssets', assetBundle);
        const textures = await Assets.loadBundle('spineAssets');

        // Load skeleton and atlas files
        const skelFile = acceptedFiles.find(file => /^.+\.skel$/.test(file.name));
        const jsonFile = acceptedFiles.find(file => file.type === "application/json");
        const atlasFile = acceptedFiles.find(file => file.name.endsWith('.atlas'));
        
        let skeletonData;
        if (skelFile) {
            this.isBinary = true;
            skeletonData = await this.readFileAsArrayBuffer(skelFile);
        } else if (jsonFile) {
            const jsonText = await this.readFileAsText(jsonFile);
            skeletonData = JSON.parse(jsonText);
        } else {
            throw new Error('No skeleton file (.skel or .json) found');
        }
        
        if (!atlasFile) {
            throw new Error('No atlas file found');
        }
        const atlasText = await this.readFileAsText(atlasFile);
        
        // Create spine asset
        await this.createSpineAsset(skeletonData, atlasText, textures);
        
    } catch (error) {
        console.error('Error loading Spine files:', error);
    }
}

private readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
  });
}

private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
  });
}

private async createSpineAsset(
  data: any, 
  atlasText: string, 
  textures: Record<string, Texture>
): Promise<void> {
  console.log("Creating Spine Asset");
  const key = `spine-${createId()}`;

  // Create atlas
  const spineAtlas = new TextureAtlas(atlasText);
  
  // Process each page in the atlas
  for (const page of spineAtlas.pages) {
      const pageName = page.name;
      const texture = textures[pageName];

      if (!texture) {
          console.error(`Missing texture for page: ${pageName}`);
          throw new Error(`Missing texture for page: ${pageName}`);
      }

      // Create SpineTexture from the PIXI Texture
      const spineTexture = SpineTexture.from(texture.source);
      
      // Set the texture for the page
      page.setTexture(spineTexture);

      // Handle PMA (Premultiplied Alpha) if needed
      // if (page.pma) {
      //     texture.alphaMode = ALPHA_MODES.PREMULTIPLIED_ALPHA;
      // } else {
      //     texture.alphaMode = ALPHA_MODES.PREMULTIPLY_ON_UPLOAD;
      // }
      
  }

  // Create attachment loader
  const atlasLoader = new AtlasAttachmentLoader(spineAtlas);

  // Create skeleton data
  const skeletonJson = new SkeletonJson(atlasLoader);
  const skeletonData = skeletonJson.readSkeletonData(data);

  // Create spine instance
  const spine = new Spine(skeletonData);
  this.app.stage.addChild(spine
  );

  const camera = this.app.stage.children[0] as CameraContainer;

  // Remove previous Spine instance if exists
  if (this.spineInstance) {
    camera.removeChild(this.spineInstance);
  }

  camera.addChild(spine);
  camera.lookAtChild(spine);

  SpineAnalyzer.analyze(spine)

  this.createAnimationButtons(spine);
  this.createSkinButtons(spine);
}

  // UI functions:
  private createAnimationButtons(spineInstance: Spine) {
    const animations = spineInstance.skeleton.data.animations;
    const container = document.getElementById("sidebarAnimations")!;

    container.classList.remove("hidden");

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    animations.forEach((animation) => {
      const button = document.createElement("button");
      button.textContent = animation.name;

      button.addEventListener("click", () => {
        console.log(`Set ${animation.name}`)
        spineInstance.state.setAnimation(0, animation.name, false);
      });

      container.appendChild(button);
    });
  }

  private createSkinButtons(spineInstance: Spine) {
    const skins = spineInstance.skeleton.data.skins;
    const container = document.getElementById("sidebarSkins")!;

    container.classList.remove("hidden");

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    skins.forEach((skin) => {
      const button = document.createElement("button");
      button.textContent = skin.name;

      button.addEventListener("click", () => {
        spineInstance.skeleton.setSkinByName(skin.name);
        spineInstance.skeleton.setSlotsToSetupPose();
      });

      container.appendChild(button);
    });
  }

  // Usage example:
  // Assuming you have a Spine instance called 'spineInstance'
  // const spineInstance = new PIXI.spine.Spine(spineData);
  // const analysis = analyzeSpineSkeleton(spineInstance);

  playSpineAnimationsInSequence(spineInstance: Spine) {
    const animations = spineInstance.skeleton.data.animations;
    let currentIndex = 0;
    spineInstance.state.addListener({
      complete: function (track) {
        currentIndex++;
        setTimeout(playNextAnimation, 250);
      },
    });
    function playNextAnimation() {
      if (currentIndex < animations.length) {
        const animation = animations[currentIndex];

        document.getElementById(
          "currentAnimation"
        )!.innerHTML = `Animation: ${animation.name}`;
        spineInstance.state.setAnimation(0, animation.name, false);
      } else {
        currentIndex = 0;
        setTimeout(playNextAnimation, 250);
      }
    }

    playNextAnimation();
  }
}
