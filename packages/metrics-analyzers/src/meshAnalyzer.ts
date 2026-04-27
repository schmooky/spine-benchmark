import { Animation, DeformTimeline, MeshAttachment, Spine } from "@esotericsoftware/spine-pixi-v8";
import type { ActiveComponents } from "@spine-benchmark/metrics-sampling";
import { avgBoneInfluencesForMesh } from "@spine-benchmark/metrics-impact-formula";

/** Per-mesh detail for the enhanced CI formula path in metrics-impact-formula. */
export interface MeshDetailEntry {
  vertices: number;
  weighted: boolean;
  deformed: boolean;
  /** Average bone influences per vertex (1 for non-weighted). */
  boneInfluences: number;
}

export interface MeshMetrics {
  activeMeshCount: number;
  totalVertices: number;
  weightedMeshCount: number;
  deformedMeshCount: number;
  avgVerticesPerMesh: number;
  highVertexMeshes: number;
  complexMeshes: number;
  /**
   * Per-mesh details for the enhanced CI formula path.
   * Provides per-mesh vertex count, weighted/deformed status, and bone
   * influence density so the formula can apply per-mesh capped cost with
   * bone influence scaling instead of using global averages.
   */
  meshDetails: MeshDetailEntry[];
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
  const meshDetails: MeshDetailEntry[] = [];

  const deformedMeshes = new Set<string>();

  // Check for deformed meshes in this animation
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

  // Analyze only active meshes in this animation
  activeComponents.meshes.forEach(meshId => {
    const [slotName, ...attachmentNameParts] = meshId.split(':');
    const attachmentName = attachmentNameParts.join(':'); // Handle attachment names with colons
    const slot = skeleton.slots.find((s: any) => s.data.name === slotName);

    if (slot) {
      // Try to get the attachment directly from the slot first
      const currentAttachment = slot.getAttachment();
      let attachment = null;

      if (currentAttachment && currentAttachment.name === attachmentName) {
        attachment = currentAttachment;
      } else {
        // Try to get from skeleton data
        attachment = skeleton.getAttachment(slot.data.index, attachmentName);
      }

      if (attachment && attachment instanceof MeshAttachment) {
        activeMeshCount++;

        // Count vertices
        const vertexCount = attachment.worldVerticesLength / 2;
        totalVertices += vertexCount;

        // Check if mesh has bone weights
        const isWeighted = (attachment.bones?.length ?? 0) > 0;
        if (isWeighted) {
          weightedMeshCount++;
        }

        // Check if mesh is deformed in this animation
        const isDeformed = deformedMeshes.has(meshId);
        if (isDeformed) {
          deformedMeshCount++;
        }

        // Compute bone influence density for weighted meshes
        let boneInfluences = 1;
        if (isWeighted && attachment.bones) {
          boneInfluences = avgBoneInfluencesForMesh(attachment.bones);
        }

        meshDetails.push({
          vertices: vertexCount,
          weighted: isWeighted,
          deformed: isDeformed,
          boneInfluences,
        });
      }
    }
  });

  return {
    activeMeshCount,
    totalVertices,
    weightedMeshCount,
    deformedMeshCount,
    avgVerticesPerMesh: activeMeshCount > 0 ? totalVertices / activeMeshCount : 0,
    highVertexMeshes: 0, // Will be calculated if needed
    complexMeshes: 0,    // Will be calculated if needed
    meshDetails,
  };
}

/**
 * Analyzes global mesh data across the entire skeleton
 * @param spineInstance The Spine instance to analyze
 * @returns Global mesh analysis data
 */
export function analyzeGlobalMeshes(spineInstance: Spine): GlobalMeshAnalysis {
  const skeleton = spineInstance.skeleton;
  const animations = spineInstance.skeleton?.data?.animations ?? [];

  let totalMeshCount = 0;
  let totalVertices = 0;
  let weightedMeshCount = 0;
  let deformedMeshCount = 0;

  const meshesWithChangesInTimelines = new Map<string, boolean>();
  const meshInfos: MeshInfo[] = [];

  const globalMeshDetails: MeshDetailEntry[] = [];

  // Count total meshes and analyze properties
  skeleton.slots.forEach((slot) => {
    const attachment = slot.getAttachment();
    if (attachment && attachment instanceof MeshAttachment) {
      totalMeshCount++;

      // Count vertices
      const vertexCount = attachment.worldVerticesLength / 2;
      totalVertices += vertexCount;

      // Track meshes with bone weights
      const hasBoneWeights = (attachment.bones?.length ?? 0) > 0;
      if (hasBoneWeights) {
        weightedMeshCount++;
      }

      const hasParentMesh = attachment.getParentMesh() != null;

      let boneInfluences = 1;
      if (hasBoneWeights && attachment.bones) {
        boneInfluences = avgBoneInfluencesForMesh(attachment.bones);
      }

      meshInfos.push({
        slotName: slot.data.name,
        vertices: vertexCount,
        isDeformed: false, // Will be updated below
        boneWeights: attachment.bones?.length || 0,
        hasParentMesh
      });

      globalMeshDetails.push({
        vertices: vertexCount,
        weighted: hasBoneWeights,
        deformed: false, // Will be updated below
        boneInfluences,
      });

      meshesWithChangesInTimelines.set(slot.data.name, false);
    }
  });

  // Analyze animations for mesh changes
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

            // Update mesh info and mesh details
            const meshInfoIdx = meshInfos.findIndex(m => m.slotName === slot.data.name);
            if (meshInfoIdx !== -1) {
              meshInfos[meshInfoIdx].isDeformed = true;
              if (globalMeshDetails[meshInfoIdx]) {
                globalMeshDetails[meshInfoIdx].deformed = true;
              }
            }
          }
        }
      }
    });
  });

  // Sort by vertex count descending
  meshInfos.sort((a, b) => b.vertices - a.vertices);

  // Calculate mesh complexity metrics for performance score
  const metrics: MeshMetrics = {
    activeMeshCount: totalMeshCount,
    totalVertices,
    weightedMeshCount,
    deformedMeshCount,
    avgVerticesPerMesh: totalMeshCount > 0 ? totalVertices / totalMeshCount : 0,
    highVertexMeshes: meshInfos.filter(mesh => mesh.vertices > 50).length,
    complexMeshes: meshInfos.filter(mesh => mesh.vertices > 20 && (mesh.isDeformed || mesh.boneWeights > 0)).length,
    meshDetails: globalMeshDetails,
  };

  return {
    meshes: meshInfos,
    metrics
  };
}
