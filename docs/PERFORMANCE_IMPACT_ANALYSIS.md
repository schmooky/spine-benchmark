# Performance Impact Analysis System

## Overview

This document describes the comprehensive performance impact calculation system used in the Spine Benchmark tool. The system analyzes Spine skeletal animations and calculates cumulative performance metrics based on various rendering and computational factors.

## Core Concepts

### Performance Metrics

The system calculates four primary metrics:

1. **Computation Impact (CI)** - CPU-side processing cost
2. **Rendering Impact (RI)** - GPU-side rendering cost  
3. **Total Impact** - Sum of CI and RI
4. **Performance Score** - Normalized score from 0-100 (higher is better)

### Formula

```
CI = Σ(bone_cost + constraint_cost + mesh_cost + animation_cost + depth_penalty)
RI = Σ(draw_call_cost + triangle_cost + blend_mode_cost)
Total Impact = CI + RI
Performance Score = 100 × e^(-k × (Total Impact / S))
```

Where:
- `S` = Normalization scalar (default: 50)
- `k` = Exponential decay factor (default: 1.0)

## Computation Impact (CI) Components

### 1. Bone Cost
```typescript
bone_cost = wb × bone_count
```
- **Weight (wb)**: 1.0
- Accounts for basic skeletal hierarchy processing

### 2. Constraint Costs

#### IK Constraints
```typescript
ik_cost = wIK × Σ(chain_length)
```
- **Weight (wIK)**: 1.2
- Higher weight due to iterative solving

#### Transform Constraints
```typescript
transform_cost = wTC × active_transform_count
```
- **Weight (wTC)**: 0.4

#### Path Constraints
```typescript
path_cost = wPC × Σ(bones_affected × sample_steps)
```
- **Weight (wPC)**: 0.8
- Accounts for path sampling complexity

#### Physics Constraints
```typescript
physics_cost = wPH × active_physics_count
```
- **Weight (wPH)**: 1.0
- Simulates soft-body dynamics

### 3. Mesh Costs

#### Vertex Processing
```typescript
vertex_cost = wmesh × total_vertex_count
```
- **Weight (wmesh)**: 0.015

#### Skinning
```typescript
skinning_cost = wskin × skinned_weight_count
```
- **Weight (wskin)**: 0.01
- Weighted vertices require matrix transformations

#### Deformation
```typescript
deform_cost = wdef × deform_timeline_count
```
- **Weight (wdef)**: 0.2
- Mesh deformation animations

### 4. Clipping Cost
```typescript
clipping_cost = wclip × (attachment_tris × poly_tris)
```
- **Weight (wclip)**: 0.004
- Multiplicative due to stencil buffer operations

### 5. Animation Mixing Cost
```typescript
mixing_cost = wmix × (active_tracks - 1) × applied_timelines
```
- **Weight (wmix)**: 0.25
- Blending multiple animations

### 6. Depth Penalty

Penalizes unbalanced bone hierarchies:

```typescript
D_bal = ceil(log2(bone_count + 1))
D_max = max(bone_depths)
ExcessDepth = max(0, D_max - D_bal)

WeightedDepthMean = Σ(depth^p) / bone_count
BalancedDepthMean = D_bal^p
DepthDegeneracy = max(0, WeightedDepthMean - BalancedDepthMean)

DepthPenalty = w_depth_lin × ExcessDepth + 
               w_depth_poly × ExcessDepth^γ + 
               w_depth_mean × DepthDegeneracy
```

Parameters:
- **w_depth_lin**: 0.5
- **w_depth_poly**: 0.35
- **γ (gamma)**: 2.0
- **w_depth_mean**: 0.25
- **p (depth_power)**: 2.0

## Rendering Impact (RI) Components

### 1. Draw Call Cost
```typescript
draw_call_cost = wdc × estimated_draw_calls
```
- **Weight (wdc)**: 2.5
- High weight due to significant GPU overhead

### 2. Triangle Cost
```typescript
triangle_cost = wtri × rendered_triangles
```
- **Weight (wtri)**: 0.002

### 3. Blend Mode Cost
```typescript
blend_mode_cost = wblend × non_normal_blend_slots
```
- **Weight (wblend)**: 0.6
- Non-normal blend modes require additional passes

## Cumulative Performance Impact

When multiple Spine instances are on screen simultaneously, their impacts accumulate:

```typescript
Total_CI = Σ(CI_instance_i) for i = 1 to N
Total_RI = Σ(RI_instance_i) for i = 1 to N
Total_Impact = Total_CI + Total_RI
Cumulative_Score = 100 × e^(-k × (Total_Impact / S))
```

### Performance Degradation

The exponential decay function ensures that:
- **Low impact** (< 50): Score remains high (> 60)
- **Medium impact** (50-100): Score degrades moderately (30-60)
- **High impact** (> 100): Score drops significantly (< 30)

## E2E Test Scenarios

