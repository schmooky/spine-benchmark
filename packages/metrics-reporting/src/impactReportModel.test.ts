import { describe, expect, it } from 'vitest';
import {
  buildImpactDeltaModel,
  buildImpactReportModel,
  ImpactSupplementalMetrics,
} from './impactReportModel';

function createAnalysis(overrides?: Partial<any>): any {
  return {
    skeletonName: 'hero',
    totalAnimations: 2,
    totalSkins: 1,
    skeleton: {
      metrics: {
        totalBones: 42,
        maxDepth: 6,
        score: 0,
      },
    },
    animations: [
      {
        name: 'walk',
        duration: 1.2,
        overallScore: 0,
        meshMetrics: {
          activeMeshCount: 6,
          totalVertices: 820,
          weightedMeshCount: 5,
          deformedMeshCount: 4,
          score: 0,
        },
        clippingMetrics: {
          activeMaskCount: 3,
          totalVertices: 18,
          complexMasks: 2,
          score: 0,
        },
        blendModeMetrics: {
          activeNonNormalCount: 5,
          activeAdditiveCount: 3,
          activeMultiplyCount: 1,
          nonNormalBlendModeCount: 5,
          additiveCount: 3,
          multiplyCount: 1,
          score: 0,
        },
        constraintMetrics: {
          activePhysicsCount: 3,
          activeIkCount: 2,
          activeTransformCount: 2,
          activePathCount: 1,
          totalActiveConstraints: 8,
          ikImpact: 0,
          transformImpact: 0,
          pathImpact: 0,
          physicsImpact: 0,
          score: 0,
        },
        activeComponents: {
          hasPhysics: true,
          hasIK: true,
          hasClipping: true,
          hasBlendModes: true,
        },
      },
      {
        name: 'idle',
        duration: 0.8,
        overallScore: 0,
        meshMetrics: {
          activeMeshCount: 1,
          totalVertices: 80,
          weightedMeshCount: 0,
          deformedMeshCount: 0,
          score: 0,
        },
        clippingMetrics: {
          activeMaskCount: 0,
          totalVertices: 0,
          complexMasks: 0,
          score: 0,
        },
        blendModeMetrics: {
          activeNonNormalCount: 0,
          activeAdditiveCount: 0,
          activeMultiplyCount: 0,
          nonNormalBlendModeCount: 0,
          additiveCount: 0,
          multiplyCount: 0,
          score: 0,
        },
        constraintMetrics: {
          activePhysicsCount: 0,
          activeIkCount: 0,
          activeTransformCount: 0,
          activePathCount: 0,
          totalActiveConstraints: 0,
          ikImpact: 0,
          transformImpact: 0,
          pathImpact: 0,
          physicsImpact: 0,
          score: 0,
        },
        activeComponents: {
          hasPhysics: false,
          hasIK: false,
          hasClipping: false,
          hasBlendModes: false,
        },
      },
    ],
    globalMesh: {},
    globalClipping: {},
    globalBlendMode: {},
    globalPhysics: {},
    medianScore: 0,
    bestAnimation: null,
    worstAnimation: null,
    stats: {
      animationsWithPhysics: 1,
      animationsWithClipping: 1,
      animationsWithBlendModes: 1,
      animationsWithIK: 1,
      animationsWithTransform: 1,
      animationsWithPath: 1,
      highVertexAnimations: 1,
      poorPerformingAnimations: 1,
    },
    ...overrides,
  };
}

