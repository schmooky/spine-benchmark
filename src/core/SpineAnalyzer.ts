import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { BenchmarkData } from "../hooks/useSpineApp";
import { analyzeMeshes } from "./analyzers/meshAnalyzer";
import { analyzeClipping } from "./analyzers/clippingAnalyzer";
import { analyzeBlendModes } from "./analyzers/blendModeAnalyzer";
import { createSkeletonTree } from "./analyzers/skeletonAnalyzer";
import { analyzePhysics } from "./analyzers/physicsAnalyzer";
import { PERFORMANCE_FACTORS } from "./constants/performanceFactors";
import { calculateOverallScore } from "./utils/scoreCalculator";
import { generateSummary } from "./generators/summaryGenerator";

/**
 * Main SpineAnalyzer class that coordinates analysis of Spine instances
 */
export class SpineAnalyzer {
  /**
   * Analyzes a Spine instance and returns comprehensive benchmark data
   * @param spineInstance The Spine instance to analyze
   * @returns Benchmark data with HTML and metrics for each component
   */
  static analyze(spineInstance: Spine): BenchmarkData {
    // Analyze all components
    const meshAnalysisResults = analyzeMeshes(spineInstance);
    const clippingAnalysisResults = analyzeClipping(spineInstance);
    const blendModeAnalysisResults = analyzeBlendModes(spineInstance);
    const skeletonAnalysisResults = createSkeletonTree(spineInstance);
    const physicsAnalysisResults = analyzePhysics(spineInstance);
    
    // Extract HTML output and metrics
    const { html: meshAnalysis, metrics: meshMetrics } = meshAnalysisResults;
    const { html: clippingAnalysis, metrics: clippingMetrics } = clippingAnalysisResults;
    const { html: blendModeAnalysis, metrics: blendModeMetrics } = blendModeAnalysisResults;
    const { html: skeletonTree, metrics: boneMetrics } = skeletonAnalysisResults;
    const { html: physicsAnalysis, metrics: constraintMetrics } = physicsAnalysisResults;
    
    // Calculate overall performance score
    const componentScores = {
      boneScore: boneMetrics.score,
      meshScore: meshMetrics.score,
      clippingScore: clippingMetrics.score,
      blendModeScore: blendModeMetrics.score,
      constraintScore: constraintMetrics.score
    };
    
    const overallScore = calculateOverallScore(componentScores);
    
    // Generate summary with overall score
    const summary = generateSummary(
      spineInstance,
      boneMetrics,
      meshMetrics,
      clippingMetrics,
      blendModeMetrics,
      constraintMetrics,
      overallScore
    );
    
    // Return all analysis data
    return {
      meshAnalysis,
      clippingAnalysis,
      blendModeAnalysis,
      skeletonTree,
      physicsAnalysis,
      summary
    };
  }
}