/**
 * Type definitions for the auto-initialization system
 */

import type { PixiSpineWidget } from '../core/pixi-spine-widget';

/**
 * Public API exposed by the auto-initialization system
 */
export interface SpinefolioAPI {
  /**
   * Initialize all widgets with data-spinefolio attribute
   */
  init(): void;

  /**
   * Get widget instance for a specific element
   * @param element - The HTML element containing the widget
   */
  get(element: HTMLElement): PixiSpineWidget | undefined;

  /**
   * Destroy a specific widget instance
   * @param element - The HTML element containing the widget
   */
  destroy(element: HTMLElement): void;

  /**
   * Destroy all widget instances
   */
  destroyAll(): void;

  /**
   * Re-scan the DOM and initialize any new widgets
   */
  refresh(): void;

  /**
   * Get all widget instances
   */
  getAll(): PixiSpineWidget[];
}

/**
 * Global window interface extension
 */
declare global {
  interface Window {
    Spinefolio?: SpinefolioAPI;
  }
}