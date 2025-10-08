# Performance Impact Configuration Guide

## Overview

This guide explains how to configure and customize the performance impact calculation system using the centralized configuration file.

## Quick Start

### Location

All performance impact coefficients are configured in a single file:

**[`src/core/config/performanceConfig.ts`](../src/core/config/performanceConfig.ts)**

### Basic Usage

```typescript
import { PERFORMANCE_CONFIG } from './core/config/performanceConfig';

// Adjust a single weight
PERFORMANCE_CONFIG.drawCallWeight = 3.0;

// Adjust UI thresholds
PERFORMANCE_CONFIG.ciThresholds.low = 25;
PERFORMANCE_CONFIG.ciThresholds.moderate = 80;
```

### Apply Presets

```typescript
import { applyPreset } from './core/config/performanceConfig';

// Apply mobile preset (stricter thresholds)
applyPreset('mobile');

// Apply desktop preset (more lenient)
applyPreset('desktop');

// Apply strict preset (for optimization)
applyPreset('strict');

// Apply lenient preset (for complex animations)
applyPreset('lenient');
```

## Configuration Structure

### 1. Computation Impact (CI) Weights

These weights control how much each CPU-side factor contributes to the total impact.

#### Bone Weight
```typescript
PERFORMANCE_CONFIG.boneWeight = 1.0;
```
- **Default**: 1.0
- **Range**: 0.5 - 2.0
- **Impact**: Linear with bone count
- **Formula**: `CI += boneWeight × bone_count`

#### IK Constraint Weight
```typescript
PERFORMANCE_CONFIG.ikConstraintWeight = 1.2;
```
- **Default**: 1.2 (highest CPU weight)
- **Range**: 0.8 - 2.0
- **Impact**: Per bone in IK chain
- **Formula**: `CI += ikConstraintWeight × Σ(chain_lengths)`
- **Note**: IK is the most CPU-intensive operation

#### Transform Constraint Weight
```typescript
PERFORMANCE_CONFIG.transformConstraintWeight = 0.4;
```
- **Default**: 0.4
- **Range**: 0.2 - 1.0
- **Impact**: Per active transform constraint
- **Formula**: `CI += transformConstraintWeight × transform_count`

#### Path Constraint Weight
```typescript
PERFORMANCE_CONFIG.pathConstraintWeight = 0.8;
```
- **Default**: 0.8
- **Range**: 0.4 - 1.5
- **Impact**: Multiplied by bones affected and sample steps
- **Formula**: `CI += pathConstraintWeight × Σ(bones_affected × sample_steps)`

#### Physics Constraint Weight
```typescript
PERFORMANCE_CONFIG.physicsConstraintWeight = 1.0;
```
- **Default**: 1.0
- **Range**: 0.5 - 2.0
- **Impact**: Per active physics constraint
- **Formula**: `CI += physicsConstraintWeight × physics_count`

#### Mesh Vertex Weight
```typescript
PERFORMANCE_CONFIG.meshVertexWeight = 0.015;
```
- **Default**: 0.015
- **Range**: 0.005 - 0.05
- **Impact**: Per vertex across all meshes
- **Formula**: `CI += meshVertexWeight × total_vertices`

#### Skinned Mesh Weight
```typescript
PERFORMANCE_CONFIG.skinnedMeshWeight = 0.01;
```
- **Default**: 0.01
- **Range**: 0.005 - 0.03
- **Impact**: Per skinned vertex weight
- **Formula**: `CI += skinnedMeshWeight × skinned_weights`

#### Deform Timeline Weight
```typescript
PERFORMANCE_CONFIG.deformTimelineWeight = 0.2;
```
- **Default**: 0.2
- **Range**: 0.1 - 0.5
- **Impact**: Per mesh deformation timeline
- **Formula**: `CI += deformTimelineWeight × deform_timelines`

#### Clipping Weight
```typescript
PERFORMANCE_CONFIG.clippingWeight = 0.004;
```
- **Default**: 0.004
- **Range**: 0.001 - 0.01
- **Impact**: Multiplicative (attachment_tris × poly_tris)
- **Formula**: `CI += clippingWeight × (attachment_tris × poly_tris)`

