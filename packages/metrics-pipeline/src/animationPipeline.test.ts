import { beforeEach, describe, expect, it, vi } from 'vitest';
const {
  mockAnalyzeMeshesForAnimation,
  mockAnalyzeGlobalMeshes,
  mockAnalyzeClippingForAnimation,
  mockAnalyzeGlobalClipping,
  mockAnalyzeBlendModesForAnimation,
  mockAnalyzeGlobalBlendModes,
  mockAnalyzeSkeletonStructure,
  mockAnalyzePhysicsForAnimation,
  mockAnalyzeGlobalPhysics,
  mockCalculateOverallScore,
  mockGetActiveComponentsForAnimation
} = vi.hoisted(() => ({
  mockAnalyzeMeshesForAnimation: vi.fn(),
  mockAnalyzeGlobalMeshes: vi.fn(),
  mockAnalyzeClippingForAnimation: vi.fn(),
  mockAnalyzeGlobalClipping: vi.fn(),
  mockAnalyzeBlendModesForAnimation: vi.fn(),
  mockAnalyzeGlobalBlendModes: vi.fn(),
  mockAnalyzeSkeletonStructure: vi.fn(),
  mockAnalyzePhysicsForAnimation: vi.fn(),
  mockAnalyzeGlobalPhysics: vi.fn(),
  mockCalculateOverallScore: vi.fn(),
  mockGetActiveComponentsForAnimation: vi.fn()
}));

vi.mock('@spine-benchmark/metrics-analyzers', () => ({
  analyzeMeshesForAnimation: mockAnalyzeMeshesForAnimation,
  analyzeGlobalMeshes: mockAnalyzeGlobalMeshes,
  analyzeClippingForAnimation: mockAnalyzeClippingForAnimation,
  analyzeGlobalClipping: mockAnalyzeGlobalClipping,
  analyzeBlendModesForAnimation: mockAnalyzeBlendModesForAnimation,
  analyzeGlobalBlendModes: mockAnalyzeGlobalBlendModes,
  analyzeSkeletonStructure: mockAnalyzeSkeletonStructure,
  analyzePhysicsForAnimation: mockAnalyzePhysicsForAnimation,
  analyzeGlobalPhysics: mockAnalyzeGlobalPhysics
}));

vi.mock('@spine-benchmark/metrics-scoring', () => ({
  calculateOverallScore: mockCalculateOverallScore
}));

vi.mock('@spine-benchmark/metrics-sampling', () => ({
  getActiveComponentsForAnimation: mockGetActiveComponentsForAnimation
}));

import {
  aggregateResults,
  analyzeAnimations,
  analyzeGlobalData,
  analyzeSingleAnimation,
  analyzeSkeleton,
  calculateStatistics,
  sortAnalyses
} from './animationPipeline';
import * as pipelineIndex from './index';

const createAnimationAnalysis = (overrides: Record<string, unknown> = {}) => ({
  name: 'anim',
  duration: 1,
  overallScore: 80,
  meshMetrics: {
    score: 80,
    totalVertices: 100,
    deformedMeshCount: 0,
    weightedMeshCount: 0
  },
  clippingMetrics: {
    score: 80,
    activeMaskCount: 0
  },
  blendModeMetrics: {
    score: 80,
    activeNonNormalCount: 0
  },
  constraintMetrics: {
    score: 80,
    activePhysicsCount: 0,
    activeIkCount: 0,
    activeTransformCount: 0,
    activePathCount: 0
  },
  activeComponents: {
    hasPhysics: false,
    hasClipping: false,
    hasBlendModes: false,
    hasIK: false,
    hasTransform: false,
    hasPath: false
  },
  ...overrides
});

