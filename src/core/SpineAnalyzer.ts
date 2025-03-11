import { Spine, VertexAttachment, MeshAttachment, ClippingAttachment, DeformTimeline, BlendMode } from "@esotericsoftware/spine-pixi-v8";
import { BenchmarkData } from "../hooks/useSpineApp";

export class SpineAnalyzer {
  static analyze(spineInstance: Spine): BenchmarkData {
    const meshAnalysis = this.analyzeMeshes(spineInstance);
    const clippingAnalysis = this.analyzeClipping(spineInstance);
    const blendModeAnalysis = this.analyzeBlendModes(spineInstance);
    const skeletonTree = this.createSkeletonTree(spineInstance);
    
    // Generate summary combining the most important metrics
    const summary = this.generateSummary(spineInstance, {
      meshAnalysis,
      clippingAnalysis,
      blendModeAnalysis
    });
    
    return {
      meshAnalysis,
      clippingAnalysis,
      blendModeAnalysis,
      skeletonTree,
      summary
    };
  }
  
  private static analyzeMeshes(spineInstance: Spine): string {
    const skeleton = spineInstance.skeleton;
    const animations = spineInstance.skeleton.data.animations;

    let totalMeshCount = 0;
    let highVertexCount = 0;
    const meshesWithChangesInTimelines = new Map();
    const meshWorldVerticesLengths = new Map<string, number>();
    const meshesWithBoneWeights = new Map<string, number>();
    const meshesWithParents = new Map<string, boolean>();
    
    // Count total meshes and analyze properties
    skeleton.slots.forEach((slot) => {
      const attachment = slot.getAttachment();
      if (attachment && attachment instanceof MeshAttachment) {
        totalMeshCount++;
        
        if (attachment.bones?.length) {
          meshesWithBoneWeights.set(slot.data.name, attachment.bones.length);
        }
        
        meshWorldVerticesLengths.set(
          slot.data.name,
          attachment.worldVerticesLength
        );
        
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
            meshesWithChangesInTimelines.set(slot.data.name, true);
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
    
    // Generate HTML for table
    let html = `
      <div class="mesh-analysis">
        <h3>Mesh Statistics</h3>
        <p>Total meshes: ${totalMeshCount}</p>
        <p>Meshes with deformation: ${Array.from(meshesWithChangesInTimelines.values()).filter(Boolean).length}</p>
        <p>Meshes with bone weights: ${meshesWithBoneWeights.size}</p>
        <p>Meshes with parent mesh: ${Array.from(meshesWithParents.values()).filter(Boolean).length}</p>
        
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
      if (item.vertices > 100) {
        rowClass = 'row-danger';
      } else if (item.vertices > 64) {
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
      </div>
    `;
    
    return html;
  }
  
  private static analyzeClipping(spineInstance: Spine): string {
    const masks: [string, number][] = [];
    
    spineInstance.skeleton.slots.forEach((slot) => {
      if (slot.attachment && slot.attachment instanceof ClippingAttachment) {
        const clipping = slot.attachment as ClippingAttachment;
        const verticesCount = clipping.worldVerticesLength / 2; // Divide by 2 because each vertex has x and y
        masks.push([slot.data.name, verticesCount]);
      }
    });
    
    let html = `
      <div class="clipping-analysis">
        <h3>Clipping Masks</h3>
        <p>Total masks: ${masks.length}</p>
    `;
    
    if (masks.length > 0) {
      html += `
        <table class="benchmark-table">
          <thead>
            <tr>
              <th>Slot Name</th>
              <th>Vertex Count</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      masks.forEach(([slotName, vertexCount]) => {
        const status = vertexCount <= 4 
          ? 'Optimal' 
          : vertexCount <= 8 
            ? 'Acceptable' 
            : 'High Vertex Count';
        
        const rowClass = vertexCount <= 4 
          ? '' 
          : vertexCount <= 8 
            ? 'row-warning' 
            : 'row-danger';
        
        html += `
          <tr class="${rowClass}">
            <td>${slotName}</td>
            <td>${vertexCount}</td>
            <td>${status}</td>
          </tr>
        `;
      });
      
      html += `
          </tbody>
        </table>
        
        <div class="analysis-notes">
          <h4>Notes on Clipping Masks:</h4>
          <ul>
            <li>Clipping masks with 3-4 vertices are the most efficient</li>
            <li>Complex masks with many vertices can significantly impact performance</li>
            <li>Consider simplifying masks with more than 8 vertices</li>
          </ul>
        </div>
      `;
    } else {
      html += `<p>No clipping masks found in this skeleton.</p>`;
    }
    
    html += `</div>`;
    
    return html;
  }
  
  private static analyzeBlendModes(spineInstance: Spine): string {
    const blendModeCount = new Map<BlendMode, number>();
    const slotsWithNonNormalBlendMode = new Map<string, BlendMode>();
    
    // Initialize blend mode counts
    Object.values(BlendMode).forEach(mode => {
      if (typeof mode === 'number') {
        blendModeCount.set(mode as BlendMode, 0);
      }
    });
    
    // Count blend modes
    spineInstance.skeleton.slots.forEach(slot => {
      const blendMode = slot.data.blendMode;
      blendModeCount.set(blendMode, (blendModeCount.get(blendMode) || 0) + 1);
      
      if (blendMode !== BlendMode.Normal) {
        slotsWithNonNormalBlendMode.set(slot.data.name, blendMode);
      }
    });
    
    let html = `
      <div class="blend-mode-analysis">
        <h3>Blend Modes</h3>
        <p>Non-normal blend modes: ${slotsWithNonNormalBlendMode.size}</p>
        
        <table class="benchmark-table">
          <thead>
            <tr>
              <th>Blend Mode</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    // Sort by frequency
    const sortedCounts = Array.from(blendModeCount.entries())
      .sort((a, b) => b[1] - a[1]);
    
    sortedCounts.forEach(([mode, count]) => {
      if (count > 0) {
        const modeName = BlendMode[mode];
        const rowClass = mode !== BlendMode.Normal && count > 0 
          ? 'row-warning' 
          : '';
        
        html += `
          <tr class="${rowClass}">
            <td>${modeName}</td>
            <td>${count}</td>
          </tr>
        `;
      }
    });
    
    html += `
          </tbody>
        </table>
    `;
    
    if (slotsWithNonNormalBlendMode.size > 0) {
      html += `
        <h4>Slots with Non-Normal Blend Modes:</h4>
        <table class="benchmark-table">
          <thead>
            <tr>
              <th>Slot Name</th>
              <th>Blend Mode</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      slotsWithNonNormalBlendMode.forEach((mode, slotName) => {
        html += `
          <tr>
            <td>${slotName}</td>
            <td>${BlendMode[mode]}</td>
          </tr>
        `;
      });
      
      html += `
          </tbody>
        </table>
        
        <div class="analysis-notes">
          <h4>Notes on Blend Modes:</h4>
          <ul>
            <li>Non-normal blend modes (Add, Multiply) cause additional rendering passes</li>
            <li>Try to limit the number of slots with non-normal blend modes</li>
            <li>Group slots with the same blend mode together when possible</li>
          </ul>
        </div>
      `;
    }
    
    html += `</div>`;
    
    return html;
  }
  
  private static createSkeletonTree(spineInstance: Spine): string {
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
        <p>Total bones: ${skeleton.bones.length}</p>
        <p>Root bones: ${rootBones.length}</p>
        <p>Max depth: ${this.calculateMaxDepth(boneTree)}</p>
        
        <div class="tree-view">
          ${generateTreeHTML(boneTree)}
        </div>
      </div>
    `;
    
    return html;
  }
  
  private static calculateMaxDepth(nodes: any[]): number {
    if (!nodes || nodes.length === 0) return 0;
    
    return 1 + Math.max(...nodes.map(node => 
      node.children ? this.calculateMaxDepth(node.children) : 0
    ));
  }
  
  private static generateSummary(
    spineInstance: Spine, 
    analyses: { 
      meshAnalysis: string; 
      clippingAnalysis: string; 
      blendModeAnalysis: string;
    }
  ): string {
    const skeleton = spineInstance.skeleton;
    
    // Calculate overall stats
    const totalBones = skeleton.bones.length;
    const totalSlots = skeleton.slots.length;
    const totalMeshes = skeleton.slots.filter(slot => 
      slot.getAttachment() instanceof MeshAttachment
    ).length;
    const totalClippings = skeleton.slots.filter(slot => 
      slot.getAttachment() instanceof ClippingAttachment
    ).length;
    const nonNormalBlendModes = skeleton.slots.filter(slot => 
      slot.data.blendMode !== BlendMode.Normal
    ).length;
    
    // Evaluate performance concerns
    let performanceConcerns = [];
    let optimizationTips = [];
    
    // Mesh concerns
    if (totalMeshes > 20) {
      performanceConcerns.push('High number of meshes');
      optimizationTips.push('Consider reducing the number of meshes');
    }
    
    // Bone concerns
    if (totalBones > 50) {
      performanceConcerns.push('High number of bones');
      optimizationTips.push('Simplify skeleton hierarchy if possible');
    }
    
    // Clipping concerns
    if (totalClippings > 3) {
      performanceConcerns.push('Multiple clipping masks');
      optimizationTips.push('Reduce the number of clipping masks');
    }
    
    // Blend mode concerns
    if (nonNormalBlendModes > 4) {
      performanceConcerns.push('Many non-normal blend modes');
      optimizationTips.push('Limit the use of Add and Multiply blend modes');
    }
    
    // Generate performance score (simplified version)
    let performanceScore = 100;
    performanceScore -= totalBones > 50 ? 10 : 0;
    performanceScore -= totalMeshes > 20 ? 15 : 0;
    performanceScore -= totalClippings * 5;
    performanceScore -= nonNormalBlendModes * 3;
    
    // Cap the score
    performanceScore = Math.max(0, Math.min(100, performanceScore));
    
    // Determine score color
    let scoreColor = performanceScore >= 80 
      ? 'green' 
      : performanceScore >= 60 
        ? 'orange' 
        : 'red';
    
    let html = `
      <div class="benchmark-summary">
        <h3>Performance Summary</h3>
        
        <div class="score-container">
          <div class="performance-score" style="color: ${scoreColor}">
            ${performanceScore}
          </div>
          <div class="score-label">Performance Score</div>
        </div>
        
        <div class="skeleton-stats">
          <h4>Skeleton Statistics</h4>
          <table class="stats-table">
            <tr>
              <td>Bones:</td>
              <td>${totalBones}</td>
            </tr>
            <tr>
              <td>Slots:</td>
              <td>${totalSlots}</td>
            </tr>
            <tr>
              <td>Meshes:</td>
              <td>${totalMeshes}</td>
            </tr>
            <tr>
              <td>Clipping Masks:</td>
              <td>${totalClippings}</td>
            </tr>
            <tr>
              <td>Non-Normal Blend Modes:</td>
              <td>${nonNormalBlendModes}</td>
            </tr>
          </table>
        </div>
    `;
    
    if (performanceConcerns.length > 0) {
      html += `
        <div class="performance-concerns">
          <h4>Performance Concerns</h4>
          <ul>
            ${performanceConcerns.map(concern => `<li>${concern}</li>`).join('')}
          </ul>
        </div>
      `;
    }
    
    if (optimizationTips.length > 0) {
      html += `
        <div class="optimization-tips">
          <h4>Optimization Tips</h4>
          <ul>
            ${optimizationTips.map(tip => `<li>${tip}</li>`).join('')}
          </ul>
        </div>
      `;
    }
    
    html += `
      </div>
    `;
    
    return html;
  }
}