import { DeformTimeline, MeshAttachment, Spine } from "@esotericsoftware/spine-pixi-v8";
import { PERFORMANCE_FACTORS } from "../constants/performanceFactors";
import { calculateMeshScore, getScoreColor } from "../utils/scoreCalculator";

/**
 * Analyzes mesh attachments in a Spine instance
 * @param spineInstance The Spine instance to analyze
 * @returns HTML output and metrics for mesh analysis
 */
export function analyzeMeshes(spineInstance: Spine): { html: string, metrics: any } {
  const skeleton = spineInstance.skeleton;
  const animations = spineInstance.skeleton.data.animations;

  let totalMeshCount = 0;
  let totalVertices = 0;
  let weightedMeshCount = 0;
  let deformedMeshCount = 0;
  
  const meshesWithChangesInTimelines = new Map();
  const meshWorldVerticesLengths = new Map<string, number>();
  const meshesWithBoneWeights = new Map<string, number>();
  const meshesWithParents = new Map<string, boolean>();
  
  // Count total meshes and analyze properties
  skeleton.slots.forEach((slot) => {
    const attachment = slot.getAttachment();
    if (attachment && attachment instanceof MeshAttachment) {
      totalMeshCount++;
      
      // Count vertices
      const vertexCount = attachment.worldVerticesLength / 2;
      totalVertices += vertexCount;
      meshWorldVerticesLengths.set(slot.data.name, vertexCount);
      
      // Track meshes with bone weights
      if (attachment.bones?.length) {
        weightedMeshCount++;
        meshesWithBoneWeights.set(slot.data.name, attachment.bones.length);
      }
      
      meshesWithChangesInTimelines.set(slot.data.name, false);
      meshesWithParents.set(slot.data.name, attachment.getParentMesh() != null);
    }
  });
  
  // Analyze animations for mesh changes
  animations.forEach((animation) => {
    const timelines = animation.timelines;
    timelines.forEach((timeline) => {
      if (timeline instanceof DeformTimeline) {
        const slotIndex = timeline.slotIndex;
        const slot = skeleton.slots[slotIndex];
        const attachment = slot.getAttachment();
        
        if (attachment && attachment instanceof MeshAttachment) {
          if (!meshesWithChangesInTimelines.get(slot.data.name)) {
            deformedMeshCount++;
            meshesWithChangesInTimelines.set(slot.data.name, true);
          }
        }
      }
    });
  });
  
  // Convert to array for easier rendering in table
  const meshData = Array.from(meshWorldVerticesLengths.keys()).map(key => ({
    slotName: key,
    vertices: meshWorldVerticesLengths.get(key) || 0,
    isDeformed: meshesWithChangesInTimelines.get(key) || false,
    boneWeights: meshesWithBoneWeights.get(key) || 0,
    hasParentMesh: meshesWithParents.get(key) || false
  }));
  
  // Sort by vertex count descending
  meshData.sort((a, b) => b.vertices - a.vertices);
  
  // Calculate mesh complexity metrics for performance score
  const meshComplexityMetrics = {
    totalMeshCount,
    totalVertices,
    weightedMeshCount,
    deformedMeshCount,
    avgVerticesPerMesh: totalMeshCount > 0 ? totalVertices / totalMeshCount : 0,
    highVertexMeshes: meshData.filter(mesh => mesh.vertices > 50).length,
    complexMeshes: meshData.filter(mesh => mesh.vertices > 20 && (mesh.isDeformed || mesh.boneWeights > 0)).length,
    score: 0
  };
  
  // Calculate mesh score using logarithmic scale
  const meshScore = calculateMeshScore(meshComplexityMetrics);
  meshComplexityMetrics.score = meshScore;
  
  // Generate HTML for table
  let html = `
    <div class="mesh-analysis">
      <h3>Mesh Statistics</h3>
      <p>Total meshes: ${totalMeshCount}</p>
      <p>Total vertices: ${totalVertices}</p>
      <p>Meshes with deformation: ${deformedMeshCount}</p>
      <p>Meshes with bone weights: ${weightedMeshCount}</p>
      <p>Meshes with parent mesh: ${Array.from(meshesWithParents.values()).filter(Boolean).length}</p>
      
      <div class="performance-score">
        <h4>Mesh Performance Score: ${meshScore.toFixed(1)}/100</h4>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${meshScore}%; background-color: ${getScoreColor(meshScore)};"></div>
        </div>
      </div>
      
      <div class="analysis-metrics">
        <p><strong>Performance Impact Formula:</strong></p>
        <code>meshScore = 100 - log₂(totalMeshes/${PERFORMANCE_FACTORS.IDEAL_MESH_COUNT} + 1) × 15 
          - log₂(totalVertices/${PERFORMANCE_FACTORS.IDEAL_VERTEX_COUNT} + 1) × 10 
          - (deformedMeshes × ${PERFORMANCE_FACTORS.MESH_DEFORMED_FACTOR}) 
          - (weightedMeshes × ${PERFORMANCE_FACTORS.MESH_WEIGHTED_FACTOR})</code>
      </div>
      
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Slot</th>
            <th>Vertices</th>
            <th>Deformed</th>
            <th>Bone Weights</th>
            <th>Has Parent Mesh</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  meshData.forEach(item => {
    // Determine row color based on vertex count and deformation
    let rowClass = '';
    if (item.vertices > 100 || (item.vertices > 50 && item.isDeformed)) {
      rowClass = 'row-danger';
    } else if (item.vertices > 50 || (item.vertices > 20 && item.isDeformed)) {
      rowClass = 'row-warning';
    }
    
    html += `
      <tr class="${rowClass}">
        <td>${item.slotName}</td>
        <td>${item.vertices}</td>
        <td>${item.isDeformed ? 'Yes' : 'No'}</td>
        <td>${item.boneWeights}</td>
        <td>${item.hasParentMesh ? 'Yes' : 'No'}</td>
      </tr>
    `;
  });
  
  html += `
        </tbody>
      </table>
      
      <div class="analysis-notes">
        <h4>Mesh Performance Impact:</h4>
        <ul>
          <li><strong>Vertex Count:</strong> Each vertex requires memory and processing time. High vertex counts (>50) have significant impact.</li>
          <li><strong>Deformation:</strong> Deforming meshes requires extra calculations per frame - ${PERFORMANCE_FACTORS.MESH_DEFORMED_FACTOR}× more costly than static meshes.</li>
          <li><strong>Bone Weights:</strong> Each bone weight adds matrix multiplication operations - ${PERFORMANCE_FACTORS.MESH_WEIGHTED_FACTOR}× more impact per weighted vertex.</li>
          <li><strong>Optimization Tip:</strong> Use fewer vertices for meshes that deform or have bone weights. Consider using Region attachments for simple shapes.</li>
        </ul>
      </div>
    </div>
  `;
  
  return {html, metrics: meshComplexityMetrics};
}