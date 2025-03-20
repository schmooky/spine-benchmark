import { BlendMode, ClippingAttachment, DeformTimeline, MeshAttachment, Spine } from "@esotericsoftware/spine-pixi-v8";
import { BenchmarkData } from "../hooks/useSpineApp";

export class SpineAnalyzer {
  
  private static analyzeMeshes(spineInstance: Spine): string {
    const skeleton = spineInstance.skeleton;
    const animations = spineInstance.skeleton.data.animations;

    let totalMeshCount = 0;
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

  static analyze(spineInstance: Spine): BenchmarkData {
    const meshAnalysis = this.analyzeMeshes(spineInstance);
    const clippingAnalysis = this.analyzeClipping(spineInstance);
    const blendModeAnalysis = this.analyzeBlendModes(spineInstance);
    const skeletonTree = this.createSkeletonTree(spineInstance);
    const physicsAnalysis = this.analyzePhysics(spineInstance);
    
    // Generate summary combining the most important metrics
    const summary = this.generateSummary(spineInstance, {
      meshAnalysis,
      clippingAnalysis,
      blendModeAnalysis,
      physicsAnalysis
    });
    
    return {
      meshAnalysis,
      clippingAnalysis,
      blendModeAnalysis,
      skeletonTree,
      physicsAnalysis,
      summary
    };
  }
  
  // New method to analyze physics constraints
  private static analyzePhysics(spineInstance: Spine): string {
    const skeleton = spineInstance.skeleton;
    
    // Get all constraints
    const ikConstraints = skeleton.ikConstraints;
    const transformConstraints = skeleton.transformConstraints;
    const pathConstraints = skeleton.pathConstraints;
    const physicsConstraints = skeleton.physicsConstraints;
    
    // Analyze IK Constraints
    const ikData = ikConstraints.map(constraint => ({
      name: constraint.data.name,
      target: constraint.target.data.name,
      bones: constraint.bones.map(bone => bone.data.name),
      mix: constraint.mix,
      softness: constraint.softness,
      bendDirection: constraint.bendDirection,
      compress: constraint.compress,
      stretch: constraint.stretch,
      isActive: constraint.isActive()
    }));
    
    // Analyze Transform Constraints
    const transformData = transformConstraints.map(constraint => ({
      name: constraint.data.name,
      target: constraint.target.data.name,
      bones: constraint.bones.map(bone => bone.data.name),
      mixRotate: constraint.mixRotate,
      mixX: constraint.mixX,
      mixY: constraint.mixY,
      mixScaleX: constraint.mixScaleX,
      mixScaleY: constraint.mixScaleY,
      mixShearY: constraint.mixShearY,
      isActive: constraint.isActive(),
      isLocal: constraint.data.local,
      isRelative: constraint.data.relative
    }));
    
    // Analyze Path Constraints
    const pathData = pathConstraints.map(constraint => {
      const positionMode = constraint.data.positionMode; // Fixed or Percent
      const spacingMode = constraint.data.spacingMode; // Length, Fixed, Percent, or Proportional
      const rotateMode = constraint.data.rotateMode; // Tangent, Chain, or ChainScale
      
      return {
        name: constraint.data.name,
        target: constraint.target.data.name,
        bones: constraint.bones.map(bone => bone.data.name),
        mixRotate: constraint.mixRotate,
        mixX: constraint.mixX,
        mixY: constraint.mixY,
        position: constraint.position,
        spacing: constraint.spacing,
        positionMode: positionMode,
        spacingMode: spacingMode,
        rotateMode: rotateMode,
        offsetRotation: constraint.data.offsetRotation,
        isActive: constraint.isActive(),
        // Track complexity: world positions, curves, segments arrays
        worldPositionsCount: constraint.world ? constraint.world.length / 3 : 0,
        hasSegments: constraint.segments && constraint.segments.length > 0,
        hasLengths: constraint.lengths && constraint.lengths.length > 0
      };
    });
    
    // Analyze Physics Constraints
    const physicsData = physicsConstraints.map(constraint => ({
      name: constraint.data.name,
      bone: constraint.bone.data.name,
      inertia: constraint.inertia,
      strength: constraint.strength,
      damping: constraint.damping,
      massInverse: constraint.massInverse,
      wind: constraint.wind,
      gravity: constraint.gravity,
      mix: constraint.mix,
      affectsX: constraint.data.x > 0,
      affectsY: constraint.data.y > 0,
      affectsRotation: constraint.data.rotate > 0,
      affectsScale: constraint.data.scaleX > 0,
      affectsShear: constraint.data.shearX > 0,
      isActive: constraint.isActive()
    }));
    
    // Calculate constraint performance impact scores
    const ikImpact = this.calculateIkImpact(ikData);
    const transformImpact = this.calculateTransformImpact(transformData);
    const pathImpact = this.calculatePathImpact(pathData);
    const physicsImpact = this.calculatePhysicsImpact(physicsData);
    
    // Generate HTML
    let html = `
      <div class="physics-analysis">
        <h3>Constraints Analysis</h3>
        <p>Total constraints: ${ikConstraints.length + transformConstraints.length + pathConstraints.length + physicsConstraints.length}</p>
        
        <div class="constraint-summary">
          <div class="constraint-type">
            <h4>IK Constraints: ${ikConstraints.length}</h4>
            <div class="impact-meter" style="width: ${ikImpact}%"></div>
            <div class="impact-value">Impact: ${ikImpact}%</div>
          </div>
          
          <div class="constraint-type">
            <h4>Transform Constraints: ${transformConstraints.length}</h4>
            <div class="impact-meter" style="width: ${transformImpact}%"></div>
            <div class="impact-value">Impact: ${transformImpact}%</div>
          </div>
          
          <div class="constraint-type">
            <h4>Path Constraints: ${pathConstraints.length}</h4>
            <div class="impact-meter" style="width: ${pathImpact}%"></div>
            <div class="impact-value">Impact: ${pathImpact}%</div>
          </div>
          
          <div class="constraint-type">
            <h4>Physics Constraints: ${physicsConstraints.length}</h4>
            <div class="impact-meter" style="width: ${physicsImpact}%"></div>
            <div class="impact-value">Impact: ${physicsImpact}%</div>
          </div>
        </div>
    `;
    
    // IK Constraints Table
    if (ikData.length > 0) {
      html += `
        <div class="constraint-details">
          <h4>IK Constraints</h4>
          <table class="benchmark-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Target</th>
                <th>Bones</th>
                <th>Mix</th>
                <th>Softness</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      ikData.forEach(ik => {
        const complexityClass = ik.bones.length > 2 ? 'row-warning' : '';
        
        html += `
          <tr class="${complexityClass}">
            <td>${ik.name}</td>
            <td>${ik.target}</td>
            <td>${ik.bones.join(', ')}</td>
            <td>${ik.mix.toFixed(2)}</td>
            <td>${ik.softness.toFixed(2)}</td>
            <td>${ik.isActive ? 'Active' : 'Inactive'}</td>
          </tr>
        `;
      });
      
      html += `
            </tbody>
          </table>
        </div>
      `;
    }
    
    // Physics Constraints Table
    if (physicsData.length > 0) {
      html += `
        <div class="constraint-details">
          <h4>Physics Constraints</h4>
          <table class="benchmark-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Bone</th>
                <th>Properties</th>
                <th>Strength</th>
                <th>Damping</th>
                <th>Mix</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      physicsData.forEach(physics => {
        // Determine which properties are affected
        const affectedProps = [];
        if (physics.affectsX) affectedProps.push('X');
        if (physics.affectsY) affectedProps.push('Y');
        if (physics.affectsRotation) affectedProps.push('Rotation');
        if (physics.affectsScale) affectedProps.push('Scale');
        if (physics.affectsShear) affectedProps.push('Shear');
        
        const complexityClass = affectedProps.length >= 3 ? 'row-warning' : '';
        
        html += `
          <tr class="${complexityClass}">
            <td>${physics.name}</td>
            <td>${physics.bone}</td>
            <td>${affectedProps.join(', ')}</td>
            <td>${physics.strength.toFixed(2)}</td>
            <td>${physics.damping.toFixed(2)}</td>
            <td>${physics.mix.toFixed(2)}</td>
            <td>${physics.isActive ? 'Active' : 'Inactive'}</td>
          </tr>
        `;
      });
      
      html += `
            </tbody>
          </table>
        </div>
      `;
    }
    
    // Path Constraints Table
    if (pathData.length > 0) {
      html += `
        <div class="constraint-details">
          <h4>Path Constraints</h4>
          <table class="benchmark-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Target</th>
                <th>Bones</th>
                <th>Position Mode</th>
                <th>Spacing Mode</th>
                <th>Rotate Mode</th>
                <th>Mix</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      pathData.forEach(path => {
        // Determine the complexity level
        let complexityClass = '';
        
        // ChainScale and many bones is most complex
        if (path.rotateMode === 2 && path.bones.length > 3) {
          complexityClass = 'row-danger';
        } 
        // Proportional spacing or complex path is medium complexity
        else if (path.spacingMode === 3 || path.worldPositionsCount > 20) {
          complexityClass = 'row-warning';
        }
        
        // Get human-readable enum values
        const positionModes = ['Fixed', 'Percent'];
        const spacingModes = ['Length', 'Fixed', 'Percent', 'Proportional'];
        const rotateModes = ['Tangent', 'Chain', 'ChainScale'];
        
        const positionModeName = positionModes[path.positionMode] || 'Unknown';
        const spacingModeName = spacingModes[path.spacingMode] || 'Unknown';
        const rotateModeName = rotateModes[path.rotateMode] || 'Unknown';
        
        // Display mix as the max of all mixes
        const mixValue = Math.max(path.mixRotate, Math.max(path.mixX, path.mixY));
        
        html += `
          <tr class="${complexityClass}">
            <td>${path.name}</td>
            <td>${path.target}</td>
            <td>${path.bones.length} bones</td>
            <td>${positionModeName}</td>
            <td>${spacingModeName}</td>
            <td>${rotateModeName}</td>
            <td>${mixValue.toFixed(2)}</td>
            <td>${path.isActive ? 'Active' : 'Inactive'}</td>
          </tr>
        `;
      });
      
      html += `
            </tbody>
          </table>
        </div>
      `;
    }
    
    // Transform Constraints Table (simplified)
    if (transformData.length > 0) {
      html += `
        <div class="constraint-details">
          <h4>Transform Constraints</h4>
          <table class="benchmark-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Target</th>
                <th>Bones</th>
                <th>Mix (R/X/Y/ScaleX/ScaleY/ShearY)</th>
                <th>Local/Relative</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      transformData.forEach(transform => {
        const complexityClass = (transform.isLocal && transform.isRelative) ? 'row-warning' : '';
        
        html += `
          <tr class="${complexityClass}">
            <td>${transform.name}</td>
            <td>${transform.target}</td>
            <td>${transform.bones.join(', ')}</td>
            <td>${transform.mixRotate.toFixed(1)}/${transform.mixX.toFixed(1)}/${transform.mixY.toFixed(1)}/${
              transform.mixScaleX.toFixed(1)}/${transform.mixScaleY.toFixed(1)}/${transform.mixShearY.toFixed(1)}</td>
            <td>${transform.isLocal ? 'Local' : 'World'}/${transform.isRelative ? 'Relative' : 'Absolute'}</td>
            <td>${transform.isActive ? 'Active' : 'Inactive'}</td>
          </tr>
        `;
      });
      
      html += `
            </tbody>
          </table>
        </div>
      `;
    
    // Add performance notes
    html += `
      <div class="analysis-notes">
        <h4>Physics Performance Notes:</h4>
        <ul>
          <li><strong>IK Constraints:</strong> Each IK constraint with multiple bones increases computational cost. Chains with more than 2 bones are particularly expensive.</li>
          <li><strong>Physics Constraints:</strong> These have the highest performance impact as they run continuous simulations. The more properties affected (X, Y, Rotation, Scale, Shear), the higher the cost.</li>
          <li><strong>Transform Constraints:</strong> Multiple transform constraints increase computation but are generally less expensive than physics.</li>
          <li><strong>Path Constraints:</strong> Path constraints complexity depends on:
            <ul>
              <li>The number of bones controlled by the path</li>
              <li>The rotate mode (ChainScale is most expensive)</li>
              <li>The spacing mode (Proportional is most expensive)</li>
              <li>The complexity of the path itself (number of segments and curves)</li>
              <li>The world position calculation overhead</li>
            </ul>
          </li>
          <li><strong>Tips:</strong>
            <ul>
              <li>Consider using lower-frequency physics updates (Physics.pose) when many physics constraints are active</li>
              <li>For path constraints, use simpler rotate modes when possible (Tangent instead of ChainScale)</li>
              <li>Use Fixed spacing mode instead of Proportional for better performance</li>
              <li>Simplify paths with many curve segments</li>
            </ul>
          </li>
        </ul>
      </div>
    `;
    
    html += `</div>`;
    
    return html;
  }}

  // Helper methods to calculate performance impact of constraints
  private static calculateIkImpact(ikData: any[]): number {
    if (ikData.length === 0) return 0;
    
    // Calculate logarithmic impact based on number of constraints and bones affected
    let totalBones = 0;
    ikData.forEach(ik => {
      totalBones += ik.bones.length;
    });
    
    // Base formula: log₂(numConstraints + 1) * 20 + log₂(totalBones + 1) * 10
    const impact = Math.log2(ikData.length + 1) * 20 + Math.log2(totalBones + 1) * 10;
    return Math.min(Math.round(impact), 100); // Cap at 100%
  }
  
  private static calculateTransformImpact(transformData: any[]): number {
    if (transformData.length === 0) return 0;
    
    // Calculate impact based on total constraints and affected bones
    let totalBones = 0;
    let complexityFactor = 0;
    
    transformData.forEach(transform => {
      totalBones += transform.bones.length;
      // Add complexity for local or relative transforms
      complexityFactor += transform.isLocal ? 0.5 : 0;
      complexityFactor += transform.isRelative ? 0.5 : 0;
    });
    
    // Formula: log₂(numConstraints + 1) * 15 + log₂(totalBones + 1) * 8 + complexityFactor * 5
    const impact = Math.log2(transformData.length + 1) * 15 + 
                  Math.log2(totalBones + 1) * 8 + 
                  complexityFactor * 5;
                  
    return Math.min(Math.round(impact), 100);
  }
  
  private static calculatePathImpact(pathData: any[]): number {
    if (pathData.length === 0) return 0;
    
    let totalBones = 0;
    let complexityFactor = 0;
    
    pathData.forEach(path => {
      totalBones += path.bones.length;
      
      // Add complexity for more demanding rotate modes
      // RotateMode: Tangent(0), Chain(1), ChainScale(2)
      if (path.rotateMode === 2) complexityFactor += 1.5; // ChainScale is most expensive
      else if (path.rotateMode === 1) complexityFactor += 0.7; // Chain is medium
      
      // SpacingMode: Length(0), Fixed(1), Percent(2), Proportional(3)
      if (path.spacingMode === 3) complexityFactor += 1.0; // Proportional is most expensive
      else if (path.spacingMode === 2) complexityFactor += 0.5; // Percent is medium
      
      // PositionMode: Fixed(0), Percent(1)
      if (path.positionMode === 1) complexityFactor += 0.3; // Percent needs more calculation
      
      // Complex paths with many internal calculations
      if (path.worldPositionsCount > 30) complexityFactor += 1.5;
      else if (path.worldPositionsCount > 20) complexityFactor += 1.0;
      else if (path.worldPositionsCount > 10) complexityFactor += 0.5;
      
      // Additional complexity for active segments and lengths calculations
      if (path.hasSegments) complexityFactor += 0.5;
      if (path.hasLengths) complexityFactor += 0.5;
    });
    
    // Higher impact formula based on detailed analysis of PathConstraint implementation
    // The computeWorldPositions and curve calculation methods are particularly expensive
    const impact = Math.log2(pathData.length + 1) * 20 + 
                  Math.log2(totalBones + 1) * 10 + 
                  complexityFactor * 7;
                  
    return Math.min(Math.round(impact), 100);
  }
  
  private static calculatePhysicsImpact(physicsData: any[]): number {
    if (physicsData.length === 0) return 0;
    
    let complexityFactor = 0;
    
    physicsData.forEach(physics => {
      // Count affected properties
      let propertiesAffected = 0;
      if (physics.affectsX) propertiesAffected++;
      if (physics.affectsY) propertiesAffected++;
      if (physics.affectsRotation) propertiesAffected++;
      if (physics.affectsScale) propertiesAffected++;
      if (physics.affectsShear) propertiesAffected++;
      
      // Physics complexity scales with properties affected
      complexityFactor += propertiesAffected * 1.5;
      
      // Higher strength and lower damping means more iterations potentially needed
      if (physics.strength > 10 && physics.damping < 0.3) complexityFactor += 1;
    });
    
    // Physics has the highest base impact
    // Formula: log₂(numConstraints + 1) * 30 + complexityFactor * 5
    const impact = Math.log2(physicsData.length + 1) * 30 + complexityFactor * 5;
    
    return Math.min(Math.round(impact), 100);
  }
  
  // Update the generate summary method to include physics analysis
  private static generateSummary(
    spineInstance: Spine, 
    analyses: { 
      meshAnalysis: string; 
      clippingAnalysis: string; 
      blendModeAnalysis: string;
      physicsAnalysis: string;
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
    
    // Count constraints
    const totalIkConstraints = skeleton.ikConstraints.length;
    const totalTransformConstraints = skeleton.transformConstraints.length;
    const totalPathConstraints = skeleton.pathConstraints.length;
    const totalPhysicsConstraints = skeleton.physicsConstraints.length;
    const totalConstraints = totalIkConstraints + totalTransformConstraints + 
                             totalPathConstraints + totalPhysicsConstraints;
    
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
    
    // Physics concerns
    if (totalConstraints > 10) {
      performanceConcerns.push('High number of constraints');
      optimizationTips.push('Reduce the number of active constraints');
    }
    
    if (totalPhysicsConstraints > 5) {
      performanceConcerns.push('Many physics constraints');
      optimizationTips.push('Consider reducing physics constraints or simplifying the physics properties');
    }
    
    if (totalPhysicsConstraints > 0 && totalIkConstraints > 3) {
      performanceConcerns.push('Combined physics and IK constraints');
      optimizationTips.push('Physics combined with many IK constraints can cause significant performance issues');
    }
    
    // Generate performance score (logarithmic scaling for better representation)
    let performanceScore = 100;
    
    // Base deductions for counts
    performanceScore -= Math.log2(totalBones + 1) * 3;
    performanceScore -= Math.log2(totalMeshes + 1) * 4;
    performanceScore -= totalClippings * 5;
    performanceScore -= nonNormalBlendModes * 3;
    
    // Constraint deductions (physics has highest impact)
    performanceScore -= Math.log2(totalIkConstraints + 1) * 5;
    performanceScore -= Math.log2(totalTransformConstraints + 1) * 4;
    performanceScore -= Math.log2(totalPathConstraints + 1) * 6;
    performanceScore -= Math.log2(totalPhysicsConstraints + 1) * 10;
    
    // Additional deduction for combined constraints
    if (totalPhysicsConstraints > 0 && totalIkConstraints > 0) {
      performanceScore -= 5; // Penalty for combining physics with IK
    }
    
    // Cap the score
    performanceScore = Math.max(0, Math.min(100, Math.round(performanceScore)));
    
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
            <tr>
              <td>IK Constraints:</td>
              <td>${totalIkConstraints}</td>
            </tr>
            <tr>
              <td>Transform Constraints:</td>
              <td>${totalTransformConstraints}</td>
            </tr>
            <tr>
              <td>Path Constraints:</td>
              <td>${totalPathConstraints}</td>
            </tr>
            <tr>
              <td>Physics Constraints:</td>
              <td>${totalPhysicsConstraints}</td>
            </tr>
          </table>
        </div>
    `;
    
    // Physics Performance Impact
    if (totalConstraints > 0) {
      html += `
        <div class="physics-impact">
          <h4>Physics & Constraints Impact</h4>
          <div class="impact-breakdown">
            <div class="constraint-group">
              <span>IK:</span>
              <div class="impact-bar">
                <div class="impact-fill" style="width: ${Math.min(totalIkConstraints * 10, 100)}%"></div>
              </div>
            </div>
            <div class="constraint-group">
              <span>Transform:</span>
              <div class="impact-bar">
                <div class="impact-fill" style="width: ${Math.min(totalTransformConstraints * 8, 100)}%"></div>
              </div>
            </div>
            <div class="constraint-group">
              <span>Path:</span>
              <div class="impact-bar">
                <div class="impact-fill" style="width: ${Math.min(totalPathConstraints * 12, 100)}%"></div>
              </div>
            </div>
            <div class="constraint-group">
              <span>Physics:</span>
              <div class="impact-bar">
                <div class="impact-fill" style="width: ${Math.min(totalPhysicsConstraints * 20, 100)}%"></div>
              </div>
            </div>
          </div>
        </div>
      `;
    }
    
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