### Scenario 1: 15 Low_1 Symbols
- **Symbol Type**: `low_1.json`
- **Instance Count**: 15
- **Expected Metrics**:
  - Min CI: 100
  - Min RI: 20
  - Max Score: 85

### Scenario 2: 15 High_1 Symbols
- **Symbol Type**: `high_1.json`
- **Instance Count**: 15
- **Expected Metrics**:
  - Min CI: 150
  - Min RI: 30
  - Max Score: 75

### Scenario 3: 15 Scatter Symbols
- **Symbol Type**: `scatter.json`
- **Instance Count**: 15
- **Expected Metrics**:
  - Min CI: 120
  - Min RI: 25
  - Max Score: 80

## Performance Optimization Guidelines

### High Impact Factors (Optimize First)

1. **Draw Calls** (weight: 2.5)
   - Batch similar attachments
   - Minimize blend mode changes
   - Reduce clipping mask usage

2. **IK Constraints** (weight: 1.2)
   - Limit IK chain lengths
   - Reduce number of IK constraints
   - Consider baking complex IK

3. **Bones** (weight: 1.0)
   - Keep bone count minimal
   - Balance hierarchy depth
   - Avoid deep nesting

### Medium Impact Factors

4. **Physics Constraints** (weight: 1.0)
   - Use sparingly
   - Reduce iteration counts
   - Consider pre-baked animations

5. **Path Constraints** (weight: 0.8)
   - Minimize sample steps
   - Reduce affected bone count

6. **Blend Modes** (weight: 0.6)
   - Use normal blend mode when possible
   - Group non-normal blends together

### Low Impact Factors (Optimize Last)

7. **Transform Constraints** (weight: 0.4)
8. **Animation Mixing** (weight: 0.25)
9. **Deform Timelines** (weight: 0.2)
10. **Mesh Vertices** (weight: 0.015)
11. **Skinned Weights** (weight: 0.01)
12. **Clipping** (weight: 0.004)
13. **Triangles** (weight: 0.002)

## Score Interpretation

| Score Range | Rating | Interpretation |
|-------------|--------|----------------|
| 85-100 | Excellent | Will perform excellently on all devices |
| 70-84 | Good | Will perform well on most devices |
| 55-69 | Moderate | May have issues on lower-end devices |
| 40-54 | Poor | Will likely have issues on many devices |
| 0-39 | Very Poor | Has severe performance issues, needs optimization |

## Implementation Details

### Analysis Flow

1. **Load Spine Instance** - Parse skeleton, atlas, and animation data
2. **Sample Animation** - Sample at 60 FPS to capture worst-case metrics
3. **Extract Frame Data** - Collect bone, constraint, mesh, and rendering data
4. **Calculate Impacts** - Apply formulas with configured weights
5. **Aggregate Results** - Sum impacts across all instances
6. **Generate Score** - Apply exponential decay function

### Key Files

- [`src/core/SpinePerformanceAnalyzer.ts`](../src/core/SpinePerformanceAnalyzer.ts) - Main analyzer class
- [`src/core/utils/performanceCalculator.ts`](../src/core/utils/performanceCalculator.ts) - Impact calculations
- [`src/core/constants/performanceWeights.ts`](../src/core/constants/performanceWeights.ts) - Weight configuration
- [`src/core/analysis/performanceAnalysis.ts`](../src/core/analysis/performanceAnalysis.ts) - Analysis logic
- [`tests/e2e/performance-impact.test.ts`](../tests/e2e/performance-impact.test.ts) - E2E tests

## Running Tests

```bash
# Install dependencies
npm install --save-dev jest ts-jest @types/jest jsdom

# Run all tests
npm test

# Run E2E tests only
npm test -- tests/e2e

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch
```

## Example Output

```
================================================================================
Performance Impact Report: 15 Low_1 Symbols
================================================================================

Symbol Type: low_1
Instance Count: 15

CUMULATIVE METRICS:
--------------------------------------------------------------------------------
Total Computation Impact (CI): 245.67
Total Rendering Impact (RI): 89.34
Total Impact: 335.01
Performance Score: 42.18/100

PER-INSTANCE BREAKDOWN:
--------------------------------------------------------------------------------
ID | CI      | RI      | Total   | Score
--------------------------------------------------------------------------------
 1 |   16.38 |    5.96 |   22.34 |  67.89
 2 |   16.38 |    5.96 |   22.34 |  67.89
 3 |   16.38 |    5.96 |   22.34 |  67.89
...
15 |   16.38 |    5.96 |   22.34 |  67.89

PERFORMANCE WEIGHTS USED:
--------------------------------------------------------------------------------
Bone Weight (wb): 1
IK Constraint (wIK): 1.2
Transform Constraint (wTC): 0.4
Path Constraint (wPC): 0.8
Physics Constraint (wPH): 1
...
================================================================================
```

## Conclusion

This performance impact system provides a comprehensive, quantitative analysis of Spine animation complexity. By understanding the weight of each factor and how they accumulate across multiple instances, developers can make informed optimization decisions to ensure smooth performance across all target devices.