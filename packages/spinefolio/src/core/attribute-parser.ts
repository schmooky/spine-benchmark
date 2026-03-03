/**
 * Data attribute parser for Spine widget auto-initialization
 * 
 * Parses HTML data attributes and converts them to SpineWidgetOptions
 */

import type { SpineWidgetOptions } from '../types/spine';

/**
 * Parse boolean value from data attribute
 * @param value - String value from data attribute
 * @returns Boolean value
 */
function parseBool(value: string | null): boolean {
  if (value === null) return false;
  return value === 'true' || value === '';
}

/**
 * Parse number value from data attribute
 * @param value - String value from data attribute
 * @param defaultValue - Default value if parsing fails
 * @returns Parsed number or default
 */
function parseNumber(value: string | null, defaultValue: number): number {
  if (value === null) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse enum value from data attribute
 * @param value - String value from data attribute
 * @param allowedValues - Array of allowed values
 * @param defaultValue - Default value if invalid
 * @returns Valid enum value or default
 */
function parseEnum<T extends string>(
  value: string | null,
  allowedValues: readonly T[],
  defaultValue: T
): T {
  if (value === null) return defaultValue;
  if (allowedValues.includes(value as T)) {
    return value as T;
  }
  console.warn(`Invalid enum value "${value}", using default "${defaultValue}"`);
  return defaultValue;
}

/**
 * Parse color value from data attribute
 * @param value - String value from data attribute (e.g., "#FF0000" or "transparent")
 * @returns Color string or hex number
 */
function parseColor(value: string | null): string | undefined {
  if (value === null) return undefined;
  if (value === 'transparent') return 'transparent';
  
  // Validate hex color format
  if (value.startsWith('#') && /^#[0-9A-Fa-f]{6}$/.test(value)) {
    return value;
  }
  
  console.warn(`Invalid color value "${value}", ignoring`);
  return undefined;
}

/**
 * Parse debug color values from data attributes.
 * Supports "#RRGGBB", "0xRRGGBB" and decimal.
 */
function parseDebugColor(value: string | null): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();

  if (trimmed.startsWith('#') && /^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return parseInt(trimmed.slice(1), 16);
  }
  if (/^0x[0-9A-Fa-f]+$/.test(trimmed)) {
    return parseInt(trimmed, 16);
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) & 0xffffff;
  }

  console.warn(`Invalid debug color value "${value}", ignoring`);
  return undefined;
}


/**
 * Parse data attributes from an HTML element into SpineWidgetOptions
 * 
 * @param element - HTML element with data attributes
 * @returns Parsed SpineWidgetOptions
 * @throws Error if required attributes are missing
 * 
 * @example
 * ```html
 * <div 
 *   data-spinefolio
 *   data-skeleton="./skeleton.json"
 *   data-atlas="./atlas.atlas"
 *   data-animation="idle"
 *   data-loop="true"
 * ></div>
 * ```
 */
