# Performance Impact Tests

## Overview

This document provides instructions for running and understanding the comprehensive performance impact tests for the Spine Benchmark tool.

## Test Structure

### Unit Tests (Recommended)
**Location**: `tests/unit/performance-calculator.test.ts`

Fast, reliable tests that validate the core performance calculation logic without requiring full PixiJS/Spine initialization. These tests run in milliseconds and provide comprehensive coverage of the performance impact system.

### E2E Tests (Advanced)
**Location**: `tests/e2e/performance-impact.test.ts`

Full end-to-end tests that load actual Spine files and validate the complete analysis pipeline. These require additional setup and take longer to run.

## Installation

Install test dependencies:

```bash
npm install --save-dev jest ts-jest @types/jest jest-environment-jsdom
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Unit Tests Only (Recommended)
```bash
npm test -- tests/unit
```

### Run in Watch Mode
```bash
npm run test:watch
```

### Run with Coverage
```bash
npm run test:coverage
```

## Unit Test Coverage

The unit tests validate all core functionality:

### 1. **Computation Impact (CI) Calculations**
- ✅ Basic bone cost calculation
- ✅ IK constraint impact
- ✅ Mesh complexity (vertices, skinning, deformation)
- ✅ Bone hierarchy depth penalty

### 2. **Rendering Impact (RI) Calculations**
- ✅ Draw call cost
- ✅ Triangle count impact
- ✅ Blend mode overhead

### 3. **Performance Score**
- ✅ Score range validation [0-100]
- ✅ Exponential decay formula accuracy
- ✅ Score degradation with increased impact
- ✅ Expected score ranges for different impact levels

### 4. **Cumulative Impact Scenarios**
- ✅ 15 low complexity instances simulation
- ✅ Complexity level comparison (low vs high)
- ✅ Performance degradation demonstration

## Test Results

When you run the unit tests, you'll see detailed output:

```
 PASS  tests/unit/performance-calculator.test.ts
  Performance Calculator
    calculateComputationImpact
      ✓ should calculate basic bone cost (1 ms)
      ✓ should account for IK constraints
      ✓ should account for mesh complexity
      ✓ should penalize deep bone hierarchies (1 ms)
    calculateRenderingImpact
      ✓ should calculate draw call cost
      ✓ should account for triangle count
      ✓ should account for blend modes
    calculatePerformanceScore
      ✓ should return 100 for zero impact
      ✓ should return score in valid range (1 ms)
      ✓ should follow exponential decay formula
      ✓ should decrease as impact increases
      ✓ should match expected score ranges
    Cumulative Impact Scenarios
      ✓ should calculate cumulative impact for 15 low complexity instances (16 ms)
      ✓ should show different impacts for different complexity levels (5 ms)

Test Suites: 1 passed, 1 total
Tests:       14 passed, 14 total
Time:        0.726 s
```

### Performance Reports

The cumulative impact tests generate detailed reports:

```
================================================================================
CUMULATIVE IMPACT TEST: 15 Low Complexity Instances
================================================================================
Single Instance - CI: 48.00, RI: 9.10, Total: 57.10, Score: 31.92
15 Instances    - CI: 720.00, RI: 136.50, Total: 856.50, Score: 0.00
================================================================================

================================================================================
COMPLEXITY COMPARISON
================================================================================
Low  Complexity - CI: 36.66, RI: 5.90, Total: 42.56, Score: 42.69
High Complexity - CI: 250.33, RI: 24.20, Total: 274.53, Score: 0.41
================================================================================
```

## Understanding the Results

### Performance Score Interpretation

| Score | Rating | Meaning |
|-------|--------|---------|
| 85-100 | Excellent | Performs excellently on all devices |
| 70-84 | Good | Performs well on most devices |
| 55-69 | Moderate | May have issues on lower-end devices |
| 40-54 | Poor | Will likely have issues on many devices |
| 0-39 | Very Poor | Severe performance issues, needs optimization |

### Key Insights from Test Results

1. **Single Instance Performance**
   - Low complexity symbol: Score ~32 (Poor)
   - This represents a moderately complex symbol with constraints and meshes

2. **Cumulative Impact (15 Instances)**
   - Total CI: 720.00 (15x single instance)
   - Total RI: 136.50 (15x single instance)
   - Score: 0.00 (Critical performance issues)
   - Demonstrates realistic slot game scenario with multiple symbols

3. **Complexity Comparison**
   - Low complexity: Score 42.69
   - High complexity: Score 0.41
   - High complexity symbols have 6.8x more total impact

## Performance Calculation Formula

### Computation Impact (CI)
```
CI = wb × bones + 
     wIK × Σ(ik_chains) + 
     wTC × transforms + 
     wPC × Σ(path_bones × samples) + 
     wPH × physics + 
     wmesh × vertices + 
     wskin × skinned_weights + 
     wdef × deform_timelines + 
     wclip × (attachment_tris × poly_tris) + 
     wmix × (active_tracks × timelines) + 
     depth_penalty
