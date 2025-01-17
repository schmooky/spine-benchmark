import { Renderer } from "pixi.js";
import { analyzeClipping } from "./analyze/clipping";
import { analyzeSpineBlendModes } from "./analyze/blendModes";
import { Spine, VertexAttachment } from "@esotericsoftware/spine-pixi-v8";
import { analyzeMeshes } from "./analyze/mesh";
import { analyzePhysics } from "./analyze/physics";

export class SpineAnalyzer {
  static analyze(spineInstance: Spine) {
      analyzeClipping(spineInstance);
      analyzeSpineBlendModes(spineInstance);
      analyzeMeshes(spineInstance);
      analyzePhysics(spineInstance);
  }
}
