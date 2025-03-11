import { analyzeClipping } from "./analyze/clipping";
import { analyzeSpineBlendModes } from "./analyze/blendModes";
import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { analyzeMeshes } from "./analyze/mesh";
import { analyzePhysics } from "./analyze/physics";
import { createSkeletonTree } from "./analyze/skeleton";

export class SpineAnalyzer {
  static analyze(spineInstance: Spine) {
      analyzeClipping(spineInstance);
      analyzeSpineBlendModes(spineInstance);
      analyzeMeshes(spineInstance);
      analyzePhysics(spineInstance);
      createSkeletonTree(spineInstance);
  }
}