```

### Rendering Impact (RI)
```
RI = wdc × draw_calls + 
     wtri × triangles + 
     wblend × blend_modes
```

### Performance Score
```
Score = 100 × e^(-k × (Total Impact / S))
```
Where:
- S = 50 (normalization scalar)
- k = 1.0 (decay factor)
- Total Impact = CI + RI

## Optimization Guidelines

Based on test results, optimize in this priority order:

### High Impact (Optimize First)
1. **Draw Calls** (weight: 2.5)
   - Batch similar attachments
   - Minimize state changes
   
2. **IK Constraints** (weight: 1.2)
   - Reduce chain lengths
   - Limit number of constraints

3. **Bones** (weight: 1.0)
   - Keep count minimal
   - Balance hierarchy depth

### Medium Impact
4. **Physics** (weight: 1.0)
5. **Path Constraints** (weight: 0.8)
6. **Blend Modes** (weight: 0.6)

### Low Impact (Optimize Last)
7. **Transform Constraints** (weight: 0.4)
8. **Animation Mixing** (weight: 0.25)
9. **Deform Timelines** (weight: 0.2)
10. **Mesh Vertices** (weight: 0.015)

## Customizing Tests

### Add New Test Scenarios

```typescript
test('should calculate impact for custom scenario', () => {
  const frameData: FrameData = {
    bones: { count: 40, depths: Array(40).fill(2) },
    constraints: { 
      ikChains: [3, 4], 
      transformCount: 2, 
      pathBonesAffected: [], 
      pathSampleSteps: [], 
      physicsCount: 1 
    },
    animation: { activeTracksMinusBase: 0, appliedTimelines: 4 },
    meshes: { vertexCount: 400, skinnedWeights: 200, deformTimelines: 2 },
    clipping: { attachmentTris: 8, polyTris: 4, transitions: 2 },
    rendering: { estimatedDrawCalls: 4, renderedTriangles: 300, nonNormalBlendSlots: 2 }
  };

  const ci = calculateComputationImpact(frameData);
  const ri = calculateRenderingImpact(frameData);
  const score = calculatePerformanceScore(ci + ri);

  console.log(`CI: ${ci}, RI: ${ri}, Score: ${score}`);
});
```

### Modify Performance Weights

Edit [`src/core/constants/performanceWeights.ts`](src/core/constants/performanceWeights.ts):

```typescript
export const PERFORMANCE_WEIGHTS = {
  wb: 1.0,      // Increase to make bones more impactful
  wIK: 1.5,     // Increase IK constraint weight
  wdc: 3.0,     // Increase draw call penalty
  // ... other weights
};
```

## Troubleshooting

### Tests Won't Run

**Error**: `Cannot find module 'jest'`

**Solution**: Install dependencies
```bash
npm install
```

### Type Errors

**Error**: `Cannot find name 'describe'`

**Solution**: Ensure `@types/jest` is installed
```bash
npm install --save-dev @types/jest
```

### Import Errors

**Error**: `Cannot find module '../../src/core/...'`

**Solution**: Check that paths in test files match your project structure

## Related Documentation

- [Performance Impact Analysis](docs/PERFORMANCE_IMPACT_ANALYSIS.md) - Complete system documentation
- [Performance Weights](src/core/constants/performanceWeights.ts) - Weight configuration
- [Performance Calculator](src/core/utils/performanceCalculator.ts) - Implementation

## Contributing

When adding new tests:

1. Follow existing test structure and naming conventions
2. Add descriptive test names that explain what is being validated
3. Include console.log output for important calculations
4. Update this README with new test scenarios
5. Ensure all tests pass before committing

## Test Philosophy

These tests follow the principle of **testing behavior, not implementation**. They validate:
- ✅ Correct calculation results
- ✅ Expected performance degradation patterns
- ✅ Formula accuracy
- ✅ Score ranges and interpretations

Rather than:
- ❌ Internal function calls
- ❌ Implementation details
- ❌ Code structure

This ensures tests remain valuable even as implementation evolves.

## License

Same as main project license.