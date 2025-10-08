/**
 * Performance Impact Calculator - Unit Tests
 *
 * @fileoverview Comprehensive unit tests for the Spine performance impact calculation system.
 * These tests validate the core calculation logic without requiring full PixiJS/Spine
 * initialization, making them fast, reliable, and easy to run in any environment.
 *
 * @module tests/unit/performance-calculator
 *
 * ## Test Coverage
 *
 * ### Computation Impact (CI) Tests
 * - Basic bone cost calculation with depth penalty
 * - IK constraint impact (highest CPU weight: 1.2)
 * - Mesh complexity (vertices, skinning, deformation)
 * - Bone hierarchy depth penalty validation
 *
 * ### Rendering Impact (RI) Tests
 * - Draw call cost (highest GPU weight: 2.5)
 * - Triangle count impact
 * - Blend mode overhead
 *
 * ### Performance Score Tests
 * - Score range validation [0-100]
 * - Exponential decay formula accuracy: 100 × e^(-k × (impact / S))
 * - Score degradation with increased impact
 * - Expected score ranges for different impact levels
 *
 * ### Cumulative Impact Scenarios
 * - 15 low complexity instances simulation (realistic slot game scenario)
 * - Complexity level comparison (low vs high)
 * - Performance degradation demonstration
 *
 * ## Running Tests
 *
 * ```bash
 * # Run all unit tests
 * npm test -- tests/unit
 *
 * # Run with coverage
 * npm test -- tests/unit --coverage
 *
 * # Run in watch mode
 * npm test -- tests/unit --watch
 * ```
 *
 * ## Expected Results
 *
 * All 14 tests should pass, demonstrating:
 * - Accurate calculation of CI and RI components
 * - Proper cumulative impact across multiple instances
 * - Realistic performance degradation (single instance ~32 score, 15 instances ~0 score)
 * - Different complexity levels produce measurably different impacts
 *
 * @see {@link ../../src/core/utils/performanceCalculator.ts} - Implementation
 * @see {@link ../../docs/PERFORMANCE_IMPACT_ANALYSIS.md} - System documentation
 * @see {@link ../../README_PERFORMANCE_TESTS.md} - Test guide
 */

import { 
  calculateComputationImpact, 
  calculateRenderingImpact, 
  calculatePerformanceScore 
} from '../../src/core/utils/performanceCalculator';
import { PERFORMANCE_WEIGHTS } from '../../src/core/constants/performanceWeights';

/**
 * Frame data structure representing a single frame's performance metrics.
 * This matches the structure used by the actual performance analyzer.
 *
 * @interface FrameData
 */
interface FrameData {
  /** Bone hierarchy information */
  bones: {
    /** Total number of bones in the skeleton */
    count: number;
    /** Depth of each bone in the hierarchy (0 = root) */
    depths: number[]
  };
  
  /** Constraint costs (CPU-intensive operations) */
  constraints: {
    /** Length of each IK chain (e.g., [3, 4] = two chains of length 3 and 4) */
    ikChains: number[];
    /** Number of active transform constraints */
    transformCount: number;
    /** Number of bones affected by each path constraint */
    pathBonesAffected: number[];
    /** Sample steps for each path constraint */
    pathSampleSteps: number[];
    /** Number of active physics constraints */
    physicsCount: number;
  };
  
  /** Animation mixing costs */
  animation: {
    /** Number of active animation tracks minus the base track */
    activeTracksMinusBase: number;
    /** Number of timelines being applied */
    appliedTimelines: number;
  };
  
  /** Mesh rendering costs */
  meshes: {
    /** Total number of vertices across all meshes */
    vertexCount: number;
    /** Number of skinned vertex weights (weighted vertices) */
    skinnedWeights: number;
    /** Number of deform timelines (mesh animations) */
    deformTimelines: number;
  };
  
