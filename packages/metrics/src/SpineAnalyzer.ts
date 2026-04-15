import { Physics, Spine } from "@esotericsoftware/spine-pixi-v8";
import {
  type SpineAnalysisResult,
  analyzeSkeleton,
  analyzeGlobalData,
  analyzeAnimations,
  calculateStatistics,
  aggregateResults
} from "@spine-benchmark/metrics-pipeline";
import { exportAnalysisJson } from "@spine-benchmark/metrics-reporting";

/**
 * Main SpineAnalyzer class that analyzes Spine instances and returns comprehensive data
 */
export class SpineAnalyzer {
  /**
   * Analyzes a Spine instance and returns a comprehensive data object.
   *
   * The analysis pipeline below contains MULTIPLE sub-analyzers
   * (animationSampler, blendModeAnalyzer, clippingAnalyzer, ...) and
   * almost all of them mutate the live skeleton: they clear tracks, set
   * a target animation, advance time, sample, and try to "restore" - but
   * the restore logic in several of them only fires if there was a real
   * animation playing before sampling started, which on a fresh-load
   * benchmark drop is never true. After the pipeline runs, the skeleton
   * is left frozen at whatever the last sub-analyzer's last frame
   * happened to produce. For most skeletons that arbitrary state happens
   * to look fine; for skeletons whose last analyzed animation moves
   * bones far from origin (e.g. a "win" effect that flies particles
   * offscreen), the visible slots end up at world coordinates the
   * camera will never look at. Symptom: spine loads cleanly, no errors,
   * but nothing is on screen.
   *
   * Wrap the entire pipeline in a try/finally that always resets the
   * skeleton to its setup pose afterwards. This is the load-bearing
   * invariant: `SpineAnalyzer.analyze(spine)` MUST leave `spine` in the
   * same observable state it received it (modulo immutable bookkeeping).
   * Sub-analyzers below this point can mutate freely without poisoning
   * the live viewer's render state.
   *
   * @param spineInstance The Spine instance to analyze
   * @returns Complete analysis data
   */
  static analyze(spineInstance: Spine): SpineAnalysisResult {
    try {
      // Analyze skeleton structure (common for all animations)
      const skeletonData = analyzeSkeleton(spineInstance);

      // Analyze global data
      const globalData = analyzeGlobalData(spineInstance);

      // Analyze each animation individually
      const animationData = analyzeAnimations(spineInstance);

      // Calculate statistics
      const statistics = calculateStatistics(animationData);

      // Aggregate all results
      return aggregateResults(
        spineInstance,
        skeletonData,
        globalData,
        animationData,
        statistics
      );
    } finally {
      // Reset to setup pose so the live viewer renders cleanly. This is
      // the LAST thing that touches the skeleton in the analysis path,
      // so anything the sub-analyzers did is overwritten here. The
      // viewer's auto-play tick will then start from a known-good state.
      const skeleton = spineInstance.skeleton;
      const state = spineInstance.state;
      if (skeleton && state) {
        try {
          state.clearTracks();
          skeleton.setToSetupPose();
          skeleton.updateWorldTransform(Physics.update);
        } catch {
          // best-effort: if reset itself throws, the skeleton is in an
          // unknown state but we don't want to mask the underlying error
          // from the analysis pipeline.
        }
      }
    }
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