#### Animation Mixing Weight
```typescript
PERFORMANCE_CONFIG.animationMixingWeight = 0.25;
```
- **Default**: 0.25
- **Range**: 0.1 - 0.5
- **Impact**: Blending multiple animations
- **Formula**: `CI += animationMixingWeight × (active_tracks × timelines)`

### 2. Depth Penalty Weights

These weights penalize unbalanced bone hierarchies.

```typescript
PERFORMANCE_CONFIG.depthPenaltyLinear = 0.5;
PERFORMANCE_CONFIG.depthPenaltyPolynomial = 0.35;
PERFORMANCE_CONFIG.depthPenaltyExponent = 2.0;
PERFORMANCE_CONFIG.depthPenaltyMean = 0.25;
PERFORMANCE_CONFIG.depthPower = 2.0;
```

**Formula**:
```
DepthPenalty = depthPenaltyLinear × ExcessDepth + 
               depthPenaltyPolynomial × ExcessDepth^gamma + 
               depthPenaltyMean × DepthDegeneracy
```

### 3. Rendering Impact (RI) Weights

These weights control how much each GPU-side factor contributes to the total impact.

#### Draw Call Weight
```typescript
PERFORMANCE_CONFIG.drawCallWeight = 2.5;
```
- **Default**: 2.5 (highest GPU weight)
- **Range**: 1.0 - 5.0
- **Impact**: Per draw call
- **Formula**: `RI += drawCallWeight × draw_calls`
- **Note**: Draw calls are the most expensive GPU operation

#### Triangle Weight
```typescript
PERFORMANCE_CONFIG.triangleWeight = 0.002;
```
- **Default**: 0.002
- **Range**: 0.001 - 0.005
- **Impact**: Per rendered triangle
- **Formula**: `RI += triangleWeight × triangles`

#### Blend Mode Weight
```typescript
PERFORMANCE_CONFIG.blendModeWeight = 0.6;
```
- **Default**: 0.6
- **Range**: 0.3 - 1.2
- **Impact**: Per non-normal blend mode
- **Formula**: `RI += blendModeWeight × non_normal_blends`

### 4. Performance Score Parameters

```typescript
PERFORMANCE_CONFIG.normalizationScalar = 50;
PERFORMANCE_CONFIG.decayFactor = 1.0;
```

**Formula**:
```
Score = 100 × e^(-decayFactor × (TotalImpact / normalizationScalar))
```

- **normalizationScalar (S)**: Higher = more lenient scoring
- **decayFactor (k)**: Higher = faster score degradation

### 5. UI Display Thresholds

#### CI Thresholds (CPU Impact)
```typescript
PERFORMANCE_CONFIG.ciThresholds = {
  low: 30,      // Green below this
  moderate: 100 // Yellow below this, red above
};
```

#### RI Thresholds (GPU Impact)
```typescript
PERFORMANCE_CONFIG.riThresholds = {
  low: 20,      // Light green below this
  moderate: 50  // Light yellow below this, light red above
};
```

#### Total Impact Thresholds
```typescript
PERFORMANCE_CONFIG.totalImpactThresholds = {
  low: 50,      // Excellent performance
  moderate: 150 // Acceptable performance, poor above
};
```

## Preset Configurations

### Mobile Preset

**Use Case**: Targeting mobile devices with limited CPU/GPU

```typescript
applyPreset('mobile');
```

**Changes**:
- Draw calls: 2.5 → 3.5 (more expensive on mobile)
- IK constraints: 1.2 → 1.5 (more expensive on mobile CPUs)
- Normalization: 50 → 40 (stricter scoring)
- CI thresholds: 30/100 → 20/60
- RI thresholds: 20/50 → 15/35
- Total thresholds: 50/150 → 35/100

**Effect**: Stricter performance requirements, lower acceptable impact levels

### Desktop Preset

**Use Case**: Targeting desktop devices with powerful hardware

```typescript
applyPreset('desktop');
```

**Changes**:
- Draw calls: 2.5 → 2.0 (less expensive on desktop)
- IK constraints: 1.2 → 1.0 (less expensive on desktop CPUs)
- Normalization: 50 → 60 (more lenient scoring)
- CI thresholds: 30/100 → 40/120
- RI thresholds: 20/50 → 25/60
- Total thresholds: 50/150 → 65/180