  /** Clipping mask costs (stencil buffer operations) */
  clipping: {
    /** Triangles in clipped attachments */
    attachmentTris: number;
    /** Triangles in clipping polygons */
    polyTris: number;
    /** Number of clipping state transitions */
    transitions: number;
  };
  
  /** GPU rendering costs */
  rendering: {
    /** Estimated number of draw calls */
    estimatedDrawCalls: number;
    /** Total triangles rendered */
    renderedTriangles: number;
    /** Number of slots using non-normal blend modes */
    nonNormalBlendSlots: number;
  };
}

/**
 * Main test suite for performance calculator functions
 */
describe('Performance Calculator', () => {
  
  /**
   * Tests for Computation Impact (CI) calculation
   *
   * CI represents CPU-side processing costs including:
   * - Bone transformations
   * - Constraint solving (IK, Transform, Path, Physics)
   * - Mesh processing (vertices, skinning, deformation)
   * - Clipping operations
   * - Animation mixing
   * - Bone hierarchy depth penalty
   */
  describe('calculateComputationImpact', () => {
    
    /**
     * Test: Basic bone cost calculation
     *
     * Validates that bone count contributes to CI with proper weighting.
     * Formula: CI includes (wb × bone_count) + depth_penalty
     *
     * Expected: CI >= (wb × bone_count) due to depth penalty
     */
    test('should calculate basic bone cost', () => {
      const frameData: FrameData = {
        bones: { count: 50, depths: Array(50).fill(0).map((_, i) => Math.floor(i / 10)) },
        constraints: { ikChains: [], transformCount: 0, pathBonesAffected: [], pathSampleSteps: [], physicsCount: 0 },
        animation: { activeTracksMinusBase: 0, appliedTimelines: 0 },
        meshes: { vertexCount: 0, skinnedWeights: 0, deformTimelines: 0 },
        clipping: { attachmentTris: 0, polyTris: 0, transitions: 0 },
        rendering: { estimatedDrawCalls: 0, renderedTriangles: 0, nonNormalBlendSlots: 0 }
      };

      const ci = calculateComputationImpact(frameData);
      
      // Should include bone cost (wb * bone_count) plus depth penalty
      expect(ci).toBeGreaterThanOrEqual(PERFORMANCE_WEIGHTS.wb * 50);
      expect(ci).toBeLessThan(PERFORMANCE_WEIGHTS.wb * 50 + 50); // Reasonable upper bound
    });

    test('should account for IK constraints', () => {
      const frameData: FrameData = {
        bones: { count: 30, depths: Array(30).fill(1) },
        constraints: { 
          ikChains: [3, 4, 5], // Three IK chains
          transformCount: 0, 
          pathBonesAffected: [], 
          pathSampleSteps: [], 
          physicsCount: 0 
        },
        animation: { activeTracksMinusBase: 0, appliedTimelines: 0 },
        meshes: { vertexCount: 0, skinnedWeights: 0, deformTimelines: 0 },
        clipping: { attachmentTris: 0, polyTris: 0, transitions: 0 },
        rendering: { estimatedDrawCalls: 0, renderedTriangles: 0, nonNormalBlendSlots: 0 }
      };

      const ci = calculateComputationImpact(frameData);
      
      // Should include IK cost: wIK * (3 + 4 + 5) = 1.2 * 12 = 14.4
      const expectedIKCost = PERFORMANCE_WEIGHTS.wIK * (3 + 4 + 5);
      expect(ci).toBeGreaterThan(expectedIKCost);
    });

    test('should account for mesh complexity', () => {
      const frameData: FrameData = {
        bones: { count: 20, depths: Array(20).fill(1) },
        constraints: { ikChains: [], transformCount: 0, pathBonesAffected: [], pathSampleSteps: [], physicsCount: 0 },
        animation: { activeTracksMinusBase: 0, appliedTimelines: 0 },
        meshes: { 
          vertexCount: 1000, 
          skinnedWeights: 500, 
          deformTimelines: 2 
        },
        clipping: { attachmentTris: 0, polyTris: 0, transitions: 0 },
        rendering: { estimatedDrawCalls: 0, renderedTriangles: 0, nonNormalBlendSlots: 0 }
      };

      const ci = calculateComputationImpact(frameData);
      
      // Should include mesh costs
      const expectedMeshCost = 
        PERFORMANCE_WEIGHTS.wmesh * 1000 +
        PERFORMANCE_WEIGHTS.wskin * 500 +
        PERFORMANCE_WEIGHTS.wdef * 2;
      
      expect(ci).toBeGreaterThan(expectedMeshCost);
    });

    test('should penalize deep bone hierarchies', () => {
      const shallowData: FrameData = {
        bones: { count: 30, depths: Array(30).fill(1) }, // All depth 1
        constraints: { ikChains: [], transformCount: 0, pathBonesAffected: [], pathSampleSteps: [], physicsCount: 0 },
        animation: { activeTracksMinusBase: 0, appliedTimelines: 0 },
        meshes: { vertexCount: 0, skinnedWeights: 0, deformTimelines: 0 },
        clipping: { attachmentTris: 0, polyTris: 0, transitions: 0 },
        rendering: { estimatedDrawCalls: 0, renderedTriangles: 0, nonNormalBlendSlots: 0 }
      };

      const deepData: FrameData = {
        ...shallowData,
        bones: { count: 30, depths: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29] }
      };

      const shallowCI = calculateComputationImpact(shallowData);
      const deepCI = calculateComputationImpact(deepData);

      // Deep hierarchy should have higher CI due to depth penalty
      expect(deepCI).toBeGreaterThan(shallowCI);
    });
  });

  describe('calculateRenderingImpact', () => {
    test('should calculate draw call cost', () => {
      const frameData: FrameData = {
        bones: { count: 0, depths: [] },
        constraints: { ikChains: [], transformCount: 0, pathBonesAffected: [], pathSampleSteps: [], physicsCount: 0 },
        animation: { activeTracksMinusBase: 0, appliedTimelines: 0 },
        meshes: { vertexCount: 0, skinnedWeights: 0, deformTimelines: 0 },
        clipping: { attachmentTris: 0, polyTris: 0, transitions: 0 },
        rendering: { 
          estimatedDrawCalls: 10, 
          renderedTriangles: 0, 
          nonNormalBlendSlots: 0 
        }
      };

      const ri = calculateRenderingImpact(frameData);
      
      // Should be exactly wdc * draw_calls
      const expectedRI = PERFORMANCE_WEIGHTS.wdc * 10;
      expect(ri).toBe(expectedRI);
    });

    test('should account for triangle count', () => {
      const frameData: FrameData = {
        bones: { count: 0, depths: [] },
        constraints: { ikChains: [], transformCount: 0, pathBonesAffected: [], pathSampleSteps: [], physicsCount: 0 },
        animation: { activeTracksMinusBase: 0, appliedTimelines: 0 },
        meshes: { vertexCount: 0, skinnedWeights: 0, deformTimelines: 0 },
        clipping: { attachmentTris: 0, polyTris: 0, transitions: 0 },
        rendering: { 
          estimatedDrawCalls: 5, 
          renderedTriangles: 2000, 
          nonNormalBlendSlots: 0 
        }
      };

      const ri = calculateRenderingImpact(frameData);
      
      const expectedRI = 
        PERFORMANCE_WEIGHTS.wdc * 5 +
        PERFORMANCE_WEIGHTS.wtri * 2000;
      
      expect(ri).toBe(expectedRI);
    });

    test('should account for blend modes', () => {
      const frameData: FrameData = {
        bones: { count: 0, depths: [] },
        constraints: { ikChains: [], transformCount: 0, pathBonesAffected: [], pathSampleSteps: [], physicsCount: 0 },
        animation: { activeTracksMinusBase: 0, appliedTimelines: 0 },
        meshes: { vertexCount: 0, skinnedWeights: 0, deformTimelines: 0 },
        clipping: { attachmentTris: 0, polyTris: 0, transitions: 0 },
        rendering: { 
          estimatedDrawCalls: 3, 
          renderedTriangles: 500, 
          nonNormalBlendSlots: 8 
        }
      };

      const ri = calculateRenderingImpact(frameData);
      
      const expectedRI = 
        PERFORMANCE_WEIGHTS.wdc * 3 +
        PERFORMANCE_WEIGHTS.wtri * 500 +
        PERFORMANCE_WEIGHTS.wblend * 8;
      
      expect(ri).toBe(expectedRI);
    });
  });

  describe('calculatePerformanceScore', () => {
    test('should return 100 for zero impact', () => {
      const score = calculatePerformanceScore(0);
      expect(score).toBe(100);
    });

    test('should return score in valid range', () => {
      const testImpacts = [10, 50, 100, 200, 500, 1000];
      
      testImpacts.forEach(impact => {
        const score = calculatePerformanceScore(impact);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });
    });

    test('should follow exponential decay formula', () => {
      const impact = 100;
      const score = calculatePerformanceScore(impact);
      
      // Manual calculation: 100 * e^(-1.0 * (100 / 50))
      const normalizedImpact = impact / PERFORMANCE_WEIGHTS.S;
      const expectedScore = 100 * Math.exp(-PERFORMANCE_WEIGHTS.k * normalizedImpact);
      
      expect(score).toBeCloseTo(expectedScore, 2);
    });

    test('should decrease as impact increases', () => {
      const score1 = calculatePerformanceScore(50);
      const score2 = calculatePerformanceScore(100);
      const score3 = calculatePerformanceScore(200);
      
      expect(score1).toBeGreaterThan(score2);
      expect(score2).toBeGreaterThan(score3);
    });

    test('should match expected score ranges', () => {
      // Low impact should give excellent score
      expect(calculatePerformanceScore(10)).toBeGreaterThan(80);
      
      // Medium impact should give moderate score
      const mediumScore = calculatePerformanceScore(50);
      expect(mediumScore).toBeGreaterThan(30);
      expect(mediumScore).toBeLessThan(70);
      
      // High impact should give poor score
      expect(calculatePerformanceScore(200)).toBeLessThan(20);
    });
  });

  describe('Cumulative Impact Scenarios', () => {
    test('should calculate cumulative impact for 15 low complexity instances', () => {
      // Simulate a low complexity symbol (like low_1)
      const singleInstanceData: FrameData = {
        bones: { count: 35, depths: Array(35).fill(0).map((_, i) => Math.floor(i / 8)) },
        constraints: { 
          ikChains: [2, 3], 
          transformCount: 1, 
          pathBonesAffected: [], 
          pathSampleSteps: [], 
          physicsCount: 0 
        },
        animation: { activeTracksMinusBase: 0, appliedTimelines: 5 },
        meshes: { vertexCount: 300, skinnedWeights: 150, deformTimelines: 2 },
        clipping: { attachmentTris: 10, polyTris: 5, transitions: 2 },
        rendering: { estimatedDrawCalls: 3, renderedTriangles: 200, nonNormalBlendSlots: 2 }
      };

      const singleCI = calculateComputationImpact(singleInstanceData);
      const singleRI = calculateRenderingImpact(singleInstanceData);
      const singleTotalImpact = singleCI + singleRI;
      const singleScore = calculatePerformanceScore(singleTotalImpact);

      // Cumulative for 15 instances
      const cumulativeCI = singleCI * 15;
      const cumulativeRI = singleRI * 15;
      const cumulativeTotalImpact = cumulativeCI + cumulativeRI;
      const cumulativeScore = calculatePerformanceScore(cumulativeTotalImpact);

      console.log('\n' + '='.repeat(80));
      console.log('CUMULATIVE IMPACT TEST: 15 Low Complexity Instances');
      console.log('='.repeat(80));
      console.log(`Single Instance - CI: ${singleCI.toFixed(2)}, RI: ${singleRI.toFixed(2)}, Total: ${singleTotalImpact.toFixed(2)}, Score: ${singleScore.toFixed(2)}`);
      console.log(`15 Instances    - CI: ${cumulativeCI.toFixed(2)}, RI: ${cumulativeRI.toFixed(2)}, Total: ${cumulativeTotalImpact.toFixed(2)}, Score: ${cumulativeScore.toFixed(2)}`);
      console.log('='.repeat(80) + '\n');

      // Single instance should have good score
      expect(singleScore).toBeGreaterThan(30);
      
      // 15 instances should show performance degradation
      expect(cumulativeScore).toBeLessThan(singleScore);
      expect(cumulativeScore).toBeLessThan(60);
      
      // Total impact should be 15x single impact
      expect(cumulativeTotalImpact).toBeCloseTo(singleTotalImpact * 15, 1);
    });

    test('should show different impacts for different complexity levels', () => {
      const lowComplexity: FrameData = {
        bones: { count: 30, depths: Array(30).fill(1) },
        constraints: { ikChains: [2], transformCount: 0, pathBonesAffected: [], pathSampleSteps: [], physicsCount: 0 },
        animation: { activeTracksMinusBase: 0, appliedTimelines: 3 },
        meshes: { vertexCount: 200, skinnedWeights: 100, deformTimelines: 1 },
        clipping: { attachmentTris: 5, polyTris: 3, transitions: 1 },
        rendering: { estimatedDrawCalls: 2, renderedTriangles: 150, nonNormalBlendSlots: 1 }
      };

      const highComplexity: FrameData = {
        bones: { count: 80, depths: Array(80).fill(0).map((_, i) => Math.floor(i / 5)) },
        constraints: { ikChains: [3, 4, 5], transformCount: 3, pathBonesAffected: [5, 6], pathSampleSteps: [10, 12], physicsCount: 2 },
        animation: { activeTracksMinusBase: 1, appliedTimelines: 8 },
        meshes: { vertexCount: 800, skinnedWeights: 600, deformTimelines: 4 },
        clipping: { attachmentTris: 20, polyTris: 10, transitions: 4 },
        rendering: { estimatedDrawCalls: 8, renderedTriangles: 600, nonNormalBlendSlots: 5 }
      };

      const lowCI = calculateComputationImpact(lowComplexity);
      const lowRI = calculateRenderingImpact(lowComplexity);
      const lowTotal = lowCI + lowRI;
      const lowScore = calculatePerformanceScore(lowTotal);

      const highCI = calculateComputationImpact(highComplexity);
      const highRI = calculateRenderingImpact(highComplexity);
      const highTotal = highCI + highRI;
      const highScore = calculatePerformanceScore(highTotal);

      console.log('\n' + '='.repeat(80));
      console.log('COMPLEXITY COMPARISON');
      console.log('='.repeat(80));
      console.log(`Low  Complexity - CI: ${lowCI.toFixed(2)}, RI: ${lowRI.toFixed(2)}, Total: ${lowTotal.toFixed(2)}, Score: ${lowScore.toFixed(2)}`);
      console.log(`High Complexity - CI: ${highCI.toFixed(2)}, RI: ${highRI.toFixed(2)}, Total: ${highTotal.toFixed(2)}, Score: ${highScore.toFixed(2)}`);
      console.log('='.repeat(80) + '\n');

      // High complexity should have higher impact and lower score
      expect(highCI).toBeGreaterThan(lowCI);
      expect(highRI).toBeGreaterThan(lowRI);
      expect(highTotal).toBeGreaterThan(lowTotal);
      expect(highScore).toBeLessThan(lowScore);
    });
  });
});