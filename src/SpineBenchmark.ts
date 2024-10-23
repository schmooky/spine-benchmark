import { Application, Assets } from "pixi.js";
import { Spine } from "pixi-spine";
import { PerformanceMonitor } from "./PerformanceMonitor";
import { SpineAnalyzer } from "./SpineAnalyzer";
import { toast } from "./utils/toast";
import {
  AtlasAttachmentLoader,
  SkeletonBinary,
  SkeletonJson,
  SkeletonData,
  TextureAtlas,
} from "@pixi-spine/all-4.1";
import { createId } from "@paralleldrive/cuid2";
import { CameraContainer } from "./CameraContainer";
import {
  SpineErrorCode,
  SpineErrorHandler,
  formatErrorMessage,
  SPINE_ERRORS,
} from "./errorConstants";

export class SpineBenchmark {
  private app: Application;
  private performanceMonitor: PerformanceMonitor;
  private spineAnalyzer: SpineAnalyzer;
  private spineInstance: Spine | null = null;
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
    let hasSkeletonFile = false;
    let hasAtlasFile = false;

    const getFilename = (str: string) =>
      str.substring(str.lastIndexOf("/") + 1);

    acceptedFiles.forEach((file) => {
      const filename = getFilename(file.name);
      if (file.type === "application/json" || /^.+\.skel$/.test(filename)) {
        hasSkeletonFile = true;
      }
      if (filename.endsWith(".atlas")) {
        hasAtlasFile = true;
      }
    });

    if (!hasAtlasFile) {
      toast(formatErrorMessage(SpineErrorCode.MISSING_ATLAS_FILE));
      return;
    }

    if (
      !hasSkeletonFile &&
      filesLength === 1 &&
      acceptedFiles[0].name.endsWith(".atlas")
    ) {
      toast(formatErrorMessage(SpineErrorCode.MISSING_SKELETON_FILE));
      return;
    }

