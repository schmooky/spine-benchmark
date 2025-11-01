/**
 * Performance weights - Now sourced from centralized configuration
 *
 * @deprecated Direct modification of this object is deprecated.
 * Use PERFORMANCE_CONFIG in src/core/config/performanceConfig.ts instead.
 *
 * This file now acts as a compatibility layer, importing values from the
 * centralized configuration. All weight adjustments should be made in
 * performanceConfig.ts for consistency across the application.
 */

import { getPerformanceWeights } from '../config/performanceConfig';

/**
 * Performance weights object
 * Values are dynamically loaded from PERFORMANCE_CONFIG
 */
export const PERFORMANCE_WEIGHTS = getPerformanceWeights();