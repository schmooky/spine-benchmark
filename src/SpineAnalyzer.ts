import { Attachment, DeformTimeline, MeshAttachment } from "@pixi-spine/all-4.1";
import { AttachmentType, Spine } from "pixi-spine";
import { Renderer } from "pixi.js";
import { analyzeMeshes } from "./analyze/mesh";
import { analyzeMeshTransformations } from "./analyze/meshTransformations";
import { analyzeSpineAttachments } from "./analyze/attachmentDistances";
import { analyzeSpineBoneNames } from "./analyze/boneName";
import { analyzeSpineForParticles } from "./analyze/particles";
import { analyzeMasks } from "./analyze/clipping";

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
      console.log(`Analizing Meshes`, spine);
      analyzeMeshes(spine);
      analyzeMeshTransformations(spine);
      analyzeSpineAttachments(spine as any);
      analyzeSpineBoneNames(spine as any);
      analyzeSpineForParticles(spine as any);
      analyzeMasks(spine as any);
    });

    return { totalMeshes, totalVertices };
  }

  public analyzeDrawCalls(renderer: Renderer) {
    console.log(renderer.geometry, renderer);
    console.log(renderer.batch.currentRenderer);
    // This is a simplified approximation and may not be 100% accurate
    const drawCalls = 0; //renderer.renderCounter;
    const triangles = 0; //renderer.geometry.boundCounters.points / 3;

    return { drawCalls, triangles };
  }
  
}