    acceptedFiles.forEach((file) => {
      const filename = getFilename(file.name);
      const reader = new FileReader();

      reader.onerror = () => {
        toast(formatErrorMessage(SpineErrorCode.FILE_READ_ERROR, filename));
      };

      if (file.type.match(/image/)) {
        reader.readAsDataURL(file);
      } else if (/^.+\.skel$/.test(filename)) {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file);
      }

      reader.onload = (event) => {
        try {
          if (file.type.match(/image/)) {
            Assets.load(event.target!.result as string)
              .then(() => {
                count += 1;
                Assets.cache.set(
                  file.name,
                  Assets.cache.get(event.target!.result as string)
                );
                if (count === filesLength && hasSkeletonFile) {
                  this.createSpineAsset(json, atlasText!);
                }
              })
              .catch((error: Error) => {
                toast(
                  formatErrorMessage(
                    SpineErrorCode.IMAGE_LOAD_ERROR,
                    filename,
                    error.message
                  )
                );
              });
          } else if (file.type === "application/json") {
            count += 1;
            try {
              json = JSON.parse(event.target!.result as string);

              if (json.skeleton && json.skeleton.spine) {
                const version = parseFloat(json.skeleton.spine);
                if (version > 4.1) {
                  toast(
                    formatErrorMessage(
                      SpineErrorCode.UNSUPPORTED_VERSION,
                      version.toString()
                    )
                  );
                }
              }

              if (!json.bones || !json.slots) {
                toast(
                  formatErrorMessage(
                    SpineErrorCode.INVALID_SKELETON_STRUCTURE,
                    filename
                  )
                );
              }
            } catch (error: unknown) {
              const err = error as Error;
              toast(
                formatErrorMessage(
                  SpineErrorCode.JSON_PARSE_ERROR,
                  filename,
                  err.message
                )
              );
            }

            if (count === filesLength) {
              this.createSpineAsset(json, atlasText!);
            }
          } else if (/^.+\.skel$/.test(filename)) {
            count += 1;
            this.isBinary = true;
            json = event.target!.result;

            if (!(json instanceof ArrayBuffer)) {
              toast(
                formatErrorMessage(SpineErrorCode.BINARY_FILE_ERROR, filename)
              );
            }

            if (count === filesLength) {
              this.createSpineAsset(json, atlasText!);
            }
          } else {
            count += 1;
            atlasText = event.target!.result as string;

            if (!atlasText || typeof atlasText !== "string") {
              toast(
                formatErrorMessage(SpineErrorCode.ATLAS_READ_ERROR, filename)
              );
            }

            const atlasLines = atlasText.split("\n");
            if (atlasLines.length < 3) {
              toast(
                formatErrorMessage(
                  SpineErrorCode.INVALID_ATLAS_STRUCTURE,
                  filename
                )
              );
            }

            if (count === filesLength) {
              this.createSpineAsset(json, atlasText);
              const dropArea = document.getElementById("dropArea");
              if (dropArea) {
                dropArea.style.display = "none";
              }
            }
          }
        } catch (error: unknown) {
          const err = error as Error;
          toast(
            formatErrorMessage(
              SpineErrorCode.FILE_PROCESSING_ERROR,
              filename,
              err.message
            )
          );
        }
      };
    });
  }

  private createSpineAsset(data: any, atlasText: string): void {
    try {
      const key = `spine-${createId()}`;

      let spineAtlas: TextureAtlas;
      try {
        spineAtlas = new TextureAtlas(atlasText, function (line, callback) {
          const texture = Assets.cache.get(line);
          if (!texture) {
            throw new SpineErrorHandler({
              code: SpineErrorCode.TEXTURE_NOT_FOUND,
              message: formatErrorMessage(
                SpineErrorCode.TEXTURE_NOT_FOUND,
                line
              ),
            });
          }
          callback(texture);
        });
      } catch (error: unknown) {
        const err = error as Error;
        toast(
          formatErrorMessage(SpineErrorCode.ATLAS_CREATE_ERROR, err.message)
        );
        return;
      }

      let skeletonData: SkeletonData;
      try {
        if (this.isBinary) {
          const spineBinaryParser = new SkeletonBinary(
            new AtlasAttachmentLoader(spineAtlas)
          );
          skeletonData = spineBinaryParser.readSkeletonData(
            new Uint8Array(data)
          );
        } else {
          const spineJsonParser = new SkeletonJson(
            new AtlasAttachmentLoader(spineAtlas)
          );
          skeletonData = spineJsonParser.readSkeletonData(data);
        }

        if (!skeletonData.bones.length) {
          throw new SpineErrorHandler({
            code: SpineErrorCode.EMPTY_SKELETON,
            message: SPINE_ERRORS[SpineErrorCode.EMPTY_SKELETON],
          });
        }
      } catch (error: unknown) {
        const err = error as Error;
        toast(
          formatErrorMessage(SpineErrorCode.SKELETON_PARSE_ERROR, err.message)
        );
        return;
      }

      Assets.cache.set(key, skeletonData);

      setTimeout(() => {
        try {
          const skeleton = new Spine(Assets.cache.get(key));
          const camera = this.app.stage.children[0] as CameraContainer;

          if (this.spineInstance) {
            camera.removeChild(this.spineInstance);
          }

          camera.addChild(skeleton);
          camera.lookAtChild(skeleton);

          this.createAnimationButtons(skeleton);
          this.createSkinButtons(skeleton);

          this.spineInstance = skeleton;
          this.updateBenchmarkResults();

          const dropArea = document.getElementById("dropArea");
          if (dropArea) {
            dropArea.style.display = "none";
          }
        } catch (error: unknown) {
          const err = error as Error;
          toast(
            formatErrorMessage(SpineErrorCode.SPINE_INSTANCE_ERROR, err.message)
          );
        }
      }, 250);
    } catch (error: unknown) {
      const err = error as Error;
      toast(
        formatErrorMessage(SpineErrorCode.CRITICAL_ASSET_ERROR, err.message)
      );
    }
  }

  private createAnimationButtons(spineInstance: Spine) {
    const animations = spineInstance.skeleton.data.animations;
    const container = document.getElementById("optionsAnimations")!;

    const animationsTitle = document.createElement("h3");
    animationsTitle.innerText = "animations";
    container.appendChild(animationsTitle);

    const buttonsContainer = document.createElement("div");
    buttonsContainer.className = "buttonsContainer";
    container.appendChild(buttonsContainer);

    animations.forEach((animation) => {
      const button = document.createElement("button");
      button.textContent = animation.name;

      button.addEventListener("click", () => {
        spineInstance.state.setAnimation(0, animation.name, false);
      });

      buttonsContainer.appendChild(button);
    });
  }

  private createSkinButtons(spineInstance: Spine) {
    const skins = spineInstance.skeleton.data.skins;
    const container = document.getElementById("optionsSkins")!;

    const skinsTitle = document.createElement("h3");
    skinsTitle.innerText = "skins";
    container.appendChild(skinsTitle);

    const buttonsContainer = document.createElement("div");
    buttonsContainer.className = "buttonsContainer";
    container.appendChild(buttonsContainer);

    skins.forEach((skin) => {
      const button = document.createElement("button");
      button.textContent = skin.name;

      button.addEventListener("click", () => {
        spineInstance.skeleton.setSkinByName(skin.name);

        spineInstance.skeleton.setSlotsToSetupPose();
      });

      buttonsContainer.appendChild(button);
    });
  }

  private updateBenchmarkResults() {
    if (!this.spineInstance) return;

    const meshInfo = this.spineAnalyzer.analyzeMeshes([this.spineInstance]);
    const performanceInfo = this.performanceMonitor.getPerformanceInfo();
    //@ts-ignore
    const drawCallInfo = this.spineAnalyzer.analyzeDrawCalls(this.app.renderer);

    // Update benchmark results UI
    // ... (Update the elements in the UI)
  }
}
