/**
 * Widget registry for managing Spine widget instances
 * 
 * Maintains a mapping between HTML elements and their widget instances
 */

import type { PixiSpineWidget } from './pixi-spine-widget';

/**
 * Registry for managing widget instances
 * 
 * @example
 * ```typescript
 * const registry = new WidgetRegistry();
 * registry.register(element, widget);
 * const widget = registry.get(element);
 * registry.unregister(element);
 * ```
 */
export class WidgetRegistry {
  private widgets = new Map<HTMLElement, PixiSpineWidget>();

  /**
   * Register a widget instance for an element
   * 
   * @param element - The HTML element
   * @param widget - The widget instance
   */
  register(element: HTMLElement, widget: PixiSpineWidget): void {
    this.widgets.set(element, widget);
  }

  /**
   * Get widget instance for an element
   * 
   * @param element - The HTML element
   * @returns The widget instance or undefined if not found
   */
  get(element: HTMLElement): PixiSpineWidget | undefined {
    return this.widgets.get(element);
  }

  /**
   * Unregister a widget instance
   * 
   * @param element - The HTML element
   * @returns True if the widget was found and removed
   */
  unregister(element: HTMLElement): boolean {
    return this.widgets.delete(element);
  }

  /**
   * Get all registered widget instances
   * 
   * @returns Array of all widget instances
   */
  getAll(): PixiSpineWidget[] {
    return Array.from(this.widgets.values());
  }

  /**
   * Destroy all registered widgets and clear the registry
   */
  async destroyAll(): Promise<void> {
    const destroyPromises: Promise<void>[] = [];
    
    for (const widget of this.widgets.values()) {
      destroyPromises.push(widget.destroy());
    }
    
    await Promise.all(destroyPromises);
    this.widgets.clear();
  }

  /**
   * Check if an element has a registered widget
   * 
   * @param element - The HTML element
   * @returns True if the element has a registered widget
   */
  has(element: HTMLElement): boolean {
    return this.widgets.has(element);
  }

  /**
   * Get the number of registered widgets
   * 
   * @returns Number of registered widgets
   */
  get size(): number {
    return this.widgets.size;
  }
}