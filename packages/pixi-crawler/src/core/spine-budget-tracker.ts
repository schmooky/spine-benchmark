/**
 * SpineBudgetTracker - Tracks spine budget history over time
 * Maintains a ring buffer of recent budget measurements per spine skeleton.
 */

import type {
    SpineBudget,
    SpineBudgetHistory,
    AggregateBudget,
    ImpactLevel,
} from './types.js';

/**
 * Tracks budget history for multiple spine skeletons.
 */
export class SpineBudgetTracker {
    private histories = new Map<string, SpineBudgetHistory>();
    private readonly maxHistorySize: number;

    constructor(maxHistorySize = 60) {
        this.maxHistorySize = maxHistorySize;
    }

    /**
     * Record a budget measurement for a spine skeleton.
     */
    recordBudget(skeletonName: string, budget: SpineBudget): void {
        let history = this.histories.get(skeletonName);

        if (!history) {
            history = {
                skeletonName,
                history: [],
                maxSize: this.maxHistorySize,
            };
            this.histories.set(skeletonName, history);
        }

        // Add to ring buffer
        history.history.push(budget);

        // Trim if exceeds max size
        if (history.history.length > this.maxHistorySize) {
            history.history.shift();
        }
    }

    /**
     * Get budget history for a specific skeleton.
     */
    getHistory(skeletonName: string): SpineBudgetHistory | undefined {
        return this.histories.get(skeletonName);
    }

    /**
     * Get all tracked skeleton names.
     */
    getSkeletonNames(): string[] {
        return Array.from(this.histories.keys());
    }

    /**
     * Calculate aggregate budget across all visible spines.
     */
    calculateAggregate(visibleSpines: { skeletonName: string; budget: SpineBudget }[]): AggregateBudget {
        if (visibleSpines.length === 0) {
            return {
                totalRI: 0,
                totalCI: 0,
                total: 0,
                spineCount: 0,
                avgRI: 0,
                avgCI: 0,
                level: 'minimal',
            };
        }

        let totalRI = 0;
        let totalCI = 0;

        for (const { budget } of visibleSpines) {
            totalRI += budget.ri.total;
            totalCI += budget.ci.total;
        }

        const total = totalRI + totalCI;
        const spineCount = visibleSpines.length;
        const avgRI = totalRI / spineCount;
        const avgCI = totalCI / spineCount;

        return {
            totalRI,
            totalCI,
            total,
            spineCount,
            avgRI,
            avgCI,
            level: this.classifyImpactLevel(total),
        };
    }

    /**
     * Calculate average budget for a skeleton over its history.
     */
    calculateAverage(skeletonName: string): SpineBudget | null {
        const history = this.histories.get(skeletonName);
        if (!history || history.history.length === 0) {
            return null;
        }

        let totalRI = 0;
        let totalCI = 0;
        let totalBudget = 0;

        for (const budget of history.history) {
            totalRI += budget.ri.total;
            totalCI += budget.ci.total;
            totalBudget += budget.total;
        }

        const count = history.history.length;
        const avgRI = totalRI / count;
        const avgCI = totalCI / count;
        const avgTotal = totalBudget / count;

        return {
            ri: {
                blendModes: 0,
                clippingMasks: 0,
                vertices: 0,
                total: avgRI,
                level: this.classifyImpactLevel(avgRI),
            },
            ci: {
                physics: 0,
                path: 0,
                ik: 0,
                weightedMeshes: 0,
                transform: 0,
                deformedMeshes: 0,
                total: avgCI,
                level: this.classifyImpactLevel(avgCI),
            },
            total: avgTotal,
            level: this.classifyImpactLevel(avgTotal),
        };
    }

    /**
     * Clear all history.
     */
    clear(): void {
        this.histories.clear();
    }

    /**
     * Clear history for a specific skeleton.
     */
    clearSkeleton(skeletonName: string): void {
        this.histories.delete(skeletonName);
    }

    /**
     * Classify impact level based on score thresholds.
     */
    private classifyImpactLevel(score: number): ImpactLevel {
        if (score >= 100) return 'very-high';
        if (score >= 50) return 'high';
        if (score >= 25) return 'moderate';
        if (score >= 10) return 'low';
        return 'minimal';
    }
}
