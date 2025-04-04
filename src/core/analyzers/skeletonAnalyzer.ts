import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { PERFORMANCE_FACTORS } from "../constants/performanceFactors";
import { calculateBoneScore, calculateMaxDepth, getScoreColor } from "../utils/scoreCalculator";

/**
 * Analyzes the skeleton structure of a Spine instance
 * @param spineInstance The Spine instance to analyze
 * @returns HTML output and metrics for skeleton structure analysis
 */
export function createSkeletonTree(spineInstance: Spine): { html: string, metrics: any } {
  const skeleton = spineInstance.skeleton;
  
  // Generate tree structure
  function buildBoneNode(bone: any): any {
    const children = bone.children || [];
    return {
      name: bone.data.name,
      type: 'bone',
      x: bone.x.toFixed(2),
      y: bone.y.toFixed(2),
      children: children.map(buildBoneNode)
    };
  }
  
  const rootBones = skeleton.bones.filter(bone => !bone.parent);
  const boneTree = rootBones.map(buildBoneNode);
  
  const maxDepth = calculateMaxDepth(boneTree);
  const totalBones = skeleton.bones.length;
  
  // Calculate bone score
  const boneScore = calculateBoneScore(totalBones, maxDepth);
  
  const metrics = {
    totalBones,
    rootBones: rootBones.length,
    maxDepth,
    score: boneScore
  };
  
  // Generate HTML for the tree
  function generateTreeHTML(nodes: any[]): string {
    if (nodes.length === 0) return '';
    
    let html = '<ul class="skeleton-tree">';
    
    nodes.forEach(node => {
      html += `<li class="tree-node">
        <span class="node-label">${node.name} (x: ${node.x}, y: ${node.y})</span>`;
      
      if (node.children && node.children.length > 0) {
        html += generateTreeHTML(node.children);
      }
      
      html += '</li>';
    });
    
    html += '</ul>';
    return html;
  }
  
  let html = `
    <div class="skeleton-tree-container">
      <h3>Skeleton Structure</h3>
      <p>Total bones: ${totalBones}</p>
      <p>Root bones: ${rootBones.length}</p>
      <p>Max depth: ${maxDepth}</p>
      
      <div class="performance-score">
        <h4>Bone Structure Performance Score: ${boneScore.toFixed(1)}/100</h4>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${boneScore}%; background-color: ${getScoreColor(boneScore)};"></div>
        </div>
      </div>
      
      <div class="analysis-metrics">
        <p><strong>Performance Impact Formula:</strong></p>
        <code>boneScore = 100 - log₂(totalBones/${PERFORMANCE_FACTORS.IDEAL_BONE_COUNT} + 1) × 15 
          - (maxDepth × ${PERFORMANCE_FACTORS.BONE_DEPTH_FACTOR})</code>
      </div>
      
      <div class="tree-view">
        ${generateTreeHTML(boneTree)}
      </div>
      
      <div class="analysis-notes">
        <h4>Notes on Bone Structure:</h4>
        <ul>
          <li><strong>Bone Count:</strong> Each bone requires matrix computations every frame</li>
          <li><strong>Hierarchy Depth:</strong> Deep hierarchies increase transformation complexity exponentially</li>
          <li><strong>Recommendation:</strong> Keep bone hierarchies under 5 levels deep when possible</li>
          <li><strong>Optimal Structure:</strong> Flat hierarchies with few parent-child relationships perform better</li>
        </ul>
      </div>
    </div>
  `;
  
  return {html, metrics};
}