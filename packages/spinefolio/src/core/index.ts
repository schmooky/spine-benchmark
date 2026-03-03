/**
 * Spinefolio - Main entry point
 * PixiJS v8 + spine-pixi-v8 implementation
 *
 * Copyright (c) 2024 Spinefolio
 * Licensed under MIT License
 */

// Import core styles
import './styles/core.css';

import { PixiSpineWidget } from './pixi-spine-widget';
import type { SpineWidgetOptions, SpineWidgetInstance } from '../types/spine';

// Store all active instances
const instances = new Map<HTMLElement, SpineWidgetInstance>();

function parseDebugColor(value?: string): number | undefined {
  if (!value) return undefined;

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

  return undefined;
}

function parsePositiveNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function parseControlsPosition(
  value?: string
): SpineWidgetOptions['controlsPosition'] | undefined {
  if (!value) return undefined;

  switch (value) {
    case 'top-left':
    case 'top-right':
    case 'bottom-left':
    case 'bottom-right':
      return value;
    default:
      return undefined;
  }
}

/**
 * Factory function to create a Spine widget instance
 * @param element - The HTML element to attach the widget to
 * @param options - Configuration options for the widget
 * @returns A new PixiSpineWidget instance
 */
export function createSpineWidget(
  element: HTMLElement,
  options: SpineWidgetOptions
): PixiSpineWidget {
  return new PixiSpineWidget(element, options);
}

/**
 * Initialize a Spine widget on an element
 */
export function create(
  element: HTMLElement | string,
  options?: Partial<SpineWidgetOptions>
): SpineWidgetInstance | null {
  const el = typeof element === 'string' ? document.querySelector<HTMLElement>(element) : element;
  
  if (!el) {
    console.error('Spinefolio: Element not found');
    return null;
  }

  // Destroy existing instance if any
  const existing = instances.get(el);
  if (existing) {
    existing.destroy();
    instances.delete(el);
  }

  // Get options from data attributes if not provided
  const finalOptions: SpineWidgetOptions = {
    skeleton: options?.skeleton || el.dataset.skeleton || '',
    atlas: options?.atlas || el.dataset.atlas || '',
    images: options?.images || el.dataset.images,
    animation: options?.animation || el.dataset.animation,
    skin: options?.skin || el.dataset.skin,
    loop: options?.loop ?? el.dataset.loop !== 'false',
    scale: options?.scale ?? parseFloat(el.dataset.scale || '1'),
    x: options?.x ?? parseFloat(el.dataset.x || '0'),
    y: options?.y ?? parseFloat(el.dataset.y || '0'),
    premultipliedAlpha: options?.premultipliedAlpha ?? el.dataset.pma !== 'false',
    fitToContainer: options?.fitToContainer ?? el.dataset.fit !== 'false',
    backgroundColor: options?.backgroundColor || el.dataset.bg || 'transparent',
    // Advanced features
    showControls: options?.showControls ?? el.dataset.showControls === 'true',
    controlsPosition:
      options?.controlsPosition ?? parseControlsPosition(el.dataset.controlsPosition),
    allowSkinChange: options?.allowSkinChange ?? el.dataset.allowSkinChange === 'true',
    enablePan: options?.enablePan ?? el.dataset.enablePan !== 'false',
    enableZoom: options?.enableZoom ?? el.dataset.enableZoom !== 'false',
    minZoom: options?.minZoom ?? parseFloat(el.dataset.minZoom || '0.25'),
    maxZoom: options?.maxZoom ?? parseFloat(el.dataset.maxZoom || '4'),
    highlightAttachmentBounds:
      options?.highlightAttachmentBounds ?? el.dataset.highlightAttachmentBounds,
    highlightAttachmentBoundsColor:
      options?.highlightAttachmentBoundsColor ?? parseDebugColor(el.dataset.highlightAttachmentColor),
    highlightAttachmentBoundsLineWidth:
      options?.highlightAttachmentBoundsLineWidth ?? parsePositiveNumber(el.dataset.highlightAttachmentLineWidth),
    debugMeshAttachment:
      options?.debugMeshAttachment ?? el.dataset.debugMeshAttachment,
    debugMeshAttachmentColor:
      options?.debugMeshAttachmentColor ?? parseDebugColor(el.dataset.debugMeshColor),
    debugMeshAttachmentLineWidth:
      options?.debugMeshAttachmentLineWidth ?? parsePositiveNumber(el.dataset.debugMeshLineWidth),
    // Copyright
    copyright: options?.copyright || el.dataset.copyright,
    copyrightIcon: options?.copyrightIcon || el.dataset.copyrightIcon,
    // Theming
    font: options?.font || el.dataset.font,
    // Callbacks
    onLoad: options?.onLoad,
    onError: options?.onError,
    onAnimationComplete: options?.onAnimationComplete,
  };

  if (!finalOptions.skeleton || !finalOptions.atlas) {
    console.error('Spinefolio: skeleton and atlas are required');
    return null;
  }

  try {
    const widget = new PixiSpineWidget(el, finalOptions);
    instances.set(el, widget);
    return widget;
  } catch (error) {
    console.error('Spinefolio: Failed to create widget', error);
    return null;
  }
}

/**
 * Get widget instance for an element
 */
export function get(element: HTMLElement | string): SpineWidgetInstance | null {
  const el = typeof element === 'string' ? document.querySelector<HTMLElement>(element) : element;
  if (!el) return null;
  return instances.get(el) || null;
}

/**
 * Destroy widget instance
 */
export function destroy(element: HTMLElement | string): void {
  const el = typeof element === 'string' ? document.querySelector<HTMLElement>(element) : element;
  if (!el) return;

  const instance = instances.get(el);
  if (instance) {
    instance.destroy();
    instances.delete(el);
  }
}

/**
 * Destroy all widget instances
 */
export function destroyAll(): void {
  instances.forEach((instance) => instance.destroy());
  instances.clear();
}

/**
 * Auto-initialize all elements with [data-spinefolio] attribute
 * Each widget is initialized independently so one failure doesn't affect others
 */
export function autoInit(): void {
  const elements = document.querySelectorAll<HTMLElement>('[data-spinefolio]');
  elements.forEach((el) => {
    try {
      create(el);
    } catch (error) {
      console.error('Spinefolio: Failed to auto-init widget', el, error);
      // Continue with other widgets even if one fails
    }
  });
}

/**
 * Initialize on DOM ready if auto-init is enabled
 */
function init(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Check for auto-init flag
      const script = document.querySelector('script[data-spinefolio-auto]');
      if (script || document.querySelector('[data-spinefolio]')) {
        autoInit();
      }
    });
  } else {
    // DOM already loaded
    const script = document.querySelector('script[data-spinefolio-auto]');
    if (script || document.querySelector('[data-spinefolio]')) {
      autoInit();
    }
  }
}

// Run init
init();

// Export everything
export { PixiSpineWidget };
export type { SpineWidgetOptions, SpineWidgetInstance };

// Default export for IIFE global
export default {
  create,
  createSpineWidget,
  get,
  destroy,
  destroyAll,
  autoInit,
  PixiSpineWidget,
};
