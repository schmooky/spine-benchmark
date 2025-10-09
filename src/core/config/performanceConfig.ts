/**
 * Centralized Performance Impact Configuration
 * 
 * This file contains ALL configurable parameters for the performance impact system.
 * Modify values here to adjust how performance is calculated and displayed throughout the application.
 * 
 * @fileoverview Single source of truth for performance impact calculations
 */

/**
 * Performance Impact Weights Configuration
 * 
 * These weights determine how much each factor contributes to the final impact score.
 * Higher weights = greater impact on performance.
 */
export const PERFORMANCE_CONFIG = {
  
  // ============================================================================
  // COMPUTATION IMPACT (CI) WEIGHTS - CPU-side costs
  // ============================================================================
  
  /**
   * Bone weight - Base cost per bone in the skeleton
   * Default: 0.5 (reduced for better score distribution)
   * Range: 0.3 - 2.0
   * Impact: Linear with bone count
   */
  boneWeight: 0.5,
  
  /**
   * IK Constraint weight - Cost per bone in IK chain
   * Default: 0.8 (reduced from 1.2)
   * Range: 0.5 - 2.0
   * Impact: Highest CPU weight due to iterative solving
   * Note: IK constraints are the most CPU-intensive operation
   */
  ikConstraintWeight: 0.8,
  
  /**
   * Transform Constraint weight - Cost per active transform constraint
   * Default: 0.2 (reduced from 0.4)
   * Range: 0.1 - 1.0
   * Impact: Moderate CPU cost for matrix transformations
   */
  transformConstraintWeight: 0.2,
  
  /**
   * Path Constraint weight - Cost per bone affected by path
   * Default: 0.5 (reduced from 0.8)
   * Range: 0.3 - 1.5
   * Impact: Multiplied by sample steps for path following
   */
  pathConstraintWeight: 0.5,
  
  /**
   * Physics Constraint weight - Cost per active physics constraint
   * Default: 0.6 (reduced from 1.0)
   * Range: 0.3 - 2.0
   * Impact: High CPU cost for soft-body simulation
   */
  physicsConstraintWeight: 0.6,
  
  /**
   * Mesh Vertex weight - Cost per vertex in all meshes
   * Default: 0.03 (increased to punish high vertex counts)
   * Range: 0.01 - 0.08
   * Impact: Scales with total vertex count
   * Note: High vertex counts significantly impact performance
   */
  meshVertexWeight: 0.03,
  
  /**
   * Skinned Mesh weight - Cost per skinned vertex weight
   * Default: 0.02 (increased to punish skinning)
   * Range: 0.01 - 0.05
   * Impact: Weighted vertices require matrix multiplications
   * Note: Skinning is expensive, especially with many weights
   */
  skinnedMeshWeight: 0.02,
  
  /**
   * Deform Timeline weight - Cost per mesh deformation timeline
   * Default: 0.5 (increased to punish mesh animations)
   * Range: 0.2 - 1.0
   * Impact: Mesh animations require vertex updates every frame
   * Note: Deforming meshes are very expensive
   */
  deformTimelineWeight: 0.5,
  
  /**
   * Clipping weight - Multiplicative cost for clipping operations
   * Default: 0.002 (reduced from 0.004)
   * Range: 0.001 - 0.01
   * Impact: attachment_tris × poly_tris (multiplicative!)
   */
  clippingWeight: 0.002,
  
  /**
   * Animation Mixing weight - Cost for blending multiple animations
   * Default: 0.15 (reduced from 0.25)
   * Range: 0.1 - 0.5
   * Impact: active_tracks × applied_timelines
   */
  animationMixingWeight: 0.15,
  
  // ============================================================================
  // BONE HIERARCHY DEPTH PENALTY WEIGHTS
  // ============================================================================
  
  /**
   * Linear depth penalty weight
   * Default: 0.5
   * Range: 0.2 - 1.0
   * Impact: Linear penalty for excess depth
   */
  depthPenaltyLinear: 0.5,
  
  /**
   * Polynomial depth penalty weight
   * Default: 0.35
   * Range: 0.1 - 0.7
   * Impact: Polynomial penalty for excess depth
   */
  depthPenaltyPolynomial: 0.35,
  
  /**
   * Depth penalty exponent (gamma)
   * Default: 2.0
   * Range: 1.5 - 3.0
   * Impact: Exponent for polynomial depth penalty
   */
  depthPenaltyExponent: 2.0,
  
  /**
   * Depth mean penalty weight
   * Default: 0.25
   * Range: 0.1 - 0.5
   * Impact: Penalty for unbalanced depth distribution
   */
  depthPenaltyMean: 0.25,
  
  /**
   * Depth power for weighted mean calculation
   * Default: 2.0
   * Range: 1.5 - 3.0
   * Impact: Power for weighted depth mean calculation
   */
  depthPower: 2.0,
  
  // ============================================================================
  // RENDERING IMPACT (RI) WEIGHTS - GPU-side costs
  // ============================================================================
  
  /**
   * Draw Call weight - Cost per draw call
   * Default: 1.5 (reduced from 2.5)
   * Range: 1.0 - 5.0
   * Impact: HIGHEST GPU weight - draw calls are very expensive
   * Note: Each draw call requires GPU state changes
   */
  drawCallWeight: 1.5,
  
  /**
   * Triangle weight - Cost per rendered triangle
   * Default: 0.001 (reduced from 0.002)
   * Range: 0.0005 - 0.005
   * Impact: Scales with total triangle count
   */
  triangleWeight: 0.001,
  
  /**
   * Blend Mode weight - Cost per non-normal blend mode
   * Default: 0.4 (reduced from 0.6)
   * Range: 0.2 - 1.2
   * Impact: Non-normal blends require additional GPU passes
   */
  blendModeWeight: 0.4,
  
  // ============================================================================
  // PERFORMANCE SCORE CALCULATION PARAMETERS
  // ============================================================================
  
  /**
   * Normalization scalar (S) - Scales total impact for score calculation
   * Default: 200 (adjusted for realistic score distribution)
   * Range: 30 - 300
   * Impact: Higher values make scores more lenient
   * Formula: Score = 100 × e^(-k × (TotalImpact / S))
   *
   * Examples with S=200:
   * - Impact 11: Score 94.6 (Excellent) ← Your best symbol
   * - Impact 50: Score 77.9 (Good)
   * - Impact 100: Score 60.7 (Moderate)
   * - Impact 200: Score 36.8 (Poor)
   * - Impact 400: Score 13.5 (Very Poor)
   */
  normalizationScalar: 200,
  
  /**
   * Exponential decay factor (k) - Controls score degradation rate
   * Default: 1.0
   * Range: 0.5 - 2.0
   * Impact: Higher values make scores degrade faster
   * Formula: Score = 100 × e^(-k × (TotalImpact / S))
   */
  decayFactor: 1.0,
  
  // ============================================================================
  // UI DISPLAY THRESHOLDS
  // ============================================================================
  
  /**
   * Computation Impact (CI) thresholds for color coding
   */
  ciThresholds: {
    /** Green threshold - CI below this is considered low impact */
    low: 30,
    /** Yellow threshold - CI below this is considered moderate impact */
    moderate: 100
    // Above moderate is considered high impact (red)
  },
  
  /**
   * Rendering Impact (RI) thresholds for color coding
   */
  riThresholds: {
    /** Light green threshold - RI below this is considered low impact */
    low: 20,
    /** Light yellow threshold - RI below this is considered moderate impact */
    moderate: 50
    // Above moderate is considered high impact (light red)
  },
  
  /**
   * Total Impact thresholds for overall rating
   */
  totalImpactThresholds: {
    /** Total impact below this is considered low (excellent performance) */
    low: 50,
    /** Total impact below this is considered moderate (acceptable performance) */
    moderate: 150
    // Above moderate is considered high (poor performance)
  },
  
  // ============================================================================
  // PRESET CONFIGURATIONS
  // ============================================================================
  
  /**
   * Preset configurations for different use cases
   * Apply these by calling: applyPreset('mobile') or applyPreset('desktop')
   */
  presets: {
    /**
     * Mobile preset - Stricter thresholds for mobile devices
     */
    mobile: {
      drawCallWeight: 3.5,        // Draw calls are more expensive on mobile
      ikConstraintWeight: 1.5,    // IK is more expensive on mobile CPUs
      normalizationScalar: 40,    // Stricter scoring
      ciThresholds: { low: 20, moderate: 60 },
      riThresholds: { low: 15, moderate: 35 },
      totalImpactThresholds: { low: 35, moderate: 100 }
    },
    
    /**
     * Desktop preset - More lenient thresholds for desktop devices
     */
    desktop: {
      drawCallWeight: 2.0,        // Draw calls less expensive on desktop
      ikConstraintWeight: 1.0,    // IK less expensive on desktop CPUs
      normalizationScalar: 60,    // More lenient scoring
      ciThresholds: { low: 40, moderate: 120 },
      riThresholds: { low: 25, moderate: 60 },
      totalImpactThresholds: { low: 65, moderate: 180 }
    },
    
    /**
     * Strict preset - Very strict thresholds for optimization
     */
    strict: {
      drawCallWeight: 4.0,
      ikConstraintWeight: 2.0,
      physicsConstraintWeight: 1.5,
      normalizationScalar: 30,
      ciThresholds: { low: 15, moderate: 40 },
      riThresholds: { low: 10, moderate: 25 },
      totalImpactThresholds: { low: 25, moderate: 75 }
    },
    
    /**
     * Lenient preset - Relaxed thresholds for complex animations
     */
    lenient: {
      drawCallWeight: 1.5,
      ikConstraintWeight: 0.8,
      normalizationScalar: 80,
      ciThresholds: { low: 50, moderate: 150 },
      riThresholds: { low: 30, moderate: 70 },
      totalImpactThresholds: { low: 80, moderate: 220 }
    }
  }
};

