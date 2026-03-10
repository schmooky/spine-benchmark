import { Animation, ClippingAttachment, Spine } from '@esotericsoftware/spine-pixi-v8';
import type { ActiveComponents } from '@spine-benchmark/metrics-sampling';

export interface ClippingMetrics {
  activeMaskCount: number;
  maskCount: number; // For compatibility
  totalVertices: number;
  complexMasks: number;
}

export interface ClippingMaskInfo {
  slotName: string;
  vertexCount: number;
}

export interface GlobalClippingAnalysis {
  masks: ClippingMaskInfo[];
  metrics: ClippingMetrics;
}

/**
 * Analyzes clipping masks for a specific animation
 * @param spineInstance The Spine instance to analyze
 * @param animation The animation to analyze
 * @param activeComponents Components active in this animation
 * @returns Metrics for clipping analysis
 */
export function analyzeClippingForAnimation(
  spineInstance: Spine,
  animation: Animation,
  activeComponents: ActiveComponents
): ClippingMetrics {
  const skeleton = spineInstance.skeleton;
  
  let activeMaskCount = 0;
  let totalVertices = 0;
  let complexMasks = 0;
  
  console.log(`Analyzing clipping for ${animation.name}, active slots: ${activeComponents.slots.size}`);
  
  // Only analyze clipping masks in active slots
  activeComponents.slots.forEach(slotName => {
    const slot = skeleton.slots.find((s: any) => s.data.name === slotName);
    
    if (slot) {
      const attachment = slot.getAttachment();
      
      if (attachment && attachment instanceof ClippingAttachment) {
        activeMaskCount++;
        const verticesCount = attachment.worldVerticesLength / 2;
        totalVertices += verticesCount;
        
        if (verticesCount > 4) {
          complexMasks++;
        }
        
        console.log(`Found clipping mask in slot ${slotName} with ${verticesCount} vertices`);
      }
    }
  });
  
  return {
    activeMaskCount,
    maskCount: activeMaskCount, // For compatibility
    totalVertices,
    complexMasks
  };
}

/**
 * Analyzes global clipping masks across the entire skeleton
 * @param spineInstance The Spine instance to analyze
 * @returns Global clipping analysis data
 */
export function analyzeGlobalClipping(spineInstance: Spine): GlobalClippingAnalysis {
  const masks: ClippingMaskInfo[] = [];
  let totalVertices = 0;
  
  spineInstance.skeleton.slots.forEach((slot) => {
    if (slot.attachment && slot.attachment instanceof ClippingAttachment) {
      const clipping = slot.attachment as ClippingAttachment;
      const verticesCount = clipping.worldVerticesLength / 2;
      masks.push({
        slotName: slot.data.name,
        vertexCount: verticesCount
      });
      totalVertices += verticesCount;
    }
  });
  
  // Calculate complexity metrics
  const complexMasks = masks.filter(mask => mask.vertexCount > 4).length;
  
  const metrics: ClippingMetrics = {
    activeMaskCount: masks.length,
    maskCount: masks.length,
    totalVertices,
    complexMasks
  };
  
  return {
    masks,
    metrics
  };
}
