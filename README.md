# Spine Benchmark

![Spine Benchmark Logo](https://spine.ddstnd.space/logo.png)

**Spine Benchmark** is a performance analysis and visualization tool for Spine animations. It helps developers and designers optimize their Spine animations by providing detailed metrics and visual feedback on various performance aspects.

**Live Demo**: [https://spine.ddstnd.space/](https://spine.ddstnd.space/)

## Spine Benchmark Performance Scoring System

The Spine benchmark performance scoring system uses a logarithmic approach to provide more meaningful and practical performance scores. The system is designed so that:

- A score of 100 represents optimal performance
- Scores of 85-90 represent good performance
- Scores decline gradually as complexity increases
- Even complex animations maintain usable scores (minimum floor of 40)

This logarithmic approach prevents overly dramatic scoring drops for minor complexity increases while still highlighting performance concerns appropriately.

## Scoring Formula

The main performance score is calculated as:

```
performanceScore = 100 - (weightedComponentPenalties)
```

Where the weighted component penalties are based on five key areas:

1. Bone Structure (15% weight)
2. Mesh Complexity (25% weight)
3. Clipping Masks (20% weight)
4. Blend Modes (15% weight)
5. Constraints (25% weight)

Each component is evaluated on a 0-100 scale, with the penalty being the difference from 100.

## Component Scoring Methods

### 1. Bone Structure Score

```
boneScore = 100 - log₂(totalBones/idealBones + 1) * 15 - (maxDepth * depthFactor)

Where:
- idealBones = 30
- depthFactor = 1.5
```

This formula creates a logarithmic penalty based on the ratio of bones to the ideal number, plus an additional penalty for deep hierarchies.

### 2. Mesh Complexity Score

```
meshScore = 100 - log₂(totalMeshes/idealMeshes + 1) * 15
             - log₂(totalVertices/idealVertices + 1) * 10
             - (deformedMeshes * deformationFactor)
             - (weightedMeshes * weightFactor)

Where:
- idealMeshes = 15
- idealVertices = 300
- deformationFactor = 1.5
- weightFactor = 2.0
```

This evaluates mesh complexity considering count, vertices, deformation, and bone weights.

### 3. Clipping Masks Score

```
clippingScore = 100 - log₂(maskCount/idealMasks + 1) * 20
                - log₂(vertexCount + 1) * 5
                - (complexMasks * 10)

Where:
- idealMasks = 2
- complexMasks = masks with >4 vertices
```

Clipping masks are heavily penalized as they significantly impact performance.

### 4. Blend Mode Score

```
blendModeScore = 100 - log₂(nonNormalCount/idealBlendModes + 1) * 20
                 - (additiveCount * 2)

Where:
- idealBlendModes = 2
```

Non-normal blend modes create additional rendering passes, with additive modes having the highest impact.

### 5. Constraint Score

```
constraintScore = 100 - (constraintImpact * 0.5)

Where constraintImpact is calculated from:
- IK constraints: log₂(ikCount + 1) * 20 + log₂(totalBones + 1) * 10 + chainComplexity * 2
- Physics constraints: log₂(physicsCount + 1) * 30 + propertiesComplexity * 5
- Path constraints: log₂(pathCount + 1) * 20 + log₂(totalBones + 1) * 10 + modeComplexity * 7
- Transform constraints: log₂(transformCount + 1) * 15 + log₂(totalBones + 1) * 8 + propComplexity * 5
```

The impact of each constraint type is weighted according to its performance cost, with physics constraints having the highest weight (40%).

## Why Logarithmic Scaling?

Logarithmic scaling is ideal for Spine performance scoring because:

1. **Progressive Impact**: The first few bones/meshes/constraints have minimal performance impact, but each additional element adds incrementally more burden.

2. **Real-world Performance Correlation**: Performance in graphical rendering typically doesn't degrade linearly; it often follows a logarithmic pattern as rendering pipelines handle initial complexity well but struggle with edge cases.

3. **Meaningful Scores**: Linear scoring would lead to extreme scores (either very high or very low) that don't provide useful guidance.

4. **Reference Calibration**: We've calibrated the scoring parameters to ensure that reference animations like symbols (100), announcers (85-95) receive appropriate scores that match their known performance characteristics.

5. **Practical User Guidance**: The resulting scores provide clear indicators for optimization without being alarmist about moderate complexity.

## Performance Score Interpretation

| Score Range | Performance Rating | Interpretation |
|-------------|-------------------|----------------|
| 85-100 | Excellent | Suitable for all platforms and continuous animations |
| 70-84 | Good | Works well on most platforms but may have issues on low-end devices |
| 55-69 | Moderate | May cause performance dips, especially with multiple instances |
| 40-54 | Poor | Performance issues likely on most devices |

## Computational Complexity Factors

The following factors increase computational complexity:

### Mesh Factors
- **Vertex Count**: Each vertex requires memory and transform calculations
- **Deformation**: Runtime vertex calculations cost CPU cycles
- **Bone Weights**: Matrix multiplication operations for weighted vertices
- **Parent Meshes**: Dependency complexity increases state management

### Physics Factors
- **Property Count**: Each affected property (position, rotation, scale) adds calculations
- **Damping/Strength**: Affect iteration count for physics simulations
- **Wind/Gravity**: Additional vector calculations

### Path Constraint Factors
- **Rotate Mode**: ChainScale is most expensive as it recalculates multiple bones
- **Spacing Mode**: Proportional spacing requires additional calculations
- **Position Calculation**: More curve segments increase complexity

This benchmark analyzes and weights all these factors to provide an accurate performance score that correlates with real-world rendering costs.

## Features

- **Drag & Drop Interface**: Easily load Spine animations by dropping files or entire folders
- **Comprehensive Analysis**: Get detailed insights on meshes, clipping masks, blend modes, and more
- **Performance Metrics**: Measure and analyze what impacts rendering performance
- **Interactive Visualization**: View and interact with your Spine animation in real-time
- **Cross-Browser Support**: Works in modern browsers with best experience in Chrome
- **Local Processing**: All analysis happens in your browser - no files are uploaded to any server

## Motivation

Spine animations can become performance bottlenecks in games and interactive applications when not optimized properly. This tool was created to help developers:

1. **Identify Optimization Opportunities**: Pinpoint specific elements in your animations that may cause performance issues
2. **Analyze Best Practices**: Understand what makes a Spine animation efficient
3. **Visualize Performance Impact**: See real-time metrics of different animation elements
4. **Educate Teams**: Help artists and developers understand the technical implications of animation choices

## How to Use

### Basic Usage

1. Visit [https://spine.ddstnd.space/](https://spine.ddstnd.space/)
2. Drag and drop your Spine files (JSON/skel, atlas, and image files) onto the drop area
3. The animation will load and the benchmark analysis will be performed automatically
4. Click the document icon to view detailed performance metrics and analysis

### Required Files

To analyze a Spine animation, you need to provide:

- **Skeleton File**: Either a `.json` or `.skel` file containing the skeleton data
- **Atlas File**: A `.atlas` file that defines the texture regions
- **Image Files**: The textures referenced in the atlas file (PNG, JPG, etc.)

You can drop these as individual files or as a folder containing all the required files.

### Understanding the Analysis

The benchmark presents several tabs of analysis:

#### Summary

A high-level overview of your animation's performance characteristics, including:
- Performance score
- Total bones, slots, meshes, etc.
- Identified performance concerns
- Optimization recommendations

#### Mesh Analysis

Detailed breakdown of mesh usage:
- Vertex counts per mesh
- Deformation status
- Bone weights
- Parent mesh connections
- Visual indicators for high-impact meshes

#### Clipping Analysis

Information about clipping masks:
- Number of masks
- Vertex complexity
- Performance impact assessment
- Optimization suggestions

#### Blend Modes

Analysis of blend mode usage:
- Count of non-normal blend modes
- Slots using special blend modes
- Performance impact warnings

#### Skeleton Tree

Visual representation of the skeleton structure:
- Bone hierarchy
- Attachment relationships
- Depth analysis

## Performance Considerations

The benchmark highlights several key performance factors:

### Meshes
- High vertex counts increase GPU load
- Mesh deformations add CPU overhead
- Bone-weighted meshes require additional calculations

### Clipping Masks
- One of the most expensive operations in Spine
- Complex masks (many vertices) significantly impact performance
- Nested clipping increases rendering complexity

### Blend Modes
- Non-normal blend modes cause additional draw calls
- Multiple blend mode changes increase renderer state changes
- Additive and multiply modes have higher overhead

### Bones
- Deep hierarchies increase computation time
- Large numbers of bones impact CPU performance
- Complex constraints add overhead

## Compatibility Notes

- **Spine Version**: Designed for Spine 4.2.x (will automatically convert 4.1.x files but will leave artifacts, you can use https://spine-4-1.ddstnd.space/ for simple preview of such assets)
- **File Drag & Drop**: Works best in Chrome for directory dropping
- **Graphics**: Requires WebGL support in the browser

## Local Development

To run the project locally:

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Credits and License

Spine Benchmark is an open-source tool created to help the Spine animation community. It uses:

- [PixiJS](https://pixijs.com/) for WebGL rendering
- [React](https://reactjs.org/) for the user interface
- [Spine Runtime](http://esotericsoftware.com/) for animation processing

Licensed under MIT License - feel free to use, modify and contribute!

## Contributing

Contributions are welcome! If you'd like to improve the benchmark tool:

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Submit a pull request

## Contact & Support

If you encounter any issues or have questions about Spine Benchmark:

- Create an issue in this repository
- 