describe('metrics-pipeline', () => {
  it('re-exports pipeline helpers from package entry', () => {
    expect(typeof pipelineIndex.analyzeAnimations).toBe('function');
    expect(typeof pipelineIndex.aggregateResults).toBe('function');
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetActiveComponentsForAnimation.mockReturnValue({
      hasPhysics: true,
      hasClipping: true,
      hasBlendModes: true,
      hasIK: true,
      hasTransform: false,
      hasPath: false
    });
    mockAnalyzeMeshesForAnimation.mockReturnValue({
      score: 70,
      totalVertices: 700,
      deformedMeshCount: 1,
      weightedMeshCount: 1
    });
    mockAnalyzeClippingForAnimation.mockReturnValue({
      score: 80,
      activeMaskCount: 2
    });
    mockAnalyzeBlendModesForAnimation.mockReturnValue({
      score: 85,
      activeNonNormalCount: 1
    });
    mockAnalyzePhysicsForAnimation.mockReturnValue({
      score: 90,
      activePhysicsCount: 1,
      activeIkCount: 1,
      activeTransformCount: 0,
      activePathCount: 0
    });
    mockAnalyzeSkeletonStructure.mockReturnValue({
      metrics: { score: 95 }
    });
    mockAnalyzeGlobalMeshes.mockReturnValue({ maxVertices: 999 });
    mockAnalyzeGlobalClipping.mockReturnValue({ maxMasks: 5 });
    mockAnalyzeGlobalBlendModes.mockReturnValue({ maxBlendModes: 4 });
    mockAnalyzeGlobalPhysics.mockReturnValue({ maxPhysics: 3 });
    mockCalculateOverallScore.mockReturnValue(88);
  });

  it('analyzes a single animation with delegated analyzers and scoring', () => {
    const animation = { name: 'walk', duration: 1.25 };
    const spine = {
      skeleton: {
        data: {
          animations: [animation],
          skins: [{ name: 'default' }]
        }
      }
    };

    const result = analyzeSingleAnimation(spine as any, animation as any);

    expect(mockGetActiveComponentsForAnimation).toHaveBeenCalledWith(spine, animation);
    expect(mockAnalyzeMeshesForAnimation).toHaveBeenCalledWith(
      spine,
      animation,
      mockGetActiveComponentsForAnimation.mock.results[0]?.value
    );
    expect(mockAnalyzeClippingForAnimation).toHaveBeenCalledWith(
      spine,
      animation,
      mockGetActiveComponentsForAnimation.mock.results[0]?.value
    );
    expect(mockAnalyzeBlendModesForAnimation).toHaveBeenCalledWith(
      spine,
      animation,
      mockGetActiveComponentsForAnimation.mock.results[0]?.value
    );
    expect(mockAnalyzePhysicsForAnimation).toHaveBeenCalledWith(
      spine,
      animation,
      mockGetActiveComponentsForAnimation.mock.results[0]?.value
    );
    expect(mockCalculateOverallScore).toHaveBeenCalledWith({
      boneScore: 95,
      meshScore: 70,
      clippingScore: 80,
      blendModeScore: 85,
      constraintScore: 90
    });
    expect(result).toMatchObject({
      name: 'walk',
      duration: 1.25,
      overallScore: 88
    });
  });

  it('analyzes all animations from skeleton data', () => {
    const animations = [
      { name: 'idle', duration: 1 },
      { name: 'run', duration: 2 }
    ];
    const spine = {
      skeleton: {
        data: {
          animations,
          skins: [{ name: 'default' }]
        }
      }
    };

    const analyses = analyzeAnimations(spine as any);

    expect(analyses).toHaveLength(2);
    expect(analyses.map((a) => a.name)).toEqual(['idle', 'run']);
    expect(mockAnalyzeMeshesForAnimation).toHaveBeenCalledTimes(2);
  });

  it('delegates skeleton and global analysis', () => {
    const spine = {
      skeleton: {
        data: {
          animations: [],
          skins: []
        }
      }
    };

    const skeleton = analyzeSkeleton(spine as any);
    const global = analyzeGlobalData(spine as any);

    expect(mockAnalyzeSkeletonStructure).toHaveBeenCalledWith(spine);
    expect(skeleton).toEqual({ metrics: { score: 95 } });
    expect(global).toEqual({
      globalMesh: { maxVertices: 999 },
      globalClipping: { maxMasks: 5 },
      globalBlendMode: { maxBlendModes: 4 },
      globalPhysics: { maxPhysics: 3 }
    });
  });

  it('calculates aggregate animation statistics', () => {
    const stats = calculateStatistics([
      createAnimationAnalysis({
        overallScore: 50,
        meshMetrics: { score: 70, totalVertices: 800, deformedMeshCount: 1, weightedMeshCount: 0 },
        activeComponents: {
          hasPhysics: true,
          hasClipping: true,
          hasBlendModes: true,
          hasIK: true,
          hasTransform: true,
          hasPath: true
        }
      }) as any,
      createAnimationAnalysis({
        overallScore: 90,
        meshMetrics: { score: 90, totalVertices: 120, deformedMeshCount: 0, weightedMeshCount: 0 }
      }) as any
    ]);

    expect(stats).toEqual({
      animationsWithPhysics: 1,
      animationsWithClipping: 1,
      animationsWithBlendModes: 1,
      animationsWithIK: 1,
      animationsWithTransform: 1,
      animationsWithPath: 1,
      highVertexAnimations: 1,
      poorPerformingAnimations: 1
    });
  });

  it('sorts analyses and computes median for non-empty and empty sets', () => {
    const sortedData = sortAnalyses([
      createAnimationAnalysis({ name: 'a', overallScore: 90 }) as any,
      createAnimationAnalysis({ name: 'b', overallScore: 50 }) as any,
      createAnimationAnalysis({ name: 'c', overallScore: 70 }) as any
    ]);
    const emptySorted = sortAnalyses([]);

    expect(sortedData.sorted.map((a) => a.name)).toEqual(['a', 'c', 'b']);
    expect(sortedData.best?.name).toBe('a');
    expect(sortedData.worst?.name).toBe('b');
    expect(sortedData.medianScore).toBe(70);

    expect(emptySorted.sorted).toEqual([]);
    expect(emptySorted.best).toBeNull();
    expect(emptySorted.worst).toBeNull();
    expect(emptySorted.medianScore).toBe(100);
  });

  it('aggregates final result and falls back to Unnamed skeleton', () => {
    const spine = {
      skeleton: {
        data: {
          name: '',
          animations: [{ name: 'idle', duration: 1 }],
          skins: [{ name: 'default' }, { name: 'alt' }]
        }
      }
    };
    const animationData = [createAnimationAnalysis({ name: 'idle', overallScore: 77 }) as any];

    const result = aggregateResults(
      spine as any,
      { metrics: { score: 99 } } as any,
      {
        globalMesh: { maxVertices: 999 } as any,
        globalClipping: { maxMasks: 4 } as any,
        globalBlendMode: { maxBlendModes: 3 } as any,
        globalPhysics: { maxPhysics: 2 } as any
      },
      animationData,
      {
        animationsWithPhysics: 0,
        animationsWithClipping: 0,
        animationsWithBlendModes: 0,
        animationsWithIK: 0,
        animationsWithTransform: 0,
        animationsWithPath: 0,
        highVertexAnimations: 0,
        poorPerformingAnimations: 0
      },
      {
        sorted: animationData,
        best: animationData[0],
        worst: animationData[0],
        medianScore: 77
      }
    );

    expect(result).toMatchObject({
      skeletonName: 'Unnamed',
      totalAnimations: 1,
      totalSkins: 2,
      medianScore: 77
    });
    expect(result.bestAnimation?.name).toBe('idle');
    expect(result.worstAnimation?.name).toBe('idle');
  });

  it('keeps explicit skeleton name when provided', () => {
    const spine = {
      skeleton: {
        data: {
          name: 'HeroSkeleton',
          animations: [],
          skins: []
        }
      }
    };

    const result = aggregateResults(
      spine as any,
      { metrics: { score: 90 } } as any,
      {
        globalMesh: {} as any,
        globalClipping: {} as any,
        globalBlendMode: {} as any,
        globalPhysics: {} as any
      },
      [],
      {
        animationsWithPhysics: 0,
        animationsWithClipping: 0,
        animationsWithBlendModes: 0,
        animationsWithIK: 0,
        animationsWithTransform: 0,
        animationsWithPath: 0,
        highVertexAnimations: 0,
        poorPerformingAnimations: 0
      },
      {
        sorted: [],
        best: null,
        worst: null,
        medianScore: 100
      }
    );

    expect(result.skeletonName).toBe('HeroSkeleton');
  });
});