**Effect**: More lenient performance requirements, higher acceptable impact levels

### Strict Preset

**Use Case**: Optimization mode, finding all performance issues

```typescript
applyPreset('strict');
```

**Changes**:
- Draw calls: 2.5 → 4.0 (very expensive)
- IK constraints: 1.2 → 2.0 (very expensive)
- Physics: 1.0 → 1.5 (very expensive)
- Normalization: 50 → 30 (very strict scoring)
- All thresholds significantly lowered

**Effect**: Very strict requirements, highlights all potential issues

### Lenient Preset

**Use Case**: Complex animations where high impact is expected

```typescript
applyPreset('lenient');
```

**Changes**:
- Draw calls: 2.5 → 1.5 (less expensive)
- IK constraints: 1.2 → 0.8 (less expensive)
- Normalization: 50 → 80 (very lenient scoring)
- All thresholds significantly raised

**Effect**: Relaxed requirements, suitable for cinematic animations

## Common Customization Scenarios

### Scenario 1: Optimize for Mobile Games

```typescript
import { PERFORMANCE_CONFIG } from './core/config/performanceConfig';

// Make draw calls very expensive (mobile GPUs are limited)
PERFORMANCE_CONFIG.drawCallWeight = 4.0;

// Make physics very expensive (mobile CPUs are limited)
PERFORMANCE_CONFIG.physicsConstraintWeight = 1.5;

// Stricter thresholds
PERFORMANCE_CONFIG.ciThresholds.low = 20;
PERFORMANCE_CONFIG.ciThresholds.moderate = 60;
PERFORMANCE_CONFIG.riThresholds.low = 15;
PERFORMANCE_CONFIG.riThresholds.moderate = 35;
```

### Scenario 2: Optimize for Slot Games (Multiple Instances)

```typescript
import { PERFORMANCE_CONFIG } from './core/config/performanceConfig';

// Since multiple symbols will be on screen, be stricter
PERFORMANCE_CONFIG.normalizationScalar = 40; // Stricter scoring

// Emphasize factors that multiply with instance count
PERFORMANCE_CONFIG.drawCallWeight = 3.0;
PERFORMANCE_CONFIG.triangleWeight = 0.003;

// Lower thresholds since impact will accumulate
PERFORMANCE_CONFIG.totalImpactThresholds.low = 35;
PERFORMANCE_CONFIG.totalImpactThresholds.moderate = 100;
```

### Scenario 3: Optimize for Cinematic Animations

```typescript
import { PERFORMANCE_CONFIG } from './core/config/performanceConfig';

// Cinematic animations can be more complex
PERFORMANCE_CONFIG.normalizationScalar = 80; // More lenient

// Allow more complex constraints
PERFORMANCE_CONFIG.ikConstraintWeight = 0.8;
PERFORMANCE_CONFIG.physicsConstraintWeight = 0.7;

// Higher thresholds
PERFORMANCE_CONFIG.ciThresholds.low = 50;
PERFORMANCE_CONFIG.ciThresholds.moderate = 150;
```

### Scenario 4: Focus on Draw Call Optimization

```typescript
import { PERFORMANCE_CONFIG } from './core/config/performanceConfig';

// Make draw calls extremely expensive to highlight batching issues
PERFORMANCE_CONFIG.drawCallWeight = 5.0;

// Make blend modes expensive (they break batching)
PERFORMANCE_CONFIG.blendModeWeight = 1.2;

// Stricter RI thresholds
PERFORMANCE_CONFIG.riThresholds.low = 15;
PERFORMANCE_CONFIG.riThresholds.moderate = 40;
```

## Testing Configuration Changes

After modifying configuration, run tests to see the impact:

```bash
# Run unit tests
npm test -- tests/unit

# The console output will show new impact values
# based on your configuration changes
```

### Example Test Output

**Default Configuration**:
```
Low  Complexity - CI: 36.66, RI: 5.90, Total: 42.56, Score: 42.69
High Complexity - CI: 250.33, RI: 24.20, Total: 274.53, Score: 0.41
```

