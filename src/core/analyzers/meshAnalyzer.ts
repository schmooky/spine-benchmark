import { Animation, DeformTimeline, MeshAttachment, Spine } from "@esotericsoftware/spine-pixi-v8";
import { PERFORMANCE_FACTORS } from "../constants/performanceFactors";
import { calculateMeshScore } from "../utils/scoreCalculator";
import { ActiveComponents } from "../utils/animationUtils";

export interface MeshMetrics {
  activeMeshCount: number;
  totalVertices: number;
  weightedMeshCount: number;
  deformedMeshCount: number;
  avgVerticesPerMesh: number;
  highVertexMeshes: number;
  complexMeshes: number;
  score: number;
}

export interface MeshInfo {
  slotName: string;
  vertices: number;
  isDeformed: boolean;
  boneWeights: number;
  hasParentMesh: boolean;
}

export interface GlobalMeshAnalysis {
  meshes: MeshInfo[];
  metrics: MeshMetrics;
}

/**
 * Analyzes mesh attachments for a specific animation
 * @param spineInstance The Spine instance to analyze
 * @param animation The animation to analyze
 * @param activeComponents Components active in this animation
 * @returns Metrics for mesh analysis
 */
export function analyzeMeshesForAnimation(
  spineInstance: Spine,
  animation: Animation,
  activeComponents: ActiveComponents
): MeshMetrics {
  const skeleton = spineInstance.skeleton;
  
  let activeMeshCount = 0;
  let totalVertices = 0;
  let weightedMeshCount = 0;
  let deformedMeshCount = 0;
  
  const deformedMeshes = new Set<string>();
  
  animation.timelines.forEach(timeline => {
    if (timeline instanceof DeformTimeline) {
      const slotIndex = (timeline as any).slotIndex;
      const slot = skeleton.slots[slotIndex];
      const attachment = (timeline as any).attachment;
      
      if (slot && attachment && attachment instanceof MeshAttachment) {
        deformedMeshes.add(`${slot.data.name}:${attachment.name}`);
      }
    }
  });
  
  console.log(`Analyzing ${activeComponents.meshes.size} active meshes for animation: ${animation.name}`);
  
  activeComponents.meshes.forEach(meshId => {
    const [slotName, ...attachmentNameParts] = meshId.split(':');
    const attachmentName = attachmentNameParts.join(':');
    const slot = skeleton.slots.find((s: any) => s.data.name === slotName);
    
    if (slot) {
      const currentAttachment = slot.getAttachment();
      let attachment = null;
      
      if (currentAttachment && currentAttachment.name === attachmentName) {
        attachment = currentAttachment;
      } else {
        attachment = skeleton.getAttachment(slot.data.index, attachmentName);
      }
      
      if (attachment && attachment instanceof MeshAttachment) {
        activeMeshCount++;
        
        const vertexCount = attachment.worldVerticesLength / 2;
        totalVertices += vertexCount;
        
        if (attachment.bones?.length) {
          weightedMeshCount++;
        }
        
        if (deformedMeshes.has(meshId)) {
          deformedMeshCount++;
        }
      }
    }
  });
  
  const meshComplexityMetrics: MeshMetrics = {
    activeMeshCount,
    totalVertices,
    weightedMeshCount,
    deformedMeshCount,
    avgVerticesPerMesh: activeMeshCount > 0 ? totalVertices / activeMeshCount : 0,
    highVertexMeshes: 0,
    complexMeshes: 0,
    score: 0
  };
  
  const meshScore = calculateMeshScore(meshComplexityMetrics);
  meshComplexityMetrics.score = meshScore;
  
  return meshComplexityMetrics;
}

/**
 * Analyzes global mesh data across the entire skeleton
 * @param spineInstance The Spine instance to analyze
 * @returns Global mesh analysis data
 */
export function analyzeGlobalMeshes(spineInstance: Spine): GlobalMeshAnalysis {
  const skeleton = spineInstance.skeleton;
  const animations = spineInstance.skeleton.data.animations;

  let totalMeshCount = 0;
  let totalVertices = 0;
  let weightedMeshCount = 0;
  let deformedMeshCount = 0;
  
  const meshesWithChangesInTimelines = new Map<string, boolean>();
  const meshInfos: MeshInfo[] = [];
  
  skeleton.slots.forEach((slot) => {
    const attachment = slot.getAttachment();
    if (attachment && attachment instanceof MeshAttachment) {
      totalMeshCount++;
      
      const vertexCount = attachment.worldVerticesLength / 2;
      totalVertices += vertexCount;
      
      const hasBoneWeights = (attachment.bones?.length ?? 0) > 0;
      if (hasBoneWeights) {
        weightedMeshCount++;
      }
      
      const hasParentMesh = attachment.getParentMesh() != null;
      
      meshInfos.push({
        slotName: slot.data.name,
        vertices: vertexCount,
        isDeformed: false,
        boneWeights: attachment.bones?.length || 0,
        hasParentMesh
      });
      
      meshesWithChangesInTimelines.set(slot.data.name, false);
    }
  });
  
  animations.forEach((animation) => {
    animation.timelines.forEach((timeline) => {
      if (timeline instanceof DeformTimeline) {
        const slotIndex = timeline.slotIndex;
        const slot = skeleton.slots[slotIndex];
        const attachment = slot.getAttachment();
        
        if (attachment && attachment instanceof MeshAttachment) {
          if (!meshesWithChangesInTimelines.get(slot.data.name)) {
            deformedMeshCount++;
            meshesWithChangesInTimelines.set(slot.data.name, true);
            
            const meshInfo = meshInfos.find(m => m.slotName === slot.data.name);
            if (meshInfo) {
              meshInfo.isDeformed = true;
            }
          }
        }
      }
    });
  });
  
  meshInfos.sort((a, b) => b.vertices - a.vertices);
  
  const metrics: MeshMetrics = {
    activeMeshCount: totalMeshCount,
    totalVertices,
    weightedMeshCount,
    deformedMeshCount,
    avgVerticesPerMesh: totalMeshCount > 0 ? totalVertices / totalMeshCount : 0,
    highVertexMeshes: meshInfos.filter(mesh => mesh.vertices > 50).length,
    complexMeshes: meshInfos.filter(mesh => mesh.vertices > 20 && (mesh.isDeformed || mesh.boneWeights > 0)).length,
    score: 0
  };
  
  const meshScore = calculateMeshScore(metrics);
  metrics.score = meshScore;
  
  return {
    meshes: meshInfos,
    metrics
  };
}