describe('impactReportModel', () => {
  it('builds typed impact report with sorted animations and advisor items', () => {
    const supplemental: ImpactSupplementalMetrics = {
      drawCalls: 11,
      pageBreaks: 9,
      uniquePages: 5,
      perAnimation: {
        walk: { drawCalls: 10, pageBreaks: 8 },
        idle: { drawCalls: 2, pageBreaks: 1 },
      },
    };

    const report = buildImpactReportModel(createAnalysis(), { supplemental });

    expect(report.schemaVersion).toBe(1);
    expect(report.animations[0].name).toBe('walk');
    expect(report.animations[0].computational.cost).toBeLessThan(10);
    expect(report.hotspots.peakPageBreaks).toBe(9);
    expect(report.summary.rendering.worst.cost).toBeGreaterThan(0);

    const advisorCategories = report.advisor.map((item) => item.category);
    expect(advisorCategories).toContain('pageBreaks');
    expect(advisorCategories).toContain('blendSwitches');
    expect(advisorCategories).toContain('meshDensity');
    expect(advisorCategories).toContain('constraints');
  });

  it('returns stable-profile advisor for low-impact data', () => {
    const low = createAnalysis({
      animations: [
        {
          name: 'idle',
          duration: 1,
          overallScore: 0,
          meshMetrics: { activeMeshCount: 1, totalVertices: 70, weightedMeshCount: 0, deformedMeshCount: 0, score: 0 },
          clippingMetrics: { activeMaskCount: 0, totalVertices: 0, complexMasks: 0, score: 0 },
          blendModeMetrics: {
            activeNonNormalCount: 0,
            activeAdditiveCount: 0,
            activeMultiplyCount: 0,
            nonNormalBlendModeCount: 0,
            additiveCount: 0,
            multiplyCount: 0,
            score: 0,
          },
          constraintMetrics: {
            activePhysicsCount: 0,
            activeIkCount: 0,
            activeTransformCount: 0,
            activePathCount: 0,
            totalActiveConstraints: 0,
            ikImpact: 0,
            transformImpact: 0,
            pathImpact: 0,
            physicsImpact: 0,
            score: 0,
          },
          activeComponents: {
            hasPhysics: false,
            hasIK: false,
            hasClipping: false,
            hasBlendModes: false,
          },
        },
      ],
      totalAnimations: 1,
      stats: {
        animationsWithPhysics: 0,
        animationsWithClipping: 0,
        animationsWithBlendModes: 0,
        animationsWithIK: 0,
        animationsWithTransform: 0,
        animationsWithPath: 0,
        highVertexAnimations: 0,
        poorPerformingAnimations: 0,
      },
    });

    const report = buildImpactReportModel(low);
    expect(report.advisor).toHaveLength(1);
    expect(report.advisor[0].severity).toBe('info');
    expect(report.advisor[0].id).toBe('stable-profile');
  });

  it('computes impact deltas with better/worse/new/removed directions', () => {
    const baseline = buildImpactReportModel(
      createAnalysis({
        animations: [createAnalysis().animations[0]],
        totalAnimations: 1,
      }),
      {
        supplemental: {
          drawCalls: 12,
          pageBreaks: 10,
          uniquePages: 6,
          perAnimation: {
            walk: { drawCalls: 12, pageBreaks: 10 },
          },
        },
      },
    );

    const current = buildImpactReportModel(
      createAnalysis({
        animations: [
          {
            ...createAnalysis().animations[0],
            meshMetrics: {
              ...createAnalysis().animations[0].meshMetrics,
              totalVertices: 420,
              deformedMeshCount: 2,
            },
            clippingMetrics: {
              ...createAnalysis().animations[0].clippingMetrics,
              activeMaskCount: 1,
            },
            blendModeMetrics: {
              ...createAnalysis().animations[0].blendModeMetrics,
              activeNonNormalCount: 2,
            },
            constraintMetrics: {
              ...createAnalysis().animations[0].constraintMetrics,
              activePhysicsCount: 1,
              activeIkCount: 1,
              totalActiveConstraints: 4,
            },
          },
          createAnalysis().animations[1],
        ],
      }),
      {
        supplemental: {
          drawCalls: 8,
          pageBreaks: 4,
          uniquePages: 4,
          perAnimation: {
            walk: { drawCalls: 8, pageBreaks: 4 },
            idle: { drawCalls: 2, pageBreaks: 1 },
          },
        },
      },
    );

    const delta = buildImpactDeltaModel(current, baseline);
    const rendering = delta.metrics.find((metric) => metric.key === 'rendering');
    const constraints = delta.metrics.find((metric) => metric.key === 'constraints');
    expect(rendering?.direction).toBe('better');
    expect(constraints?.direction).toBe('better');

    const walkDelta = delta.animations.find((item) => item.name === 'walk');
    const idleDelta = delta.animations.find((item) => item.name === 'idle');
    expect(walkDelta?.direction).toBe('better');
    expect(idleDelta?.direction).toBe('new');
  });
});