/**
 * Apply a preset configuration
 * 
 * @param presetName - Name of the preset to apply ('mobile', 'desktop', 'strict', 'lenient')
 * @returns The updated configuration
 * 
 * @example
 * ```typescript
 * // Apply mobile preset for stricter thresholds
 * applyPreset('mobile');
 * 
 * // Apply desktop preset for more lenient thresholds
 * applyPreset('desktop');
 * ```
 */
export function applyPreset(presetName: keyof typeof PERFORMANCE_CONFIG.presets): typeof PERFORMANCE_CONFIG {
  const preset = PERFORMANCE_CONFIG.presets[presetName];
  
  // Apply preset values to main config
  Object.assign(PERFORMANCE_CONFIG, preset);
  
  return PERFORMANCE_CONFIG;
}

/**
 * Reset configuration to defaults
 * 
 * @returns The default configuration
 */
export function resetToDefaults(): typeof PERFORMANCE_CONFIG {
  PERFORMANCE_CONFIG.boneWeight = 1.0;
  PERFORMANCE_CONFIG.ikConstraintWeight = 1.2;
  PERFORMANCE_CONFIG.transformConstraintWeight = 0.4;
  PERFORMANCE_CONFIG.pathConstraintWeight = 0.8;
  PERFORMANCE_CONFIG.physicsConstraintWeight = 1.0;
  PERFORMANCE_CONFIG.meshVertexWeight = 0.015;
  PERFORMANCE_CONFIG.skinnedMeshWeight = 0.01;
  PERFORMANCE_CONFIG.deformTimelineWeight = 0.2;
  PERFORMANCE_CONFIG.clippingWeight = 0.004;
  PERFORMANCE_CONFIG.animationMixingWeight = 0.25;
  PERFORMANCE_CONFIG.depthPenaltyLinear = 0.5;
  PERFORMANCE_CONFIG.depthPenaltyPolynomial = 0.35;
  PERFORMANCE_CONFIG.depthPenaltyExponent = 2.0;
  PERFORMANCE_CONFIG.depthPenaltyMean = 0.25;
  PERFORMANCE_CONFIG.depthPower = 2.0;
  PERFORMANCE_CONFIG.drawCallWeight = 2.5;
  PERFORMANCE_CONFIG.triangleWeight = 0.002;
  PERFORMANCE_CONFIG.blendModeWeight = 0.6;
  PERFORMANCE_CONFIG.normalizationScalar = 50;
  PERFORMANCE_CONFIG.decayFactor = 1.0;
  PERFORMANCE_CONFIG.ciThresholds = { low: 30, moderate: 100 };
  PERFORMANCE_CONFIG.riThresholds = { low: 20, moderate: 50 };
  PERFORMANCE_CONFIG.totalImpactThresholds = { low: 50, moderate: 150 };
  
  return PERFORMANCE_CONFIG;
}

