import { Animation, ClippingAttachment, Spine } from '@esotericsoftware/spine-pixi-v8';
import { PERFORMANCE_FACTORS } from '../constants/performanceFactors';
import { calculateClippingScore } from '../utils/scoreCalculator';
import { ActiveComponents } from '../utils/animationUtils';

export interface ClippingMetrics {
  activeMaskCount: number;
  maskCount: number;
  totalVertices: number;
  complexMasks: number;
  score: number;
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
  
  const clippingScore = calculateClippingScore(activeMaskCount, totalVertices, complexMasks);
  
  return {
    activeMaskCount,
    maskCount: activeMaskCount,
    totalVertices,
    complexMasks,
    score: clippingScore
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
  
  const complexMasks = masks.filter(mask => mask.vertexCount > 4).length;
  
  const clippingScore = calculateClippingScore(masks.length, totalVertices, complexMasks);
  
  const metrics: ClippingMetrics = {
    activeMaskCount: masks.length,
    maskCount: masks.length,
    totalVertices,
    complexMasks,
    score: clippingScore
  };
  
  return {
    masks,
    metrics
  };
}