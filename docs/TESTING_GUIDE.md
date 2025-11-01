# Performance Impact Testing Guide

## Overview

This guide provides comprehensive documentation for the performance impact testing system in the Spine Benchmark tool. The tests validate that the cumulative performance calculation system works correctly and produces accurate, reproducible results.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Test Architecture](#test-architecture)
3. [Test Coverage](#test-coverage)
4. [Understanding Test Results](#understanding-test-results)
5. [Writing New Tests](#writing-new-tests)
6. [Troubleshooting](#troubleshooting)
7. [Best Practices](#best-practices)

## Quick Start

### Installation

```bash
# Install all dependencies
npm install

# Install test-specific dependencies (if needed)
npm install --save-dev jest ts-jest @types/jest jest-environment-jsdom
```

### Running Tests

```bash
# Run all tests
npm test

# Run unit tests only (recommended - fast and reliable)
npm test -- tests/unit

# Run with detailed output
npm test -- tests/unit --verbose

# Run with coverage report
npm test -- tests/unit --coverage

# Run in watch mode (auto-rerun on file changes)
npm test -- tests/unit --watch
```

### Expected Output

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
Snapshots:   0 total
Time:        0.726 s
```

## Test Architecture

### File Structure

```
tests/
├── unit/
│   └── performance-calculator.test.ts    # Unit tests (fast, reliable)
├── e2e/
│   └── performance-impact.test.ts        # E2E tests (requires full setup)
└── setup.ts                              # Test environment configuration

jest.config.cjs                           # Jest configuration
```

### Test Types

#### Unit Tests (Recommended)
- **Location**: `tests/unit/performance-calculator.test.ts`
- **Speed**: < 1 second
- **Dependencies**: None (pure calculation tests)
- **Use Case**: Validate calculation logic, formulas, and edge cases

#### E2E Tests (Advanced)
- **Location**: `tests/e2e/performance-impact.test.ts`
- **Speed**: Several seconds
- **Dependencies**: PixiJS, Spine runtime, example files
- **Use Case**: Validate complete analysis pipeline with real Spine files

### Test Framework

- **Test Runner**: Jest
- **TypeScript Support**: ts-jest
- **Environment**: jsdom (simulates browser environment)
- **Assertions**: Jest matchers (expect, toBe, toBeGreaterThan, etc.)

## Test Coverage

### 1. Computation Impact (CI) Tests

#### Test: Basic Bone Cost
```typescript
test('should calculate basic bone cost', () => {
  // Creates skeleton with 50 bones at various depths
  // Validates: CI >= (wb × bone_count)
  // Reason: Depth penalty adds to base bone cost
});
```

**What it validates**:
- Bone count contributes to CI with weight `wb = 1.0`
- Depth penalty is added to base cost
- Result is within reasonable bounds

#### Test: IK Constraints
```typescript
test('should account for IK constraints', () => {
  // Creates skeleton with 3 IK chains of lengths [3, 4, 5]
  // Validates: CI includes (wIK × sum(chain_lengths))
  // Expected IK cost: 1.2 × (3 + 4 + 5) = 14.4
});
```

**What it validates**:
- IK chains contribute with weight `wIK = 1.2` (highest CPU weight)
- Chain lengths are summed correctly
- IK cost is additive to total CI

#### Test: Mesh Complexity
```typescript
test('should account for mesh complexity', () => {
  // Creates skeleton with:
  // - 1000 vertices (wmesh = 0.015)
  // - 500 skinned weights (wskin = 0.01)
  // - 2 deform timelines (wdef = 0.2)
  // Expected mesh cost: 15 + 5 + 0.4 = 20.4
});
```

**What it validates**:
- Vertex count contributes with weight `wmesh = 0.015`
- Skinned weights contribute with weight `wskin = 0.01`
- Deform timelines contribute with weight `wdef = 0.2`
- All mesh costs are additive

#### Test: Bone Hierarchy Depth Penalty
```typescript
test('should penalize deep bone hierarchies', () => {
  // Compares shallow hierarchy (all depth 1) vs deep (0-29)
  // Validates: Deep hierarchy has higher CI
  // Formula: Includes linear, polynomial, and mean depth penalties
});
```

**What it validates**:
- Unbalanced hierarchies are penalized
- Deep hierarchies cost more than shallow ones
- Penalty formula is applied correctly

### 2. Rendering Impact (RI) Tests

#### Test: Draw Call Cost
```typescript
test('should calculate draw call cost', () => {
  // Creates frame with 10 draw calls
  // Expected RI: wdc × 10 = 2.5 × 10 = 25
});
```

**What it validates**:
- Draw calls contribute with weight `wdc = 2.5` (highest GPU weight)
- Calculation is exact (no other factors)

#### Test: Triangle Count
```typescript
test('should account for triangle count', () => {
  // Creates frame with 5 draw calls and 2000 triangles
  // Expected RI: (2.5 × 5) + (0.002 × 2000) = 12.5 + 4 = 16.5
});
```

**What it validates**:
- Triangles contribute with weight `wtri = 0.002`
- Triangle cost is additive to draw call cost

#### Test: Blend Modes
```typescript
test('should account for blend modes', () => {
  // Creates frame with 8 non-normal blend slots
  // Expected RI: includes (wblend × 8) = 0.6 × 8 = 4.8
});
```

**What it validates**:
- Non-normal blend modes contribute with weight `wblend = 0.6`
- Blend mode cost is additive to other RI components

### 3. Performance Score Tests

#### Test: Zero Impact
```typescript
test('should return 100 for zero impact', () => {
  // Score = 100 × e^(-1.0 × (0 / 50)) = 100 × e^0 = 100
});
```

**What it validates**:
- Perfect score for zero impact
- Formula baseline is correct

#### Test: Score Range
```typescript
test('should return score in valid range', () => {
  // Tests impacts: [10, 50, 100, 200, 500, 1000]
  // Validates: All scores are in [0, 100]
});
```

**What it validates**:
- Score never exceeds 100
- Score never goes below 0
- Formula handles all impact levels

#### Test: Exponential Decay Formula
```typescript
test('should follow exponential decay formula', () => {
  // Manual calculation: 100 × e^(-1.0 × (100 / 50))
  // Validates: Calculated score matches formula
});
```

**What it validates**:
- Formula implementation is correct
- Normalization scalar (S = 50) is applied
- Decay factor (k = 1.0) is applied
- Math.exp() is used correctly

#### Test: Score Degradation
```typescript
test('should decrease as impact increases', () => {
  // Compares scores for impacts: 50, 100, 200
  // Validates: score(50) > score(100) > score(200)
});
```

**What it validates**:
- Higher impact = lower score
- Relationship is monotonically decreasing
- Degradation is consistent

#### Test: Expected Score Ranges
```typescript
test('should match expected score ranges', () => {
  // Low impact (10): score > 80 (Excellent)
  // Medium impact (50): 30 < score < 70 (Moderate)
  // High impact (200): score < 20 (Very Poor)
});
```

**What it validates**:
- Score ranges match documentation
- Thresholds are calibrated correctly
- Rating system is accurate

### 4. Cumulative Impact Scenarios

#### Test: 15 Low Complexity Instances
```typescript
test('should calculate cumulative impact for 15 low complexity instances', () => {
  // Simulates realistic slot game scenario
  // Single instance: CI ~48, RI ~9, Score ~32
  // 15 instances: CI ~720, RI ~136, Score ~0
});
```

**What it validates**:
- Cumulative impact = sum of individual impacts
- Performance degrades with multiple instances
- Realistic slot game scenario is modeled
- Single instance is acceptable, 15 instances is critical

**Console Output**:
```
================================================================================
CUMULATIVE IMPACT TEST: 15 Low Complexity Instances
================================================================================
Single Instance - CI: 48.00, RI: 9.10, Total: 57.10, Score: 31.92
15 Instances    - CI: 720.00, RI: 136.50, Total: 856.50, Score: 0.00
================================================================================
```

#### Test: Complexity Comparison
```typescript
test('should show different impacts for different complexity levels', () => {
  // Low complexity: 30 bones, simple constraints
  // High complexity: 80 bones, many constraints
  // Validates: High complexity has significantly higher impact
});
```

**What it validates**:
- Different complexity levels produce different impacts
- High complexity symbols cost more
- Impact difference is measurable and significant

**Console Output**:
```
================================================================================
COMPLEXITY COMPARISON
================================================================================
Low  Complexity - CI: 36.66, RI: 5.90, Total: 42.56, Score: 42.69
High Complexity - CI: 250.33, RI: 24.20, Total: 274.53, Score: 0.41
================================================================================
```

## Understanding Test Results

### Performance Score Interpretation

| Score Range | Rating | Interpretation | Test Validation |
|-------------|--------|----------------|-----------------|
| 85-100 | Excellent | Performs excellently on all devices | Impact < 10 |
| 70-84 | Good | Performs well on most devices | Impact 10-30 |
| 55-69 | Moderate | May have issues on lower-end devices | Impact 30-50 |
| 40-54 | Poor | Will likely have issues on many devices | Impact 50-80 |
| 0-39 | Very Poor | Severe performance issues | Impact > 80 |

### Key Metrics from Tests

#### Single Instance Performance
- **CI**: 48.00 (moderate CPU cost)
- **RI**: 9.10 (low GPU cost)
- **Total Impact**: 57.10
- **Score**: 31.92 (Poor but acceptable for single instance)

#### 15 Instances (Cumulative)
- **CI**: 720.00 (15× single instance)
- **RI**: 136.50 (15× single instance)
- **Total Impact**: 856.50
- **Score**: 0.00 (Critical - needs optimization)

#### Complexity Comparison
- **Low Complexity**: Score 42.69 (Poor)
- **High Complexity**: Score 0.41 (Critical)
- **Impact Ratio**: High is 6.45× more impactful than Low

### What Good Test Results Look Like

✅ **All tests pass** (14/14)
✅ **Fast execution** (< 1 second)
✅ **Consistent results** (deterministic calculations)
✅ **Clear console output** (performance reports)
✅ **No warnings or errors**

### What Bad Test Results Look Like

❌ **Tests fail** (calculation errors)
❌ **Slow execution** (> 5 seconds for unit tests)
❌ **Inconsistent results** (non-deterministic)
❌ **Missing console output** (no performance reports)
❌ **Type errors or warnings**

## Writing New Tests

### Template for New Test

```typescript
/**
 * Test: [Brief description]
 * 
 * [Detailed explanation of what this test validates]
 * 
 * Expected: [What the test expects to happen]
 */
test('should [describe behavior]', () => {
  // Arrange: Set up test data
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

  // Act: Perform calculation
  const ci = calculateComputationImpact(frameData);
  const ri = calculateRenderingImpact(frameData);
  const totalImpact = ci + ri;
  const score = calculatePerformanceScore(totalImpact);

  // Assert: Validate results
  expect(ci).toBeGreaterThan(0);
  expect(ri).toBeGreaterThan(0);
  expect(score).toBeGreaterThanOrEqual(0);
  expect(score).toBeLessThanOrEqual(100);

  // Optional: Log results for documentation
  console.log(`CI: ${ci.toFixed(2)}, RI: ${ri.toFixed(2)}, Score: ${score.toFixed(2)}`);
});
```

### Best Practices for Test Writing

1. **Use Descriptive Names**
   ```typescript
   // Good
   test('should penalize deep bone hierarchies more than shallow ones', () => {});
   
   // Bad
   test('test depth', () => {});
   ```

2. **Add Documentation Comments**
   ```typescript
   /**
    * Test: Validates that physics constraints contribute to CI
    * 
    * Physics constraints are CPU-intensive soft-body simulations.
    * They should contribute with weight wPH = 1.0.
    * 
    * Expected: CI includes (wPH × physics_count)
    */
   test('should account for physics constraints', () => {});
   ```

3. **Use Realistic Data**
   ```typescript
   // Good: Realistic bone count for a character
   const frameData = { bones: { count: 45, depths: [...] }, ... };
   
   // Bad: Unrealistic edge case
   const frameData = { bones: { count: 10000, depths: [...] }, ... };
   ```

4. **Test One Thing at a Time**
   ```typescript
   // Good: Tests only IK constraints
   test('should account for IK constraints', () => {
     const frameData = {
       bones: { count: 30, depths: Array(30).fill(1) },
       constraints: { ikChains: [3, 4, 5], ... }, // Only IK
       // ... all other fields at zero/empty
     };
   });
   ```

5. **Include Console Output for Important Tests**
   ```typescript
   test('should calculate cumulative impact', () => {
     // ... calculations ...
     
     console.log('\n' + '='.repeat(80));
     console.log('CUMULATIVE IMPACT TEST');
     console.log('='.repeat(80));
     console.log(`Single: CI ${ci}, RI ${ri}, Score ${score}`);
     console.log('='.repeat(80) + '\n');
   });
   ```

## Troubleshooting

### Common Issues and Solutions

#### Issue: Tests Won't Run

**Symptom**: `Cannot find module 'jest'`

**Solution**:
```bash
npm install
# or
npm install --save-dev jest ts-jest @types/jest
```

#### Issue: Type Errors

**Symptom**: `Cannot find name 'describe'` or `Cannot find name 'expect'`

**Solution**:
```bash
npm install --save-dev @types/jest
```

Then ensure `tsconfig.json` includes:
```json
{
  "compilerOptions": {
    "types": ["jest", "node"]
  }
}
```

#### Issue: Import Errors

**Symptom**: `Cannot find module '../../src/core/...'`

**Solution**: Check that file paths in imports match your project structure. Use relative paths from the test file location.

#### Issue: Calculation Mismatches

**Symptom**: `Expected: > 50, Received: 48`

**Solution**: Review the expected values in your test. The calculation may be correct but your expectation may be wrong. Check:
1. Are you accounting for all components?
2. Are the weights correct?
3. Is the depth penalty included?

#### Issue: Inconsistent Results

**Symptom**: Tests pass sometimes, fail other times

**Solution**: Ensure your test data is deterministic:
```typescript
// Good: Deterministic
const depths = Array(30).fill(1);

// Bad: Non-deterministic
const depths = Array(30).fill(0).map(() => Math.random() * 10);
```

## Best Practices

### Testing Philosophy

1. **Test Behavior, Not Implementation**
   - ✅ Test that CI increases with more bones
   - ❌ Test that a specific internal function was called

2. **Use Realistic Scenarios**
   - ✅ Test with 15 instances (realistic slot game)
   - ❌ Test with 1000 instances (unrealistic)

3. **Make Tests Self-Documenting**
   - ✅ Clear test names and comments
   - ❌ Cryptic variable names and no comments

4. **Keep Tests Fast**
   - ✅ Unit tests < 1 second total
   - ❌ Tests that take minutes to run

5. **Make Tests Independent**
   - ✅ Each test can run alone
   - ❌ Tests that depend on execution order

### Code Quality

1. **Use TypeScript Types**
   ```typescript
   const frameData: FrameData = { ... }; // Good
   const frameData = { ... }; // Bad (no type safety)
   ```

2. **Extract Common Test Data**
   ```typescript
   const createBasicFrameData = (): FrameData => ({
     bones: { count: 30, depths: Array(30).fill(1) },
     // ... other fields
   });
   ```

3. **Use Descriptive Assertions**
   ```typescript
   // Good
   expect(ci).toBeGreaterThan(expectedMinCI);
   
   // Bad
   expect(ci > 50).toBe(true);
   ```

4. **Add Helpful Error Messages**
   ```typescript
   expect(score).toBeGreaterThan(0, 
     `Score should be positive, got ${score} for impact ${totalImpact}`
   );
   ```

## Related Documentation

- [Performance Impact Analysis](./PERFORMANCE_IMPACT_ANALYSIS.md) - Complete system documentation
- [Performance Tests README](../README_PERFORMANCE_TESTS.md) - Quick start guide
- [Performance Calculator](../src/core/utils/performanceCalculator.ts) - Implementation
- [Performance Weights](../src/core/constants/performanceWeights.ts) - Weight configuration

## Contributing

When contributing new tests:

1. Follow the existing test structure and naming conventions
2. Add comprehensive documentation comments
3. Include console output for important calculations
4. Ensure all tests pass before committing
5. Update this guide if adding new test categories
6. Keep test execution time under 1 second for unit tests

## License

Same as main project license.