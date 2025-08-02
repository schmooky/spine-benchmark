import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { PERFORMANCE_FACTORS } from "../constants/performanceFactors";
import { calculateBoneScore, calculateMaxDepth, getScoreColor } from "../utils/scoreCalculator";
import i18n from "../../i18n";

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
        <span class="node-label">${i18n.t('analysis.skeleton.nodeLabel', { name: node.name, x: node.x, y: node.y })}</span>`;
      
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
      <h3>${i18n.t('analysis.skeleton.title')}</h3>
      <p>${i18n.t('analysis.skeleton.statistics.totalBones', { count: totalBones })}</p>
      <p>${i18n.t('analysis.skeleton.statistics.rootBones', { count: rootBones.length })}</p>
      <p>${i18n.t('analysis.skeleton.statistics.maxDepth', { depth: maxDepth })}</p>
      
      <div class="performance-score">
        <h4>${i18n.t('analysis.skeleton.performanceScore.title', { score: boneScore.toFixed(1) })}</h4>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${boneScore}%; background-color: ${getScoreColor(boneScore)};"></div>
        </div>
      </div>
      
      <div class="analysis-metrics">
        <p><strong>${i18n.t('analysis.skeleton.formula.title')}</strong></p>
        <code>${i18n.t('analysis.skeleton.formula.description', { 
          idealBoneCount: PERFORMANCE_FACTORS.IDEAL_BONE_COUNT,
          depthFactor: PERFORMANCE_FACTORS.BONE_DEPTH_FACTOR
        })}</code>
      </div>
      
      <div class="tree-view">
        ${generateTreeHTML(boneTree)}
      </div>
      
      <div class="analysis-notes">
        <h4>${i18n.t('analysis.skeleton.notes.title')}</h4>
        <ul>
          <li><strong>${i18n.t('analysis.skeleton.notes.boneCount')}</strong></li>
          <li><strong>${i18n.t('analysis.skeleton.notes.hierarchyDepth')}</strong></li>
          <li><strong>${i18n.t('analysis.skeleton.notes.recommendation')}</strong></li>
          <li><strong>${i18n.t('analysis.skeleton.notes.optimalStructure')}</strong></li>
        </ul>
      </div>
    </div>
  `;
  
  return {html, metrics};
}