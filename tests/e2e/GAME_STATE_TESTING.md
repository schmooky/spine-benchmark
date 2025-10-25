# Game State Performance Testing - Quick Start

This guide shows you how to create performance regression tests for your game states.

## What Problem Does This Solve?

You want to ensure that when you tweak performance parameters, you don't accidentally degrade performance for specific game states. This test system lets you:

1. Define a game state (e.g., "10 instances of spine B, 1 spine C, 3 spines D in idle")
2. Set performance thresholds (max CI, RI, TI)
3. Run tests that fail if metrics exceed thresholds

**Never fuck up performance again by tweaking params!**

## Quick Start (5 Minutes)

### Step 1: Create a Game State Folder

```bash
mkdir tests/e2e/game-states/my-game-idle
```

### Step 2: Create config.json

Create `tests/e2e/game-states/my-game-idle/config.json`:

```json
{
  "name": "My Game - Idle State",
  "description": "10 spine B, 1 spine C, 3 spine D in idle",
  "spines": [
    {
      "skeletonPath": "examples/gambit/olympus/low_1.json",
      "atlasPath": "examples/gambit/olympus/low_symbols_fix.atlas",
      "count": 10,
      "animation": "idle",
      "label": "spine_b"
    },
    {
      "skeletonPath": "examples/gambit/olympus/high_1.json",
      "atlasPath": "examples/gambit/olympus/low_symbols_fix.atlas",
      "count": 1,
      "animation": "idle",
      "label": "spine_c"
    },
    {
      "skeletonPath": "examples/gambit/olympus/scatter.json",
      "atlasPath": "examples/gambit/olympus/Symbols_high_fix.atlas",
      "count": 3,
      "animation": "idle",
      "label": "spine_d"
    }
  ],
  "thresholds": {
    "maxCI": 999999,
    "maxRI": 999999,
    "maxTI": 999999,
    "tolerance": 5
  }
}
```

**Note**: Start with very high thresholds - we'll set real ones in the next step.

### Step 3: Run Test to Get Baseline Metrics

```bash
npm test -- game-state-performance -t "My Game - Idle State"
```

You'll see output like:

```
================================================================================
Game State Performance Report: My Game - Idle State
================================================================================

CUMULATIVE METRICS:
--------------------------------------------------------------------------------
Total Computation Impact (CI): 142.35
Total Rendering Impact (RI):   38.20
Total Impact (TI):              180.55
Performance Score:              55.23/100

BREAKDOWN BY SPINE TYPE:
--------------------------------------------------------------------------------
Label                | Count | Total CI | Total RI | Total TI | Avg CI | Avg RI | Avg TI
--------------------------------------------------------------------------------
spine_b              |    10 |   120.50 |    32.00 |   152.50 |  12.05 |   3.20 |  15.25
spine_c              |     1 |    15.20 |     4.10 |    19.30 |  15.20 |   4.10 |  19.30
spine_d              |     3 |     6.65 |     2.10 |     8.75 |   2.22 |   0.70 |   2.92
```

### Step 4: Set Real Thresholds

Update your `config.json` with thresholds based on the baseline (add ~10% buffer):

```json
{
  "thresholds": {
    "maxCI": 160,
    "maxRI": 45,
    "maxTI": 200,
    "minScore": 50,
    "tolerance": 5
  }
}
```

### Step 5: Run Test Again

```bash
npm test -- game-state-performance -t "My Game - Idle State"
```

Now you'll see:

```
THRESHOLD VALIDATION:
--------------------------------------------------------------------------------
CI: 142.35 / 160 (±5%) ✓ PASS
RI: 38.20 / 45 (±5%) ✓ PASS
TI: 180.55 / 200 (±5%) ✓ PASS
Score: 55.23 >= 50 ✓ PASS
```

## What Happens When You Tweak Parameters?

### Scenario 1: Parameters Improve Performance ✓

You change [`PERFORMANCE_CONFIG.boneWeight`](../../src/core/config/performanceConfig.ts:28) from `0.5` to `0.3`.

Run test:
```bash
npm test -- game-state-performance
```

Result:
```
CI: 128.15 / 160 (±5%) ✓ PASS  ← Lower CI, still passes
RI: 38.20 / 45 (±5%) ✓ PASS
TI: 166.35 / 200 (±5%) ✓ PASS
```

**Great!** Performance improved and tests still pass.

### Scenario 2: Parameters Degrade Performance ✗

