import { Application, Assets, IRenderer, Sprite, Texture } from "pixi.js";
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
  TextureAtlas,
} from "@esotericsoftware/spine-pixi-v8";

export class SpineBenchmark {
  private app: Application;
  private performanceMonitor: PerformanceMonitor;
  private spineAnalyzer: SpineAnalyzer;
  private spineInstance: Spine | null = null; // Store the single Spine instance
  private isBinary = false;

  constructor(app: Application) {
    this.app = app;
    this.performanceMonitor = new PerformanceMonitor();
    this.spineAnalyzer = new SpineAnalyzer();
  }

  public loadSpineFiles(files: FileList) {
    const acceptedFiles = [...files];
    const filesLength = acceptedFiles.length;
    let count = 0;

    let atlasText: string | undefined = undefined;
    let json: any = undefined;

    let urls: [string,string][] = []

    const getFilename = (str: string) =>
      str.substring(str.lastIndexOf("/") + 1);

    acceptedFiles.forEach((file) => {
      const filename = getFilename(file.name);
      const reader = new FileReader();

      if (file.type.match(/image/)) {
        // reader.readAsDataURL(file);
        count += 1;
        const url = URL.createObjectURL(file);
        urls.push([url,file.name])
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
              this.createSpineAsset(json, atlasText!,urls);
            }
          });
        } else if (file.type === "application/json") {
          count += 1;
          json = JSON.parse(event.target!.result as string);
          Assets.cache.set('skeletonData',json)
          if (count === filesLength) {
            this.createSpineAsset(json, atlasText!,urls);
          }
        } else if (/^.+\.skel$/.test(filename)) {
          count += 1;
          this.isBinary = true;
          json = event.target!.result;
          if (count === filesLength) {
            this.createSpineAsset(json, atlasText!,urls);
          }
        } else {
          count += 1;
          atlasText = event.target!.result as string;
          Assets.cache.set('skeletonAtlas',new TextureAtlas(atlasText))
          if (count === filesLength) {
            this.createSpineAsset(json, atlasText,urls);
          }
        }
      };
    });
  }

  private async createSpineAsset(data: any, atlasText: string,urls: [string,string][]): Promise<void> {
    toast(`Loaded skeleton`);
    console.log('loading urls',urls.join('  '))
    Promise.all(urls.map(url=> Assets.load({src:`blob:${url[0]}`,loadParser:'loadTextures'})));

    const texture = await Texture.from(urls[0][0]);
    console.log(texture)
    console.log(Assets.cache)

    urls.forEach((url)=>{Assets.cache.set(url[1],Assets.cache.get(`blob:${url[0]}`))})

    setTimeout(() => {
      const skeleton = Spine.from({skeleton: 'skeletonData', atlas: 'skeletonAtlas'});
      this.app.stage.addChild(skeleton);
      skeleton.position.set(200,200)

      // UI elements:
      this.createAnimationButtons(skeleton);
      this.createSkinButtons(skeleton);

      this.spineInstance = skeleton;

      // this.spineAnalyzer.analyzeMeshes(skeleton);
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
