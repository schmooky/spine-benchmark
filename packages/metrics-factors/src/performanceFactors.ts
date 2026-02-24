/**
 * Performance factors and constants used for Spine benchmark scoring
 */
export const PERFORMANCE_FACTORS = {
    // Base weights
    BONE_WEIGHT: 0.15,             // Impact of bone count
    MESH_WEIGHT: 0.25,             // Impact of mesh count and complexity
    CLIPPING_WEIGHT: 0.20,         // Impact of clipping masks
    BLEND_MODE_WEIGHT: 0.15,       // Impact of blend modes
    CONSTRAINT_WEIGHT: 0.25,       // Impact of constraints (combined)
    
    // Constraint breakdown weights (these sum to 1.0)
    IK_WEIGHT: 0.20,               // IK constraints weight
    TRANSFORM_WEIGHT: 0.15,        // Transform constraints weight
    PATH_WEIGHT: 0.25,             // Path constraints weight
    PHYSICS_WEIGHT: 0.40,          // Physics constraints weight (highest impact)
    
    // Complexity scale factors
    BONE_DEPTH_FACTOR: 1.5,        // Multiplier for bone depth impact
    MESH_VERTEX_FACTOR: 0.03,      // Per-vertex impact
    MESH_WEIGHTED_FACTOR: 2.0,     // Multiplier for weighted meshes
    MESH_DEFORMED_FACTOR: 1.5,     // Multiplier for meshes with deformation
    CLIPPING_VERTEX_FACTOR: 1.5,   // Per-vertex impact for clipping masks
    
    // Reference values (ideal thresholds)
    IDEAL_BONE_COUNT: 30,          // Reference value for bones
    IDEAL_MESH_COUNT: 15,          // Reference value for meshes
    IDEAL_VERTEX_COUNT: 300,       // Reference value for total vertices
    IDEAL_CLIPPING_COUNT: 2,       // Reference value for clipping masks
    IDEAL_BLEND_MODE_COUNT: 2,     // Reference value for non-normal blend modes
    
    // Physics simulation complexity factors
    PHYSICS_ITERATION_COST: 3.0,   // Cost multiplier for physics iterations
    IK_CHAIN_LENGTH_FACTOR: 1.3,   // Exponential factor for IK chain length
    
    // Animation complexity
    ANIMATION_COUNT_FACTOR: 0.05,  // Impact of number of animations
    TIMELINE_DENSITY_FACTOR: 0.1,  // Impact of timeline density
  };