**After Increasing Draw Call Weight to 4.0**:
```
Low  Complexity - CI: 36.66, RI: 8.90, Total: 45.56, Score: 40.12
High Complexity - CI: 250.33, RI: 36.20, Total: 286.53, Score: 0.28
```

## Configuration Best Practices

### 1. Start with Presets

```typescript
// Start with a preset that matches your use case
applyPreset('mobile');  // or 'desktop', 'strict', 'lenient'

// Then fine-tune specific weights
PERFORMANCE_CONFIG.drawCallWeight = 3.2;
```

### 2. Test After Changes

Always run tests after configuration changes:

```bash
npm test -- tests/unit
```

### 3. Document Your Changes

Add comments explaining why you changed values:

```typescript
// Increased for mobile slot game with 15 symbols on screen
PERFORMANCE_CONFIG.drawCallWeight = 3.5;

// Reduced because our animations don't use IK heavily
PERFORMANCE_CONFIG.ikConstraintWeight = 0.9;
```

### 4. Version Control

Keep track of configuration changes in version control:

```bash
git commit -m "config: Adjust weights for mobile optimization"
```

### 5. Use getCurrentConfig() for Debugging

```typescript
import { getCurrentConfig } from './core/config/performanceConfig';

console.log('Current config:', getCurrentConfig());
```

## Weight Adjustment Guidelines

### When to Increase a Weight

Increase a weight when:
- ✅ That factor is causing performance issues in your target environment
- ✅ You want to penalize that factor more heavily
- ✅ You want to encourage optimization of that factor

### When to Decrease a Weight

Decrease a weight when:
- ✅ That factor is not a bottleneck in your use case
- ✅ You want to allow more of that factor
- ✅ Your target hardware handles that factor well

### Weight Relationships

**High Impact Weights** (optimize first):
1. Draw Calls (2.5) - Highest GPU impact
2. IK Constraints (1.2) - Highest CPU impact
3. Bones (1.0)
4. Physics (1.0)

**Medium Impact Weights**:
5. Path Constraints (0.8)
6. Blend Modes (0.6)
7. Transform Constraints (0.4)

**Low Impact Weights** (optimize last):
8. Animation Mixing (0.25)
9. Deform Timelines (0.2)
10. Mesh Vertices (0.015)
11. Skinned Weights (0.01)
12. Clipping (0.004)
13. Triangles (0.002)

## UI Threshold Guidelines

### CI Thresholds (CPU Impact)

```typescript
PERFORMANCE_CONFIG.ciThresholds = {
  low: 30,      // Green - Excellent CPU performance
  moderate: 100 // Yellow - Acceptable CPU performance
  // Above moderate = Red - Poor CPU performance
};
```

**Adjustment Guide**:
- **Lower thresholds**: More strict, highlights issues earlier
- **Higher thresholds**: More lenient, allows more complexity

**Recommended Ranges**:
- Mobile: `{ low: 20, moderate: 60 }`
- Desktop: `{ low: 40, moderate: 120 }`
- Strict: `{ low: 15, moderate: 40 }`

### RI Thresholds (GPU Impact)

```typescript
PERFORMANCE_CONFIG.riThresholds = {
  low: 20,      // Light Green - Excellent GPU performance
  moderate: 50  // Light Yellow - Acceptable GPU performance
  // Above moderate = Light Red - Poor GPU performance
};
```

**Adjustment Guide**:
- **Lower thresholds**: Stricter GPU requirements
- **Higher thresholds**: More lenient GPU requirements

**Recommended Ranges**:
- Mobile: `{ low: 15, moderate: 35 }`
- Desktop: `{ low: 25, moderate: 60 }`
- Strict: `{ low: 10, moderate: 25 }`

### Total Impact Thresholds

```typescript
PERFORMANCE_CONFIG.totalImpactThresholds = {
  low: 50,      // Excellent overall performance
  moderate: 150 // Acceptable overall performance
  // Above moderate = Poor overall performance
};
```

**Used for**: Overall performance rating in tooltips and reports

## Advanced Configuration

### Custom Preset

Create your own preset for specific use cases:

