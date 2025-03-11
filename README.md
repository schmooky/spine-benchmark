# Spine Benchmark

![Spine Benchmark Logo](https://spine.ddstnd.space/logo.png)

**Spine Benchmark** is a performance analysis and visualization tool for Spine animations. It helps developers and designers optimize their Spine animations by providing detailed metrics and visual feedback on various performance aspects.

**Live Demo**: [https://spine.ddstnd.space/](https://spine.ddstnd.space/)

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
