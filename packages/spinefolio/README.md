# 🎮 Spinefolio - PixiJS v8 Spine Widget

A powerful, feature-rich widget for rendering [Spine](http://esotericsoftware.com/) skeletal animations using PixiJS v8 and `@esotericsoftware/spine-pixi-v8`.

## ✨ Features

- 🎨 **PixiJS v8 Integration** - Modern rendering with PixiJS v8
- 🎮 **Interactive Controls** - Built-in UI panel for animation control
- 🔍 **Debug Visualization** - Render bones, meshes, and bounds
- 👆 **Pan & Zoom** - Mouse and touch gesture support
- 📱 **Responsive** - Adapts to any screen size
- 🎯 **Type-Safe** - Full TypeScript support
- ⚡ **High Performance** - Optimized rendering pipeline
- 🎨 **Customizable** - Extensive configuration options

## 📦 Installation

```bash
npm install @spine-benchmark/spinefolio
```

## 🛠️ Monorepo Usage

From the `spine-benchmark` root:

```bash
# Start the demo
npm run demo:spinefolio

# Build publishable artifacts
npm run build:spinefolio
```

## 🚀 Quick Start

```typescript
import { createSpineWidget } from '@spine-benchmark/spinefolio';

const widget = createSpineWidget(document.getElementById('container'), {
  skeleton: 'path/to/skeleton.skel',
  atlas: 'path/to/atlas.atlas',
  animation: 'idle',
  loop: true,
  showControls: true
});
```

## 📖 API Reference

### Creating a Widget

```typescript
createSpineWidget(element: HTMLElement, options: SpineWidgetOptions): SpineWidgetInstance
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `skeleton` | `string` | **required** | Path to skeleton file (.skel or .json) |
| `atlas` | `string` | **required** | Path to atlas file (.atlas) |
| `images` | `string` | `undefined` | Space/comma-separated image URLs to override atlas page files (useful for `.ktx2` / `.basis` substitution) |
| `animation` | `string` | `undefined` | Initial animation name |
| `nextAnimation` | `string` | `undefined` | Optional queued animation (`addAnimation`) after the initial animation |
| `nextAnimationLoop` | `boolean` | `true` | Loop setting for `nextAnimation` |
| `skin` | `string` | `undefined` | Initial skin name |
| `loop` | `boolean` | `true` | Loop animation |
| `scale` | `number` | `1` | Scale factor |
| `x` | `number` | `0` | X position offset |
| `y` | `number` | `0` | Y position offset |
| `fitToContainer` | `boolean` | `true` | Auto-fit to container |
| `backgroundColor` | `string` | `'transparent'` | Background color |
| `showControls` | `boolean` | `false` | Show control panel |
| `controlsPosition` | `string` | `'top-left'` | Control panel position |
| `allowSkinChange` | `boolean` | `false` | Show Skin menu button in controls (when skeleton has multiple skins) |
| `enablePan` | `boolean` | `true` | Enable pan interaction |
| `enableZoom` | `boolean` | `true` | Enable zoom interaction |
| `minZoom` | `number` | `0.25` | Minimum zoom level |
| `maxZoom` | `number` | `4` | Maximum zoom level |
| `zoomSpeed` | `number` | `0.1` | Zoom speed multiplier |
| `highlightAttachmentBounds` | `string` | `undefined` | Attachment name to draw a rectangle bounds highlight around |
| `highlightAttachmentBoundsColor` | `number` | `0xff4d4f` | Rectangle color for highlighted attachment |
| `highlightAttachmentBoundsLineWidth` | `number` | `2` | Rectangle stroke width |
| `debugMeshAttachment` | `string` | `undefined` | Mesh attachment name to outline |
| `debugMeshAttachmentColor` | `number` | `0x2dd4ff` | Mesh outline color |
| `debugMeshAttachmentLineWidth` | `number` | `2` | Mesh outline stroke width |
| `onLoad` | `function` | `undefined` | Load callback |
| `onError` | `function` | `undefined` | Error callback |
| `onAnimationComplete` | `function` | `undefined` | Animation complete callback |

### Compressed Textures (.ktx2 / .basis)

If your atlas references `symbols.png` but you only have `symbols.ktx2`, pass `images` to override atlas page loading:

```typescript
createSpineWidget(element, {
  skeleton: '/assets/symbols.json',
  atlas: '/assets/symbols.atlas',
  images: '/assets/symbols.ktx2',
  animation: 'idle',
});
```

For HTML auto-init:

```html
<div
  data-spinefolio
  data-skeleton="/assets/symbols.json"
  data-atlas="/assets/symbols.atlas"
  data-images="/assets/symbols.ktx2"
></div>
```

### Control Panel Positions

- `'top-left'` - Top left corner (default)
- `'top-right'` - Top right corner
- `'bottom-left'` - Bottom left corner
- `'bottom-right'` - Bottom right corner

### Instance Methods

#### Animation Control

```typescript
// Play animation
widget.play(animation?: string, loop?: boolean): void

// Queue next animation on the same track
widget.addAnimation(animation: string, loop?: boolean, delay?: number): void

// Pause animation
widget.pause(): void

// Resume animation
widget.resume(): void

// Stop animation
widget.stop(): void

// Set animation speed
widget.setSpeed(speed: number): void
widget.setTimeScale(scale: number): void

// Get animation speed
widget.getTimeScale(): number
```

#### Skin Management

```typescript
// Set skin
widget.setSkin(skin: string): void

// Get available skins
widget.getSkins(): string[]
```

#### View Control

```typescript
// Set scale
widget.setScale(scale: number): void

// Set position
widget.setPosition(x: number, y: number): void

// Reset view
widget.resetView(): void

// Set zoom level
widget.setZoom(zoom: number): void

// Get zoom level
widget.getZoom(): number

// Set pan offset
widget.setPan(x: number, y: number): void

// Get pan offset
widget.getPan(): { x: number; y: number }
```

#### Debug Rendering

```typescript
// Draw attachment AABB highlight
widget.setHighlightAttachmentBounds('helmet_1', 0xff3366, 3): void

// Clear attachment highlight
widget.clearHighlightAttachmentBounds(): void

// Draw debug outline for one mesh attachment
widget.setDebugMeshAttachment('helmet_1', 0x00eaff, 2): void

// Clear mesh debug outline
widget.clearDebugMeshAttachment(): void
```

#### Controls

```typescript
// Show/hide control panel
widget.setShowControls(show: boolean): void

// Get control panel visibility
widget.getShowControls(): boolean
```

#### Information

```typescript
// Get available animations
widget.getAnimations(): string[]

// Get current animation
widget.getCurrentAnimation(): string | null

// Check if playing
widget.isPlaying(): boolean

// Check if paused
widget.isPaused(): boolean
```

#### Utility

```typescript
// Export to data URL
widget.toDataURL(type?: string, quality?: number): string

// Destroy widget
widget.destroy(): Promise<void>
```

## 💡 Examples

### Basic Usage

```typescript
const widget = createSpineWidget(element, {
  skeleton: 'assets/character.skel',
  atlas: 'assets/character.atlas',
  animation: 'idle',
  loop: true
});
```

### With Controls

```typescript
const widget = createSpineWidget(element, {
  skeleton: 'assets/character.skel',
  atlas: 'assets/character.atlas',
  animation: 'walk',
  showControls: true,
  controlsPosition: 'top-left',
  allowSkinChange: true
});
```

### Setup Then Loop Animation (No Controls)

```typescript
const widget = createSpineWidget(element, {
  skeleton: 'assets/character.skel',
  atlas: 'assets/character.atlas',
  animation: 'setup',
  loop: false,
  nextAnimation: 'idle',
  nextAnimationLoop: true,
  showControls: false,
});
```

Equivalent HTML auto-init:

```html
<div
  data-spinefolio
  data-skeleton="/assets/character.json"
  data-atlas="/assets/character.atlas"
  data-animation="setup"
  data-loop="false"
  data-next-animation="idle"
  data-next-animation-loop="true"
></div>
```

### Debug Visualization

```typescript
const widget = createSpineWidget(element, {
  skeleton: 'assets/character.skel',
  atlas: 'assets/character.atlas',
  animation: 'run',
  showBones: true,
  showMeshes: true,
  showBounds: true,
  debugColors: {
    bones: 0x00ff00,
    meshes: 0xff00ff,
    bounds: 0xff0000
  }
});
```

### Custom Interaction

```typescript
const widget = createSpineWidget(element, {
  skeleton: 'assets/character.skel',
  atlas: 'assets/character.atlas',
  animation: 'idle',
  enablePan: true,
  enableZoom: true,
  minZoom: 0.5,
  maxZoom: 3,
  zoomSpeed: 0.15
});

// Programmatic control
widget.setZoom(2);
widget.setPan(100, 50);
```

### Event Callbacks

```typescript
const widget = createSpineWidget(element, {
  skeleton: 'assets/character.skel',
  atlas: 'assets/character.atlas',
  animation: 'walk',
  onLoad: () => {
    console.log('Widget loaded!');
    console.log('Available animations:', widget.getAnimations());
  },
  onError: (error) => {
    console.error('Failed to load:', error);
  },
  onAnimationComplete: (animation) => {
    console.log(`Animation "${animation}" completed`);
  }
});
```

### Multiple Widgets

```typescript
const widgets = [
  createSpineWidget(document.getElementById('widget1'), {
    skeleton: 'assets/char1.skel',
    atlas: 'assets/char1.atlas',
    animation: 'idle'
  }),
  createSpineWidget(document.getElementById('widget2'), {
    skeleton: 'assets/char2.skel',
    atlas: 'assets/char2.atlas',
    animation: 'walk'
  })
];

// Control all widgets
widgets.forEach(w => w.setSpeed(1.5));
```

## 🎨 Styling

The widget includes default styles that can be customized via CSS:

```css
/* Control panel */
.spine-controls {
  background: rgba(0, 0, 0, 0.85);
  border-radius: 8px;
}

/* Control buttons */
.spine-control-button {
  background: #4CAF50;
  color: white;
}

/* Sliders */
.spine-control-slider::-webkit-slider-thumb {
  background: #4CAF50;
}
```

### Portfolio-Matched Theme (schmooky.dev)

Use the bundled `schmooky` theme for the same visual tokens as your site/blog:

```html
<link rel="stylesheet" href="./spinefolio.css">
<link rel="stylesheet" href="./themes/schmooky.css">

<div
  class="spinefolio-theme-schmooky"
  data-spinefolio
  data-skeleton="./low_1.json"
  data-atlas="./low.atlas"
  data-show-controls="true"
></div>
```

For a full article-style integration demo, open:

```bash
npm run demo:spinefolio
```

## 🔧 Advanced Configuration

### Custom Debug Colors

```typescript
const widget = createSpineWidget(element, {
  skeleton: 'assets/character.skel',
  atlas: 'assets/character.atlas',
  debugColors: {
    bones: 0x00ff00,   // Green
    meshes: 0x0000ff,  // Blue
    bounds: 0xff0000   // Red
  }
});
```

### Background Color

```typescript
const widget = createSpineWidget(element, {
  skeleton: 'assets/character.skel',
  atlas: 'assets/character.atlas',
  backgroundColor: '#1a1a2e'  // Hex color
});
```

### Premultiplied Alpha

```typescript
const widget = createSpineWidget(element, {
  skeleton: 'assets/character.skel',
  atlas: 'assets/character.atlas',
  premultipliedAlpha: true  // Default: true
});
```

## 📱 Mobile Support

The widget fully supports touch gestures:

- **Single touch** - Pan
- **Pinch** - Zoom
- **Responsive controls** - Adapts to screen size

## 🧪 Testing

Run the complete test suite:

```bash
# Open in browser
open test-complete.html
```

View the demo:

```bash
# Open in browser
open examples/complete-demo.html
```

## 🏗️ Architecture

The widget is built on:

- **PixiJS v8** - Modern WebGL rendering
- **@esotericsoftware/spine-pixi-v8** - Official Spine runtime
- **TypeScript** - Type-safe development
- **Modern ES Modules** - Tree-shakeable imports

## 🔄 Migration from v1.x

The new PixiJS v8 implementation is a complete rewrite with improved performance and features. Key changes:

### Breaking Changes

- Requires PixiJS v8 (not compatible with v7)
- Uses `@esotericsoftware/spine-pixi-v8` instead of custom runtime
- Some internal APIs have changed

### New Features

- ✨ Built-in control panel UI
- 🎯 Better TypeScript support
- ⚡ Improved performance
- 🔍 Enhanced debug rendering
- 📱 Better mobile support

### Migration Guide

```typescript
// Old (v1.x)
import { SpineWidget } from './src/core/spine-widget';
const widget = new SpineWidget(element, options);

// New (v2.x with PixiJS v8)
import { createSpineWidget } from '@spine-benchmark/spinefolio';
const widget = createSpineWidget(element, options);
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Credits

- [Spine](http://esotericsoftware.com/) by Esoteric Software
- [PixiJS](https://pixijs.com/) rendering engine
- [@esotericsoftware/spine-pixi-v8](https://www.npmjs.com/package/@esotericsoftware/spine-pixi-v8) runtime

## 📞 Support

- 📧 Email: support@spinefolio.com
- 🐛 Issues: [GitHub Issues](https://github.com/yourusername/spinefolio/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/yourusername/spinefolio/discussions)

---

Made with ❤️ by the Spinefolio team
