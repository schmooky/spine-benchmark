import { Spine } from "@esotericsoftware/spine-pixi-v8";
import {
  type SpineAnalysisResult,
  analyzeSkeleton,
  analyzeGlobalData,
  analyzeAnimations,
  calculateStatistics,
  sortAnalyses,
  aggregateResults
} from "@spine-benchmark/metrics-pipeline";
import { exportAnalysisJson } from "@spine-benchmark/metrics-reporting";

/**
 * Main SpineAnalyzer class that analyzes Spine instances and returns comprehensive data
 */
export class SpineAnalyzer {
  /**
   * Analyzes a Spine instance and returns a comprehensive data object
   * @param spineInstance The Spine instance to analyze
   * @returns Complete analysis data
   */
  static analyze(spineInstance: Spine): SpineAnalysisResult {
    // Analyze skeleton structure (common for all animations)
    const skeletonData = analyzeSkeleton(spineInstance);

    // Analyze global data
    const globalData = analyzeGlobalData(spineInstance);

    // Analyze each animation individually
    const animationData = analyzeAnimations(spineInstance);

    // Calculate statistics
    const statistics = calculateStatistics(animationData);

    // Sort animations and calculate median score
    const sortedData = sortAnalyses(animationData);

    // Aggregate all results
    return aggregateResults(
      spineInstance,
      skeletonData,
      globalData,
      animationData,
      statistics,
      sortedData
    );
  }

  /**
   * Exports analysis data as JSON
   * @param analysisResult The analysis result to export
   * @returns JSON-serializable analysis data
   */
  static exportJSON(analysisResult: SpineAnalysisResult): object {
    return exportAnalysisJson(analysisResult);
  }
}
