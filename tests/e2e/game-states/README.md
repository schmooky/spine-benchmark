# Game State Performance Testing

This directory contains game state configurations for performance regression testing. Each subdirectory represents a specific game state with defined spine instances and performance thresholds.

## Purpose

These tests ensure that performance metrics (CI, RI, TI) remain within acceptable bounds when you:
- Tweak performance calculation parameters
- Modify spine assets
- Change rendering configurations
- Update the performance analysis system

## Directory Structure

```
game-states/
├── example-idle-state/
│   └── config.json
├── your-game-state/
│   └── config.json
└── README.md
```

## Creating a Game State Test

### 1. Create a Directory

Create a new folder for your game state:

```bash
mkdir tests/e2e/game-states/my-game-state
```

### 2. Create config.json

Add a `config.json` file with the following structure:

```json
{
  "name": "My Game State",
  "description": "Description of what this state represents",
  "spines": [
    {
      "skeletonPath": "path/to/skeleton.json",
      "atlasPath": "path/to/atlas.atlas",
      "count": 5,
      "animation": "idle",
      "label": "my_spine_type"
    }
  ],
  "thresholds": {
    "maxCI": 100,
    "maxRI": 30,
    "maxTI": 130,
    "minScore": 60,
    "tolerance": 5
  }
}
```

## Configuration Reference

### Root Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Name of the game state (used in test output) |
| `description` | string | No | Description of what this state represents |
| `spines` | array | Yes | Array of spine instance configurations |
| `thresholds` | object | Yes | Performance thresholds for validation |

### Spine Instance Configuration

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `skeletonPath` | string | Yes | Path to skeleton JSON file (relative to project root) |
| `atlasPath` | string | Yes | Path to atlas file (relative to project root) |
| `count` | number | Yes | Number of instances to create |
| `animation` | string | No | Animation to play (default: "idle") |
| `label` | string | No | Label for this spine type (default: filename) |

### Performance Thresholds

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `maxCI` | number | Yes | Maximum allowed Computation Impact |
| `maxRI` | number | Yes | Maximum allowed Rendering Impact |
| `maxTI` | number | Yes | Maximum allowed Total Impact (CI + RI) |
| `minScore` | number | No | Minimum required Performance Score (0-100) |
| `tolerance` | number | No | Tolerance percentage for thresholds (default: 5%) |

## Understanding Thresholds

### Computation Impact (CI)
- Measures CPU-side costs (bones, constraints, mesh deformations)
- Typical ranges:
  - Low: < 30
  - Moderate: 30-100
  - High: > 100

### Rendering Impact (RI)
- Measures GPU-side costs (draw calls, triangles, blend modes)
- Typical ranges:
  - Low: < 20
  - Moderate: 20-50
  - High: > 50

### Total Impact (TI)
- Sum of CI + RI
- Typical ranges:
  - Low: < 50
  - Moderate: 50-150
  - High: > 150

### Performance Score
- Calculated as: `100 × e^(-k × (TI / S))`
- Range: 0-100 (higher is better)
- Typical ranges:
  - Excellent: > 80
  - Good: 60-80
  - Moderate: 40-60
  - Poor: < 40

### Tolerance
- Allows for small variations in metrics (default: 5%)
- Example: If `maxCI = 100` and `tolerance = 5`, test passes if CI ≤ 105
- Useful for accounting for minor calculation differences

## Running Tests

Run all game state tests:

```bash
npm test -- game-state-performance
```

Run a specific game state test:

```bash
npm test -- game-state-performance -t "My Game State"
```

## Example Configurations

### Simple Idle State

```json
{
  "name": "Simple Idle",
  "description": "5 low complexity symbols in idle state",
  "spines": [
    {
      "skeletonPath": "examples/gambit/olympus/low_1.json",
      "atlasPath": "examples/gambit/olympus/low_symbols_fix.atlas",
      "count": 5,
      "animation": "idle",
      "label": "low_symbol"
    }
  ],
  "thresholds": {
    "maxCI": 50,
    "maxRI": 15,
    "maxTI": 65,
    "minScore": 75,
    "tolerance": 5
  }
}
```

### Complex Mixed State

```json
{
  "name": "Complex Mixed State",
  "description": "Mix of different symbol types with various animations",
  "spines": [
    {
      "skeletonPath": "examples/gambit/olympus/low_1.json",
      "atlasPath": "examples/gambit/olympus/low_symbols_fix.atlas",
      "count": 10,
      "animation": "idle",
      "label": "background_symbols"
    },
    {
      "skeletonPath": "examples/gambit/olympus/high_1.json",
      "atlasPath": "examples/gambit/olympus/low_symbols_fix.atlas",
      "count": 3,
      "animation": "idle",
      "label": "feature_symbols"
    },
    {
      "skeletonPath": "examples/gambit/olympus/scatter.json",
      "atlasPath": "examples/gambit/olympus/Symbols_high_fix.atlas",
      "count": 2,
      "animation": "idle",
      "label": "scatter_symbols"
    }
  ],
  "thresholds": {
    "maxCI": 200,
    "maxRI": 60,
    "maxTI": 260,
    "minScore": 45,
    "tolerance": 10
  }
}
```

## Best Practices

1. **Start with Current Metrics**: Run the test once to see actual values, then set thresholds slightly above them
2. **Use Tolerance**: Set tolerance to 5-10% to account for minor variations
3. **Document State**: Use descriptive names and descriptions to explain what each state represents
4. **Test Real Scenarios**: Create configurations that match actual game states
5. **Multiple States**: Create separate configs for different game phases (idle, active, bonus, etc.)
6. **Version Control**: Commit config files to track threshold changes over time

## Troubleshooting

### Test Fails After Parameter Changes

This is expected! The test is working correctly by catching performance regressions. You have two options:

1. **Revert Changes**: If performance degraded unintentionally, revert your parameter changes
2. **Update Thresholds**: If the new performance is acceptable, update the thresholds in config.json

### File Not Found Errors

- Ensure all paths in `skeletonPath` and `atlasPath` are relative to the project root
- Verify that the files exist at the specified paths
- Check for typos in file names

### Animation Not Found

- The test will continue without the animation if it doesn't exist
- Check that the animation name matches exactly (case-sensitive)
- Use the default "idle" animation if unsure

## Integration with CI/CD

Add these tests to your CI pipeline to prevent performance regressions:

```yaml
# .github/workflows/test.yml
- name: Run Performance Tests
  run: npm test -- game-state-performance
```

This ensures that any changes that degrade performance beyond thresholds will fail the build.