/**
 * Get current configuration as a plain object
 * Useful for debugging or exporting configuration
 */
export function getCurrentConfig() {
  return {
    weights: {
      computation: {
        bone: PERFORMANCE_CONFIG.boneWeight,
        ikConstraint: PERFORMANCE_CONFIG.ikConstraintWeight,
        transformConstraint: PERFORMANCE_CONFIG.transformConstraintWeight,
        pathConstraint: PERFORMANCE_CONFIG.pathConstraintWeight,
        physicsConstraint: PERFORMANCE_CONFIG.physicsConstraintWeight,
        meshVertex: PERFORMANCE_CONFIG.meshVertexWeight,
        skinnedMesh: PERFORMANCE_CONFIG.skinnedMeshWeight,
        deformTimeline: PERFORMANCE_CONFIG.deformTimelineWeight,
        clipping: PERFORMANCE_CONFIG.clippingWeight,
        animationMixing: PERFORMANCE_CONFIG.animationMixingWeight
      },
      depthPenalty: {
        linear: PERFORMANCE_CONFIG.depthPenaltyLinear,
        polynomial: PERFORMANCE_CONFIG.depthPenaltyPolynomial,
        exponent: PERFORMANCE_CONFIG.depthPenaltyExponent,
        mean: PERFORMANCE_CONFIG.depthPenaltyMean,
        power: PERFORMANCE_CONFIG.depthPower
      },
      rendering: {
        drawCall: PERFORMANCE_CONFIG.drawCallWeight,
        triangle: PERFORMANCE_CONFIG.triangleWeight,
        blendMode: PERFORMANCE_CONFIG.blendModeWeight
      }
    },
    scoreParameters: {
      normalizationScalar: PERFORMANCE_CONFIG.normalizationScalar,
      decayFactor: PERFORMANCE_CONFIG.decayFactor
    },
    uiThresholds: {
      ci: PERFORMANCE_CONFIG.ciThresholds,
      ri: PERFORMANCE_CONFIG.riThresholds,
      total: PERFORMANCE_CONFIG.totalImpactThresholds
    }
  };
}