You change [`PERFORMANCE_CONFIG.drawCallWeight`](../../src/core/config/performanceConfig.ts:161) from `1.5` to `3.0`.

Run test:
```bash
npm test -- game-state-performance
```

Result:
```
CI: 142.35 / 160 (±5%) ✓ PASS
RI: 76.40 / 45 (±5%) ✗ FAIL  ← RI exceeded threshold!
TI: 218.75 / 200 (±5%) ✗ FAIL
```

**Test fails!** You now have two options:

1. **Revert the change** if performance degradation is unacceptable
2. **Update thresholds** if the new performance is acceptable for your use case

## Creating Multiple Game States

Create different configs for different scenarios:

```
game-states/
├── idle-state/
│   └── config.json          # Normal idle state
├── bonus-round/
│   └── config.json          # Bonus round with many animations
├── free-spins/
│   └── config.json          # Free spins with special effects
└── max-symbols/
    └── config.json          # Worst case: maximum symbols on screen
```

Run all tests:
```bash
npm test -- game-state-performance
```

## Configuration Fields Explained

### Spine Instance

```json
{
  "skeletonPath": "path/to/skeleton.json",  // Path to spine JSON
  "atlasPath": "path/to/atlas.atlas",       // Path to atlas file
  "count": 10,                               // How many instances
  "animation": "idle",                       // Which animation to play
  "label": "spine_b"                         // Label for reports
}
```

### Thresholds

```json
{
  "maxCI": 160,      // Max Computation Impact (CPU cost)
  "maxRI": 45,       // Max Rendering Impact (GPU cost)
  "maxTI": 200,      // Max Total Impact (CI + RI)
  "minScore": 50,    // Min Performance Score (0-100, optional)
  "tolerance": 5     // Tolerance % for thresholds (default: 5%)
}
```

**Tolerance Example**: If `maxCI = 100` and `tolerance = 5`, test passes if CI ≤ 105.

## Understanding Metrics

### CI (Computation Impact)
- **What**: CPU-side costs (bones, constraints, mesh deformations)
- **Typical values**: 10-200
- **High impact**: IK constraints, physics, mesh deformations

### RI (Rendering Impact)
- **What**: GPU-side costs (draw calls, triangles, blend modes)
- **Typical values**: 5-100
- **High impact**: Draw calls, non-normal blend modes

### TI (Total Impact)
- **What**: CI + RI
- **Typical values**: 15-300
- **Used for**: Overall performance score calculation

### Performance Score
- **What**: 0-100 score (higher is better)
- **Formula**: `100 × e^(-k × (TI / S))`
- **Typical values**: 40-90

## Tips

1. **Start with high thresholds**, run test, then set real thresholds based on output
2. **Add 10-20% buffer** to thresholds to allow for minor variations
3. **Use tolerance** (5-10%) to account for calculation differences
4. **Create multiple states** for different game scenarios
5. **Commit configs** to version control to track threshold changes
6. **Run in CI/CD** to catch regressions automatically

## Troubleshooting

### "No game state configurations found"

Create at least one config file in `tests/e2e/game-states/*/config.json`.

### "File not found" errors

Ensure paths in `skeletonPath` and `atlasPath` are relative to project root.

### Test fails after parameter change

This is expected! Either:
- Revert the parameter change, or
- Update thresholds if new performance is acceptable

## Full Documentation

See [`tests/e2e/game-states/README.md`](./game-states/README.md) for complete documentation.

## Example: Real Workflow

```bash
# 1. Create game state
mkdir tests/e2e/game-states/my-game-idle

# 2. Create config with high thresholds
cat > tests/e2e/game-states/my-game-idle/config.json << 'EOF'
{
  "name": "My Game Idle",
  "spines": [
    {
      "skeletonPath": "examples/gambit/olympus/low_1.json",
      "atlasPath": "examples/gambit/olympus/low_symbols_fix.atlas",
      "count": 10,
      "animation": "idle",
      "label": "symbols"
    }
  ],
  "thresholds": {
    "maxCI": 999999,
    "maxRI": 999999,
    "maxTI": 999999
  }
}
EOF

# 3. Run test to get baseline
npm test -- game-state-performance -t "My Game Idle"

# 4. Update thresholds based on output
# Edit config.json with real values

# 5. Run test again to verify
npm test -- game-state-performance -t "My Game Idle"

# 6. Commit to version control
git add tests/e2e/game-states/my-game-idle/
git commit -m "Add performance test for idle state"
```

Now you're protected from performance regressions! 🎉