export function parseDataAttributes(element: HTMLElement): SpineWidgetOptions {
  // Required attributes
  const skeleton = element.getAttribute('data-skeleton');
  const atlas = element.getAttribute('data-atlas');
  
  if (!skeleton) {
    throw new Error('Missing required attribute: data-skeleton');
  }
  if (!atlas) {
    throw new Error('Missing required attribute: data-atlas');
  }
  
  // Build options object
  const options: SpineWidgetOptions = {
    skeleton,
    atlas,
  };
  
  // Optional: images (space-separated URLs)
  const images = element.getAttribute('data-images');
  if (images) {
    options.images = images;
  }
  
  // Optional: animation
  const animation = element.getAttribute('data-animation');
  if (animation) {
    options.animation = animation;
  }
  
  // Optional: skin
  const skin = element.getAttribute('data-skin');
  if (skin) {
    options.skin = skin;
  }
  
  // Optional: loop (default: true)
  const loop = element.getAttribute('data-loop');
  if (loop !== null) {
    options.loop = parseBool(loop);
  }
  
  // Optional: scale (default: 1)
  const scale = element.getAttribute('data-scale');
  if (scale !== null) {
    options.scale = parseNumber(scale, 1);
  }
  
  // Optional: position
  const x = element.getAttribute('data-x');
  if (x !== null) {
    options.x = parseNumber(x, 0);
  }
  
  const y = element.getAttribute('data-y');
  if (y !== null) {
    options.y = parseNumber(y, 0);
  }
  
  // Optional: premultiplied alpha (default: true)
  const premultipliedAlpha = element.getAttribute('data-premultiplied-alpha');
  if (premultipliedAlpha !== null) {
    options.premultipliedAlpha = parseBool(premultipliedAlpha);
  }
  
  // Optional: fit to container (default: true)
  const fitToContainer = element.getAttribute('data-fit-to-container');
  if (fitToContainer !== null) {
    options.fitToContainer = parseBool(fitToContainer);
  }
  
  // Optional: background color
  const backgroundColor = parseColor(element.getAttribute('data-background-color'));
  if (backgroundColor) {
    options.backgroundColor = backgroundColor;
  }
  
  // Optional: show controls (default: false)
  const showControls = element.getAttribute('data-show-controls');
  if (showControls !== null) {
    options.showControls = parseBool(showControls);
  }
  
  // Optional: controls position (default: 'top-left')
  const controlsPosition = element.getAttribute('data-controls-position');
  if (controlsPosition !== null) {
    options.controlsPosition = parseEnum(
      controlsPosition,
      ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const,
      'top-left'
    );
  }

  // Optional: show skin switch control in menu (default: false)
  const allowSkinChange = element.getAttribute('data-allow-skin-change');
  if (allowSkinChange !== null) {
    options.allowSkinChange = parseBool(allowSkinChange);
  }
  
  // Optional: enable pan (default: true)
  const enablePan = element.getAttribute('data-enable-pan');
  if (enablePan !== null) {
    options.enablePan = parseBool(enablePan);
  }
  
  // Optional: enable zoom (default: true)
  const enableZoom = element.getAttribute('data-enable-zoom');
  if (enableZoom !== null) {
    options.enableZoom = parseBool(enableZoom);
  }
  
  // Optional: min zoom (default: 0.25)
  const minZoom = element.getAttribute('data-min-zoom');
  if (minZoom !== null) {
    options.minZoom = parseNumber(minZoom, 0.25);
  }
  
  // Optional: max zoom (default: 4)
  const maxZoom = element.getAttribute('data-max-zoom');
  if (maxZoom !== null) {
    options.maxZoom = parseNumber(maxZoom, 4);
  }
  
  // Optional: zoom speed (default: 0.1)
  const zoomSpeed = element.getAttribute('data-zoom-speed');
  if (zoomSpeed !== null) {
    options.zoomSpeed = parseNumber(zoomSpeed, 0.1);
  }

  // Optional: attachment bounds highlight
  const highlightAttachmentBounds = element.getAttribute('data-highlight-attachment-bounds');
  if (highlightAttachmentBounds) {
    options.highlightAttachmentBounds = highlightAttachmentBounds;
  }

  const highlightAttachmentColor = parseDebugColor(element.getAttribute('data-highlight-attachment-color'));
  if (highlightAttachmentColor !== undefined) {
    options.highlightAttachmentBoundsColor = highlightAttachmentColor;
  }

  const highlightAttachmentLineWidth = element.getAttribute('data-highlight-attachment-line-width');
  if (highlightAttachmentLineWidth !== null) {
    options.highlightAttachmentBoundsLineWidth = parseNumber(highlightAttachmentLineWidth, 2);
  }

  // Optional: single mesh debug outline
  const debugMeshAttachment = element.getAttribute('data-debug-mesh-attachment');
  if (debugMeshAttachment) {
    options.debugMeshAttachment = debugMeshAttachment;
  }

  const debugMeshColor = parseDebugColor(element.getAttribute('data-debug-mesh-color'));
  if (debugMeshColor !== undefined) {
    options.debugMeshAttachmentColor = debugMeshColor;
  }

  const debugMeshLineWidth = element.getAttribute('data-debug-mesh-line-width');
  if (debugMeshLineWidth !== null) {
    options.debugMeshAttachmentLineWidth = parseNumber(debugMeshLineWidth, 2);
  }
  
  // Optional: copyright
  const copyright = element.getAttribute('data-copyright');
  if (copyright) {
    options.copyright = copyright;
  }
  
  // Optional: copyright icon
  const copyrightIcon = element.getAttribute('data-copyright-icon');
  if (copyrightIcon) {
    options.copyrightIcon = copyrightIcon;
  }
  
  // Optional: font
  const font = element.getAttribute('data-font');
  if (font) {
    options.font = font;
  }
  
  return options;
}