/**
 * Export configuration for use in performanceWeights.ts
 * This maintains backward compatibility with existing code
 */
export function getPerformanceWeights() {
  return {
    // Computation Impact weights
    wb: PERFORMANCE_CONFIG.boneWeight,
    wIK: PERFORMANCE_CONFIG.ikConstraintWeight,
    wTC: PERFORMANCE_CONFIG.transformConstraintWeight,
    wPC: PERFORMANCE_CONFIG.pathConstraintWeight,
    wPH: PERFORMANCE_CONFIG.physicsConstraintWeight,
    wmesh: PERFORMANCE_CONFIG.meshVertexWeight,
    wskin: PERFORMANCE_CONFIG.skinnedMeshWeight,
    wdef: PERFORMANCE_CONFIG.deformTimelineWeight,
    wclip: PERFORMANCE_CONFIG.clippingWeight,
    wmix: PERFORMANCE_CONFIG.animationMixingWeight,
    
    // Depth penalty weights
    w_depth_lin: PERFORMANCE_CONFIG.depthPenaltyLinear,
    w_depth_poly: PERFORMANCE_CONFIG.depthPenaltyPolynomial,
    gamma: PERFORMANCE_CONFIG.depthPenaltyExponent,
    w_depth_mean: PERFORMANCE_CONFIG.depthPenaltyMean,
    depth_power: PERFORMANCE_CONFIG.depthPower,
    
    // Rendering Impact weights
    wdc: PERFORMANCE_CONFIG.drawCallWeight,
    wtri: PERFORMANCE_CONFIG.triangleWeight,
    wblend: PERFORMANCE_CONFIG.blendModeWeight,
    
    // Performance Score parameters
    S: PERFORMANCE_CONFIG.normalizationScalar,
    k: PERFORMANCE_CONFIG.decayFactor
  };
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Example 1: Adjust for mobile devices
 * 
 * ```typescript
 * import { applyPreset } from './core/config/performanceConfig';
 * 
 * // Apply mobile preset
 * applyPreset('mobile');
 * ```
 */

/**
 * Example 2: Custom configuration
 * 
 * ```typescript
 * import { PERFORMANCE_CONFIG } from './core/config/performanceConfig';
 * 
 * // Make draw calls even more expensive
 * PERFORMANCE_CONFIG.drawCallWeight = 4.0;
 * 
 * // Make IK constraints less expensive
 * PERFORMANCE_CONFIG.ikConstraintWeight = 0.8;
 * 
 * // Adjust UI thresholds
 * PERFORMANCE_CONFIG.ciThresholds.low = 25;
 * PERFORMANCE_CONFIG.ciThresholds.moderate = 80;
 * ```
 */

/**
 * Example 3: Export current configuration
 * 
 * ```typescript
 * import { getCurrentConfig } from './core/config/performanceConfig';
 * 
 * const config = getCurrentConfig();
 * console.log(JSON.stringify(config, null, 2));
 * ```
 */

/**
 * Example 4: Reset to defaults
 * 
 * ```typescript
 * import { resetToDefaults } from './core/config/performanceConfig';
 * 
 * resetToDefaults();
 * ```
 */