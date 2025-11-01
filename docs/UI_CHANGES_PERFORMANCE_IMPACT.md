# UI Changes: Performance Impact Display

## Overview

This document describes the UI changes made to display performance impact as the primary metric in the Spine Benchmark tool.

## Changes Made

### 1. Benchmark Panel (Top-Left Corner)

**Location**: Top-left corner of the screen

**Previous Behavior**:
- Displayed median performance score (0-100)
- Higher score = better performance
- Green for high scores, red for low scores

**New Behavior**:
- Displays **CI / RI** (Computation Impact / Rendering Impact)
- Shows two numbers with separate color coding
- **Lower impact = better performance** (inverted scale)
- **Green for low impact, red for high impact**

**Visual Display**:
```
┌──────────┐
│ 36 / 6   │  ← CI (green) / RI (green)
└──────────┘

┌──────────┐
│ 87 / 24  │  ← CI (yellow) / RI (yellow)
└──────────┘

┌──────────┐
│ 250 / 89 │  ← CI (red) / RI (red)
└──────────┘
```

**Color Indicators**:

**Computation Impact (CI) - CPU costs**:
```
CI ≤ 30:    Green (#6bcf7f)   - Low CPU impact
CI 31-100:  Yellow (#ffd93d)  - Moderate CPU impact
CI > 100:   Red (#ff6b6b)     - High CPU impact
```

**Rendering Impact (RI) - GPU costs**:
```
RI ≤ 20:    Light Green (#95e1a3)   - Low GPU impact
RI 21-50:   Light Yellow (#ffe66d)  - Moderate GPU impact
RI > 50:    Light Red (#ff8787)     - High GPU impact
```

**Tooltip**: Hovering shows "Performance Impact: X CPU / Y GPU (Low/Moderate/High)"

**File Modified**: [`src/components/BenchmarkPanel.tsx`](../src/components/BenchmarkPanel.tsx)

### 2. Info Panel Tab Order

**Previous Order**:
1. Summary
2. Mesh Analysis
3. Clipping
4. Blend Modes
5. Physics/Constraints
6. Skeleton Tree
7. Performance (if available)

**New Order**:
1. **Performance Impact** (first tab, auto-selected)
2. Summary
3. Mesh Analysis
4. Clipping
5. Blend Modes
6. Physics/Constraints
7. Skeleton Tree

**Rationale**: Performance Impact is now the primary metric, so it should be the first thing users see.

**File Modified**: [`src/components/InfoPanel.tsx`](../src/components/InfoPanel.tsx)

### 3. Performance Data Integration

**Changes**:
- Benchmark panel now receives `performanceData` prop
- Uses `SpinePerformanceAnalysisResult.globalMetrics.totalImpact`
- Auto-selects Performance Impact tab when data is available

**Files Modified**:
- [`src/components/BenchmarkPanel.tsx`](../src/components/BenchmarkPanel.tsx)
- [`src/hooks/useBenchmarkPanel.ts`](../src/hooks/useBenchmarkPanel.ts)
- [`src/App.tsx`](../src/App.tsx)
- [`src/locales/en.json`](../src/locales/en.json)

## Technical Details

### Impact Calculation

The total impact displayed in the top-left corner is calculated as:

```typescript
Total Impact = Computation Impact (CI) + Rendering Impact (RI)
```

Where:
- **CI** = CPU-side costs (bones, constraints, meshes, etc.)
- **RI** = GPU-side costs (draw calls, triangles, blend modes)

### Color Thresholds

```typescript
if (totalImpact <= 50) {
  scoreClass = 'good';    // Green - Low impact
} else if (totalImpact <= 150) {
  scoreClass = 'fair';    // Yellow - Moderate impact
} else {
  scoreClass = 'poor';    // Red - High impact
}
```

### Data Flow

```
SpineInstance
    ↓
SpinePerformanceAnalyzer.analyze()
    ↓
SpinePerformanceAnalysisResult
    ↓
performanceData.globalMetrics.totalImpact
    ↓
BenchmarkPanel (displays in top-left)
```

## User Experience

### Before Loading a File
- No benchmark panel visible
- Drop zone shows instructions

### After Loading a File
1. **Benchmark panel appears** in top-left corner
2. Shows total impact number with color coding
3. Panel pulsates twice to draw attention
4. Clicking panel opens Info Panel

### Info Panel Behavior
1. **Opens to Performance Impact tab** (first tab)
2. Shows detailed breakdown of CI and RI
3. Shows per-animation performance metrics
4. Provides optimization recommendations

### Visual Feedback

**Low Impact (Both Green)**:
```
┌──────────┐
│ 36 / 6   │  ← CI: Green (36) / RI: Light Green (6)
└──────────┘
Tooltip: "Performance Impact: 36 CPU / 6 GPU (Low)"
Total: 42 (Low)
```