```typescript
import { PERFORMANCE_CONFIG } from './core/config/performanceConfig';

// Save current config
const myCustomPreset = {
  drawCallWeight: 3.2,
  ikConstraintWeight: 1.0,
  physicsConstraintWeight: 1.3,
  normalizationScalar: 45,
  ciThresholds: { low: 25, moderate: 85 },
  riThresholds: { low: 18, moderate: 45 },
  totalImpactThresholds: { low: 45, moderate: 130 }
};

// Apply custom preset
Object.assign(PERFORMANCE_CONFIG, myCustomPreset);
```

### Dynamic Configuration

Adjust configuration based on runtime conditions:

```typescript
import { PERFORMANCE_CONFIG } from './core/config/performanceConfig';

// Detect device type
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

if (isMobile) {
  PERFORMANCE_CONFIG.drawCallWeight = 3.5;
  PERFORMANCE_CONFIG.ciThresholds.low = 20;
  PERFORMANCE_CONFIG.ciThresholds.moderate = 60;
}
```

### Configuration Validation

Validate configuration before use:

```typescript
import { PERFORMANCE_CONFIG } from './core/config/performanceConfig';

function validateConfig() {
  // Ensure weights are positive
  if (PERFORMANCE_CONFIG.drawCallWeight <= 0) {
    throw new Error('Draw call weight must be positive');
  }
  
  // Ensure thresholds are ordered correctly
  if (PERFORMANCE_CONFIG.ciThresholds.low >= PERFORMANCE_CONFIG.ciThresholds.moderate) {
    throw new Error('CI low threshold must be less than moderate threshold');
  }
  
  console.log('✓ Configuration is valid');
}

validateConfig();
```

## Impact of Configuration Changes

### Example: Doubling Draw Call Weight

**Before** (drawCallWeight = 2.5):
```
Display: 37 / 6
CI: 36.66, RI: 5.90
```

**After** (drawCallWeight = 5.0):
```
Display: 37 / 11
CI: 36.66, RI: 11.40 (increased!)
```

**Effect**: Highlights draw call optimization opportunities

### Example: Applying Mobile Preset

**Before** (default):
```
Display: 72 / 15 (Yellow / Yellow)
Total: 87 (Moderate)
```

**After** (mobile preset):
```
Display: 72 / 21 (Red / Yellow)
Total: 93 (High)
```

**Effect**: Same animation now shows as higher impact on mobile

## Troubleshooting

### Issue: All Impacts Show as Red

**Cause**: Thresholds are too strict

**Solution**: Increase threshold values or apply lenient preset
```typescript
applyPreset('lenient');
// or
PERFORMANCE_CONFIG.ciThresholds.moderate = 150;
```

### Issue: All Impacts Show as Green

**Cause**: Thresholds are too lenient

**Solution**: Decrease threshold values or apply strict preset
```typescript
applyPreset('strict');
// or
PERFORMANCE_CONFIG.ciThresholds.low = 20;
```

### Issue: Scores Don't Match Expectations

**Cause**: Normalization scalar or decay factor needs adjustment

**Solution**: Adjust score parameters
```typescript
// More lenient scoring
PERFORMANCE_CONFIG.normalizationScalar = 70;

// Faster score degradation
PERFORMANCE_CONFIG.decayFactor = 1.5;
```

## Related Documentation

- [Performance Impact Analysis](./PERFORMANCE_IMPACT_ANALYSIS.md) - System documentation
- [UI Changes Guide](./UI_CHANGES_PERFORMANCE_IMPACT.md) - UI implementation
- [Testing Guide](./TESTING_GUIDE.md) - Test documentation

## Summary

The centralized configuration system provides:

✅ **Single source of truth** - All coefficients in one file
✅ **Easy customization** - Change values without touching calculation code
✅ **Preset configurations** - Quick setup for common scenarios
✅ **Type-safe** - TypeScript ensures valid configurations
✅ **Well-documented** - Inline comments explain each parameter
✅ **Testable** - Run tests to validate changes

**Configuration File**: [`src/core/config/performanceConfig.ts`](../src/core/config/performanceConfig.ts)

---

**Last Updated**: 2025-01-08
**Version**: 1.2.0