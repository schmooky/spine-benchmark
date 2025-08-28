/**
 * Performance weights as specified in the requirements
 */
export const PERFORMANCE_WEIGHTS = {
  // ComputationImpact weights
  wb: 1.0,              // Bone weight
  wIK: 1.2,             // IK constraint weight
  wTC: 0.4,             // Transform constraint weight
  wPC: 0.8,             // Path constraint weight
  wPH: 1.0,             // Physics constraint weight
  wmesh: 0.015,         // Mesh vertex weight
  wskin: 0.01,          // Skinned mesh weight
  wdef: 0.2,            // Deform timeline weight
  wclip: 0.004,         // Clipping weight
  wmix: 0.25,           // Animation mixing weight
  
  // Depth penalty weights
  w_depth_lin: 0.5,     // Linear depth penalty weight
  w_depth_poly: 0.35,   // Polynomial depth penalty weight
  gamma: 2.0,           // Depth penalty exponent
  w_depth_mean: 0.25,   // Depth mean penalty weight
  depth_power: 2.0,     // Power for weighted depth mean (p)
  
  // RenderingImpact weights
  wdc: 2.5,             // Draw call weight
  wtri: 0.002,          // Triangle weight
  wblend: 0.6,          // Blend mode weight
  
  // PerformanceScore parameters
  S: 50,                // Normalization scalar
  k: 1.0                // Exponential decay factor
};