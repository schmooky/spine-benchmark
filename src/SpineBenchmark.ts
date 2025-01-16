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
} from "@esotericsoftware/spine-pixi-v7";
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
  private isBinary = false;
  
  constructor(app: Application) {
    this.app = app;
  }

  public loadSpineFiles(files: FileList) {
    const acceptedFiles = [...files];
    const filesLength = acceptedFiles.length;
    let count = 0;

    let atlasText: string | undefined = undefined;
    let json: any = undefined;

    const getFilename = (str: string) =>
      str.substring(str.lastIndexOf("/") + 1);

    acceptedFiles.forEach((file) => {
      const filename = getFilename(file.name);
      const reader = new FileReader();

      if (file.type.match(/image/)) {
        reader.readAsDataURL(file);
      } else if (/^.+\.skel$/.test(filename)) {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file);
      }
      reader.onload = (event) => {
        if (file.type.match(/image/)) {
          Assets.load(event.target!.result as string).then(() => {
            count += 1;
            Assets.cache.set(
              file.name,
              Assets.cache.get(event.target!.result as string)
            );
            if (count === filesLength) {
              this.createSpineAsset(json, atlasText!);
            }
          });
        } else if (file.type === "application/json") {
          count += 1;
          json = JSON.parse(event.target!.result as string);
          // AnimationStore.instance.setSpineAnimations(Object.keys(json.animations));
          if (count === filesLength) {
            this.createSpineAsset(json, atlasText!);
          }
        } else if (/^.+\.skel$/.test(filename)) {
          count += 1;
          this.isBinary = true;
          json = event.target!.result;
          // AnimationStore.instance.setSpineAnimations(Object.keys(json.animations));
          if (count === filesLength) {
            this.createSpineAsset(json, atlasText!);
          }
        } else {
          count += 1;
          atlasText = event.target!.result as string;
          if (count === filesLength) {
            this.createSpineAsset(json, atlasText);
          }
        }
      };
    });
  }
  private async createSpineAsset(data: any, atlasText: string): Promise<void> {
    console.log("Creating Spine Asset");
    const key = `spine-${createId()}`;
    const spineAtlas = new TextureAtlas(atlasText);
    console.log(spineAtlas)
    spineAtlas.pages.forEach(page=> {
      console.log('PAGE',page.name);
      const sprite = new Sprite(Assets.cache.get<Texture>(page.name));
      this.app.stage.addChild(sprite);
      sprite.position.set(200,200)
      page.setTexture(SpineTexture.from(Assets.cache.get<Texture>(page.name).baseTexture))
    })
    let skeletonData: SkeletonData;
    if (this.isBinary) {
      const spineBinaryParser = new SkeletonBinary(
        new AtlasAttachmentLoader(spineAtlas)
      );
      skeletonData = spineBinaryParser.readSkeletonData(new Uint8Array(data));
    } else {
      const spineJsonParser = new SkeletonJson(
        new AtlasAttachmentLoader(spineAtlas)
      );
      skeletonData = spineJsonParser.readSkeletonData(data);
    }
    
    console.log(Assets.cache);

    Assets.cache.set(key + "Data", data);
    Assets.cache.set(key + "Atlas", spineAtlas);

    toast(`Loaded skeleton`);

    setTimeout(() => {
      const darkTint = false;
      const autoUpdate = true;
      const cacheKey = `${key}`;

      Spine.skeletonCache[cacheKey] = skeletonData;
      const skeleton = new Spine({ skeletonData, darkTint, autoUpdate });

      const bounds = skeleton.getBounds();
      console.log(`Skeleton position: (${skeleton.x}, ${skeleton.y}), bounds: (${bounds.x}, ${bounds.y}, ${bounds.width}, ${bounds.height})`);

      console.log(`Skeleton visibility: ${skeleton.visible}, alpha: ${skeleton.alpha}`);

      const a = Spine.from({ atlas: key + "Atlas", skeleton: key + "Data" });
      console.log(a);
      const camera = this.app.stage.children[0] as CameraContainer;

      // Remove previous Spine instance if exists
      if (this.spineInstance) {
        camera.removeChild(this.spineInstance);
      }

      camera.addChild(skeleton);
      camera.lookAtChild(skeleton);

      // UI elements:
      this.createAnimationButtons(skeleton);
      this.createSkinButtons(skeleton);

      this.spineInstance = skeleton;

      SpineAnalyzer.analyze(skeleton);
      //show pixi container
    }, 250);
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