**Moderate Impact (Both Yellow)**:
```
┌──────────┐
│ 72 / 15  │  ← CI: Yellow (72) / RI: Light Yellow (15)
└──────────┘
Tooltip: "Performance Impact: 72 CPU / 15 GPU (Moderate)"
Total: 87 (Moderate)
```

**High Impact (Both Red)**:
```
┌───────────┐
│ 250 / 24  │  ← CI: Red (250) / RI: Light Red (24)
└───────────┘
Tooltip: "Performance Impact: 250 CPU / 24 GPU (High)"
Total: 274 (High)
```

**Mixed Impact (Different Colors)**:
```
┌──────────┐
│ 120 / 8  │  ← CI: Red (120) / RI: Light Green (8)
└──────────┘
Tooltip: "Performance Impact: 120 CPU / 8 GPU (High)"
High CPU load, low GPU load - optimize constraints/bones
```

## Impact Interpretation

### Computation Impact (CI) - CPU Costs

| CI Range | Color | Rating | Meaning |
|----------|-------|--------|---------|
| 0-30 | Green | Low | Excellent CPU performance |
| 31-100 | Yellow | Moderate | Acceptable CPU load |
| 101+ | Red | High | High CPU load, optimize bones/constraints |

**What affects CI**:
- Bone count and hierarchy depth
- IK, Transform, Path, Physics constraints
- Mesh vertices and skinning
- Animation mixing

### Rendering Impact (RI) - GPU Costs

| RI Range | Color | Rating | Meaning |
|----------|-------|--------|---------|
| 0-20 | Light Green | Low | Excellent GPU performance |
| 21-50 | Light Yellow | Moderate | Acceptable GPU load |
| 51+ | Light Red | High | High GPU load, optimize draw calls/blending |

**What affects RI**:
- Draw calls (highest impact)
- Triangle count
- Blend modes (non-normal)

### Total Impact

| Total Range | Overall Rating | Meaning |
|-------------|----------------|---------|
| 0-50 | Low | Excellent performance on all devices |
| 51-150 | Moderate | Good performance, may struggle on low-end devices |
| 151+ | High | Performance issues likely, optimization needed |

## Examples from Tests

### Single Low Complexity Instance
```
Display: 37 / 6
CI: 36.66 (Green - Low CPU impact)
RI: 5.90 (Light Green - Low GPU impact)
Total: 42 (Low overall impact)
```

### 15 Low Complexity Instances
```
Display: 720 / 137
CI: 720.00 (Red - High CPU impact)
RI: 136.50 (Light Red - High GPU impact)
Total: 856 (High overall impact - Critical!)
```

### Single High Complexity Instance
```
Display: 250 / 24
CI: 250.33 (Red - High CPU impact)
RI: 24.20 (Light Yellow - Moderate GPU impact)
Total: 274 (High overall impact)
Note: CPU-bound (high CI), GPU is acceptable
```

### CPU-Bound Example
```
Display: 180 / 12
CI: 180 (Red - High CPU impact from many constraints)
RI: 12 (Light Green - Low GPU impact)
Optimization: Reduce IK chains, physics constraints, or bone count
```

### GPU-Bound Example
```
Display: 25 / 85
CI: 25 (Green - Low CPU impact)
RI: 85 (Light Red - High GPU impact from draw calls)
Optimization: Reduce draw calls, batch rendering, minimize blend modes
```

## Migration Notes

### For Existing Users

**What Changed**:
- Top-left number now shows "impact" instead of "score"
- **Lower numbers are better** (inverted from before)
- Color coding is inverted (green = low impact = good)

**What Stayed the Same**:
- Panel location (top-left)
- Click to open detailed info
- Pulsation animation
- Overall UI layout

### For Developers

**Breaking Changes**:
- `BenchmarkPanel` now requires `performanceData` prop
- `useBenchmarkPanel` hook signature changed (added `performanceData` parameter)
- Benchmark panel displays impact instead of score

**Non-Breaking Changes**:
- Performance Impact tab added to InfoPanel
- Tab order changed (Performance Impact is first)
- Color thresholds adjusted for impact scale

## Testing

All changes are validated by the comprehensive test suite:

```bash
# Run tests to verify calculations
npm test -- tests/unit

# Expected output shows impact values
# Single Instance - CI: 48.00, RI: 9.10, Total: 57.10
# 15 Instances    - CI: 720.00, RI: 136.50, Total: 856.50
```

## Related Documentation

- [Performance Impact Analysis](./PERFORMANCE_IMPACT_ANALYSIS.md) - Complete system documentation
- [Testing Guide](./TESTING_GUIDE.md) - Test documentation
- [Performance Tests README](../README_PERFORMANCE_TESTS.md) - Quick reference

## Future Enhancements

Potential improvements:
1. Add impact trend graph over time
2. Show CI and RI breakdown in tooltip
3. Add warning icon for critical impact levels
4. Animate color transitions when impact changes
5. Add comparison with previous loads

---

**Last Updated**: 2025-01-08
**Version**: 1.2.0