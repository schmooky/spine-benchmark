/**
 * Test setup and configuration
 */

// Mock browser APIs for Node.js test environment
global.fetch = async (url: string) => {
  const fs = require('fs');
  const path = require('path');
  
  // Convert URL to file path
  const filePath = url.replace('./', '');
  const fullPath = path.join(process.cwd(), filePath);
  
  const content = fs.readFileSync(fullPath, 'utf-8');
  
  return {
    json: async () => JSON.parse(content),
    text: async () => content,
    ok: true,
    status: 200
  };
};

// Mock canvas for PixiJS
if (typeof HTMLCanvasElement === 'undefined') {
  global.HTMLCanvasElement = class HTMLCanvasElement {
    getContext() {
      return {
        fillRect: () => {},
        clearRect: () => {},
        getImageData: () => ({ data: [] }),
        putImageData: () => {},
        createImageData: () => [],
        setTransform: () => {},
        drawImage: () => {},
        save: () => {},
        fillText: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        stroke: () => {},
        translate: () => {},
        scale: () => {},
        rotate: () => {},
        arc: () => {},
        fill: () => {},
        measureText: () => ({ width: 0 }),
        transform: () => {},
        rect: () => {},
        clip: () => {}
      };
    }
    toDataURL() {
      return '';
    }
  } as any;
}

// Mock WebGL context
if (typeof WebGLRenderingContext === 'undefined') {
  global.WebGLRenderingContext = class WebGLRenderingContext {} as any;
}

export {};