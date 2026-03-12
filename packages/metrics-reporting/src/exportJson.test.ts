import { describe, expect, it } from 'vitest';
import { exportAnalysisJson } from './index';

describe('metrics-reporting', () => {
  it('exports stable JSON structure for analysis result', () => {
    const analysis = {
      skeletonName: 'hero',
      totalAnimations: 2,
      totalSkins: 1,
      skeleton: { metrics: { totalBones: 10, maxDepth: 3 } },
      animations: [
        {
          name: 'idle',
          duration: 1.2,
          meshMetrics: { activeMeshCount: 1, totalVertices: 50, deformedMeshCount: 0, weightedMeshCount: 0 },
          clippingMetrics: { activeMaskCount: 0, totalVertices: 0, complexMasks: 0 },
          blendModeMetrics: { activeNonNormalCount: 0, activeAdditiveCount: 0, activeMultiplyCount: 0 },
          constraintMetrics: { activePhysicsCount: 0, activeIkCount: 1, activeTransformCount: 0, activePathCount: 0, totalActiveConstraints: 1 }
        }
      ],
      globalMesh: {},
      globalClipping: {},
      globalBlendMode: {},
      globalPhysics: {},
      stats: {
        animationsWithPhysics: 0,
        animationsWithClipping: 0,
        animationsWithBlendModes: 0,
        animationsWithIK: 1,
        animationsWithTransform: 0,
        animationsWithPath: 0,
        highVertexAnimations: 0
      }
    } as any;

    const json = exportAnalysisJson(analysis) as any;

    expect(json.skeleton.name).toBe('hero');
    expect(json.skeleton.bones).toBe(10);
    expect(json.animations).toHaveLength(1);
    expect(json.animations[0].metrics.mesh.vertices).toBe(50);
    expect(json.animations[0].metrics.constraints.total).toBe(1);
  });

  it('handles empty animations', () => {
    const analysis = {
      skeletonName: 'empty',
      totalAnimations: 0,
      totalSkins: 0,
      skeleton: { metrics: { totalBones: 0, maxDepth: 0 } },
      animations: [],
      globalMesh: {},
      globalClipping: {},
      globalBlendMode: {},
      globalPhysics: {},
      stats: {
        animationsWithPhysics: 0,
        animationsWithClipping: 0,
        animationsWithBlendModes: 0,
        animationsWithIK: 0,
        animationsWithTransform: 0,
        animationsWithPath: 0,
        highVertexAnimations: 0
      }
    } as any;

    const json = exportAnalysisJson(analysis) as any;
    expect(json.animations).toHaveLength(0);
  });
});
