/**
 * Spinefolio Auto-Initialization
 * 
 * Automatically initializes Spine widgets from HTML data attributes.
 * 
 * @example
 * ```html
 * <script type="module" src="./spinefolio-auto.js"></script>
 * 
 * <div 
 *   data-spinefolio
 *   data-skeleton="./skeleton.json"
 *   data-atlas="./atlas.atlas"
 *   data-animation="idle"
 *   data-loop="true"
 * ></div>
 * ```
 */

import { PixiSpineWidget } from './pixi-spine-widget';
import { WidgetRegistry } from './widget-registry';
import { parseDataAttributes } from './attribute-parser';
import type { SpinefolioAPI } from '../types/auto-init';

/**
 * Main auto-initialization class
 */
class SpinefolioAutoInit implements SpinefolioAPI {
  private registry = new WidgetRegistry();
  private initialized = false;

  /**
   * Initialize all widgets with data-spinefolio attribute
   * 
   * Scans the DOM for elements with the `data-spinefolio` attribute
   * and initializes a widget for each one.
   */
  init(): void {
    if (this.initialized) {
      console.warn('Spinefolio already initialized. Use refresh() to re-scan the DOM.');
      return;
    }

    this.initialized = true;
    this.scanAndInitialize();
  }

  /**
   * Scan the DOM and initialize widgets
   * @private
   */
  private scanAndInitialize(): void {
    const elements = document.querySelectorAll<HTMLElement>('[data-spinefolio]');
    
    console.log(`[Spinefolio] Found ${elements.length} widget(s) to initialize`);
    
    elements.forEach((element, index) => {
      // Skip if already initialized
      if (this.registry.has(element)) {
        console.log(`[Spinefolio] Widget ${index + 1} already initialized, skipping`);
        return;
      }

      try {
        this.initializeWidget(element, index + 1);
      } catch (error) {
        this.handleInitError(element, error as Error, index + 1);
      }
    });
  }

  /**
   * Initialize a single widget
   * @private
   */
  private initializeWidget(element: HTMLElement, index: number): void {
    console.log(`[Spinefolio] Initializing widget ${index}...`);
    
    // Parse data attributes
    const options = parseDataAttributes(element);
    
    // Add error handler to display inline errors
    const originalOnError = options.onError;
    options.onError = (error: Error) => {
      console.error(`[Spinefolio] Widget ${index} error:`, error);
      this.displayInlineError(element, error.message);
      
      // Call original error handler if provided
      if (originalOnError) {
        originalOnError(error);
      }
    };
    
    // Add load handler for logging
    const originalOnLoad = options.onLoad;
    options.onLoad = () => {
      console.log(`[Spinefolio] Widget ${index} loaded successfully`);
      
      // Call original load handler if provided
      if (originalOnLoad) {
        originalOnLoad();
      }
    };
    
    // Create widget instance
    const widget = new PixiSpineWidget(element, options);
    
    // Register widget
    this.registry.register(element, widget);
  }

  /**
   * Handle initialization error
   * @private
   */
  private handleInitError(element: HTMLElement, error: Error, index: number): void {
    console.error(`[Spinefolio] Failed to initialize widget ${index}:`, error);
    this.displayInlineError(element, error.message);
  }

  /**
   * Display inline error message in the widget container
   * @private
   */
  private displayInlineError(element: HTMLElement, message: string): void {
    // Check if error message already exists
    const existingError = element.querySelector('.spinefolio-error');
    if (existingError) {
      existingError.textContent = `Error: ${message}`;
      return;
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'spinefolio-error';
    errorDiv.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 0, 0, 0.1);
      border: 2px solid rgba(255, 0, 0, 0.5);
      border-radius: 8px;
      padding: 20px;
      color: #ff0000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      max-width: 80%;
      text-align: center;
      z-index: 1000;
      box-sizing: border-box;
    `;
    errorDiv.textContent = `Error: ${message}`;
    
    // Ensure element has position context
    const computedStyle = window.getComputedStyle(element);
    if (computedStyle.position === 'static') {
      element.style.position = 'relative';
    }
    
    element.appendChild(errorDiv);
  }

  /**
   * Get widget instance for a specific element
   * 
   * @param element - The HTML element containing the widget
   * @returns The widget instance or undefined if not found
   */
  get(element: HTMLElement): PixiSpineWidget | undefined {
    return this.registry.get(element);
  }

  /**
   * Destroy a specific widget instance
   * 
   * @param element - The HTML element containing the widget
   */
  async destroy(element: HTMLElement): Promise<void> {
    const widget = this.registry.get(element);
    
    if (!widget) {
      console.warn('[Spinefolio] No widget found for element');
      return;
    }
    
    await widget.destroy();
    this.registry.unregister(element);
    
    console.log('[Spinefolio] Widget destroyed');
  }

  /**
   * Destroy all widget instances
   */
  async destroyAll(): Promise<void> {
    console.log(`[Spinefolio] Destroying ${this.registry.size} widget(s)...`);
    await this.registry.destroyAll();
    this.initialized = false;
    console.log('[Spinefolio] All widgets destroyed');
  }

  /**
   * Re-scan the DOM and initialize any new widgets
   * 
   * This will not re-initialize existing widgets.
   */
  refresh(): void {
    console.log('[Spinefolio] Refreshing widgets...');
    this.scanAndInitialize();
  }

  /**
   * Get all widget instances
   * 
   * @returns Array of all widget instances
   */
  getAll(): PixiSpineWidget[] {
    return this.registry.getAll();
  }
}

// Create singleton instance
const spinefolio = new SpinefolioAutoInit();

/**
 * Auto-initialize on DOMContentLoaded
 */
function autoInit(): void {
  if (document.readyState === 'loading') {
    // DOM is still loading, wait for DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
      spinefolio.init();
    });
  } else {
    // DOM is already loaded, initialize immediately
    spinefolio.init();
  }
}

// Run auto-initialization
autoInit();

// Export for programmatic access
export default spinefolio;
export { spinefolio as Spinefolio };

// Expose on window for IIFE builds
if (typeof window !== 'undefined') {
  window.Spinefolio = spinefolio;
}