import { Attachment, DeformTimeline, MeshAttachment } from "@pixi-spine/all-4.1";
import { AttachmentType, Spine } from "pixi-spine";
import { Renderer } from "pixi.js";
import { analyzeMeshes } from "./analyze/mesh";
import { analyzeDeformations } from "./analyze/deformations";
import { analyzeSpineAttachments } from "./analyze/attachmentDistances";
import { analyzeSpineBoneNames } from "./analyze/boneName";
import { analyzeSpineForParticles } from "./analyze/particles";
import { analyzeMasks } from "./analyze/clipping";
import { analyzeSpineAnimations } from "./analyze/timelines";
import { analyzeSpineBlendModes } from "./analyze/blendModes";

export class SpineAnalyzer {
  public analyzeMeshes(spineInstances: Spine[]) {
    let totalMeshes = 0;
    let totalVertices = 0;
    
    spineInstances.forEach((spine) => {
      spine.skeleton.slots.forEach((slot) => {
        if (
          slot.getAttachment() &&
          slot.getAttachment().type === AttachmentType.Mesh
        ) {
          totalMeshes++;
          totalVertices +=
          (slot.getAttachment() as any).worldVerticesLength / 2;
        }
      });
    });
    
    spineInstances.forEach((spine) => {
      analyzeMeshes(spine);
      analyzeDeformations(spine);
      analyzeSpineAttachments(spine as any);
      analyzeSpineBoneNames(spine as any);
      analyzeSpineForParticles(spine as any);
      analyzeMasks(spine as any);
      analyzeSpineAnimations(spine as any);
      analyzeSpineBlendModes(spine as any);
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
