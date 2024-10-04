import { Application, Assets, IRenderer } from "pixi.js";
import { AttachmentType, Spine } from "pixi-spine";
import { PerformanceMonitor } from "./PerformanceMonitor";
import { SpineAnalyzer } from "./SpineAnalyzer";
import {
  AtlasAttachmentLoader,
  DeformTimeline,
  Skeleton,
  SkeletonBinary,
  SkeletonData,
  SkeletonJson,
  TextureAtlas,
} from "@pixi-spine/all-4.1";
import { createId } from "@paralleldrive/cuid2";
import { CameraContainer } from "./CameraContainer";

export class SpineBenchmark {
  private app: Application;
  private performanceMonitor: PerformanceMonitor;
  private spineAnalyzer: SpineAnalyzer;
  private spineInstances: Spine[] = [];
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
    
    const getFilename = (str: string) =>
      str.substring(str.lastIndexOf("/") + 1);
    
    acceptedFiles.forEach((file) => {
      const filename = getFilename(file.name);
      const reader = new FileReader();
      
      if (file.type.match(/image/)) {
        reader.readAsDataURL(file);
      } else if (/^.+\.skel$/.test(filename)){
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
        }else if (/^.+\.skel$/.test(filename)) {
          console.log('Loading Binary Skel')
          count += 1;
          this.isBinary = true;
          json = event.target!.result;
          // AnimationStore.instance.setSpineAnimations(Object.keys(json.animations));
          if (count === filesLength) {
            this.createSpineAsset(json, atlasText!);
          }
        }
        else {
          count += 1;
          atlasText = event.target!.result as string;
          if (count === filesLength) {
            this.createSpineAsset(json, atlasText);
          }
        }
      };
    });
  }
  
  private createSpineAsset(data: any, atlasText: string): void {
    const key = `spine-${createId()}`;
    const spineAtlas = new TextureAtlas(atlasText, function (line, callback) {
      callback(Assets.cache.get(line));
    });
    
    console.log(`Creating ${this.isBinary ? "Binary" : "Json"} Spine Asset`)
    
    let skeletonData: SkeletonData;
    if(this.isBinary) { 
      console.log('data to parse',data)
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
    
    
    Assets.cache.set(key, skeletonData);
    console.log(`loaded`, key, Assets.cache.get(key));
    console.log(Assets.cache);
    setTimeout(() => {
      const skeleton = new Spine(Assets.cache.get(key));
      
      const camera = this.app.stage.children[0] as CameraContainer;
      //@ts-ignore
      camera.addChild(skeleton);
      
      camera.lookAtChild(skeleton);
      console.log(skeleton.spineData.animations.map((_) => _.name));
      // skeleton.state.setAnimation(0, "idle", true);
      this.playSpineAnimationsInSequence(skeleton)
      
      this.spineInstances.push(skeleton);
      this.updateBenchmarkResults();
      
      document.getElementById("dropArea")?.remove()
    }, 250);
    // this.app.stage.addChild(new Spine(Assets.cache.get(
    //     'key'
    // )))
    
    
  }
  
  private updateBenchmarkResults() {
    console.log("updating");
    const meshInfo = this.spineAnalyzer.analyzeMeshes(this.spineInstances);
    const performanceInfo = this.performanceMonitor.getPerformanceInfo();
    //@ts-ignore
    const drawCallInfo = this.spineAnalyzer.analyzeDrawCalls(this.app.renderer);
    
    // const resultsDiv = document.getElementById("benchmarkResults")!;
    // resultsDiv.innerHTML = `
    //     <h2>Benchmark Results</h2>
    // <p>Instances: ${this.spineInstances.length}</p>
    //     <p>Meshes: ${meshInfo.totalMeshes}</p>
    // <p>Vertices: ${meshInfo.totalVertices}</p>
    //     <p>FPS: ${performanceInfo.fps.toFixed(2)}</p>
    // <p>Draw Calls: ${drawCallInfo.drawCalls}</p>
    //     <p>Triangles: ${drawCallInfo.triangles}</p>
    // `;
  }
  
  // Usage example:
  // Assuming you have a Spine instance called 'spineInstance'
  // const spineInstance = new PIXI.spine.Spine(spineData);
  // const analysis = analyzeSpineSkeleton(spineInstance);
  
  playSpineAnimationsInSequence(spineInstance: Spine) {
    const animations = spineInstance.skeleton.data.animations;
    let currentIndex = 0;
    spineInstance.state.addListener({
      complete: function(track) {
        currentIndex++;
        setTimeout(playNextAnimation, 250);
        
      }
    });
    function playNextAnimation() {
      if (currentIndex < animations.length) {
        const animation = animations[currentIndex];
        
        // setAfterElementContent('pixiContainer',animation.name)
        document.getElementById('currentAnimation')!.innerHTML = `Animation: ${animation.name}`;
        spineInstance.state.setAnimation(0, animation.name, false);
        
        
      } else {
        console.log("All animations have been played.");
        currentIndex = 0;
        setTimeout(playNextAnimation, 250);
      }
    }
    
    playNextAnimation();
  }
}