import { Renderer } from "pixi.js";
import { analyzeMeshes } from "./analyze/mesh";
import { analyzeDeformations } from "./analyze/deformations";
import { analyzeSpineForParticles } from "./analyze/particles";
import { analyzeMasks } from "./analyze/clipping";
import { analyzeSpineAnimations } from "./analyze/timelines";
import { analyzeSpineBlendModes } from "./analyze/blendModes";
import { Spine, VertexAttachment } from "@esotericsoftware/spine-pixi-v7";

export class SpineAnalyzer {
  public analyzeMeshes(spineInstances: Spine[]) {
    let totalMeshes = 0;
    let totalVertices = 0;
    
    spineInstances.forEach((spine) => {
      spine.skeleton.slots.forEach((slot) => {
        if (
          slot.getAttachment() &&
          (slot.getAttachment() as VertexAttachment).worldVerticesLength
        ) {
          totalMeshes++;
          totalVertices +=
          (slot.getAttachment() as VertexAttachment).worldVerticesLength / 2;
        }
      });
    });
    
    spineInstances.forEach((spine) => {
      // analyzeMeshes(spine);
      // analyzeDeformations(spine);
      // analyzeSpineAttachments(spine as any);
      // analyzeSpineAttachments(spine as any);
      // analyzeSpineForParticles(spine as any);
      // analyzeMasks(spine as any);
      // analyzeSpineAnimations(spine as any);
      analyzeSpineBlendModes(spine);
    });
    
    return { totalMeshes, totalVertices };
  }
  
  public analyzeDrawCalls(renderer: Renderer) {
    // This is a simplified approximation and may not be 100% accurate
    const drawCalls = 0; //renderer.renderCounter;
    const triangles = 0; //renderer.geometry.boundCounters.points / 3;
    
    return { drawCalls, triangles };
  }
  
}
