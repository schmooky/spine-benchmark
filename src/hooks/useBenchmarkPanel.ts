import { useEffect, useState, useCallback } from 'react';
import { SpineAnalysisResult, AnimationAnalysis } from '../core/SpineAnalyzer';
import { getImpactFromCost, ImpactResult } from '../core/utils/scoreCalculator';

function worstRenderingImpact(animations: AnimationAnalysis[]): ImpactResult {
  return animations.reduce((worst, a) => {
    const cost = (a.blendModeMetrics.activeNonNormalCount * 3) + (a.clippingMetrics.activeMaskCount * 5) + (a.meshMetrics.totalVertices / 200);
    return cost > worst.cost ? getImpactFromCost(cost) : worst;
  }, getImpactFromCost(0));
}

function worstComputationalImpact(animations: AnimationAnalysis[]): ImpactResult {
  return animations.reduce((worst, a) => {
    const cost = (a.constraintMetrics.activePhysicsCount * 4) + (a.constraintMetrics.activeIkCount * 2) + (a.constraintMetrics.activeTransformCount * 1.5) + (a.constraintMetrics.activePathCount * 2.5) + (a.meshMetrics.deformedMeshCount * 1.5) + (a.meshMetrics.weightedMeshCount * 2);
    return cost > worst.cost ? getImpactFromCost(cost) : worst;
  }, getImpactFromCost(0));
}

export interface UseBenchmarkPanelResult {
  isVisible: boolean;
  shouldPulsate: boolean;
  rendering: ImpactResult | null;
  computational: ImpactResult | null;
  handleClick: () => void;
}

export const useBenchmarkPanel = (
  benchmarkData: SpineAnalysisResult | null,
  showBenchmark: boolean,
  setShowBenchmark: (show: boolean) => void
): UseBenchmarkPanelResult => {
  const [isVisible, setIsVisible] = useState(false);
  const [pulsateCount, setPulsateCount] = useState(0);
  const [rendering, setRendering] = useState<ImpactResult | null>(null);
  const [computational, setComputational] = useState<ImpactResult | null>(null);

  useEffect(() => {
    const shouldShowPanel = benchmarkData !== null && !showBenchmark;
    setIsVisible(shouldShowPanel);
    if (shouldShowPanel) {
      setPulsateCount(0);
    }
  }, [benchmarkData, showBenchmark]);

  useEffect(() => {
    if (!isVisible || pulsateCount >= 2) return;
    const timer = setTimeout(() => {
      setPulsateCount(prev => prev + 1);
    }, 500);
    return () => clearTimeout(timer);
  }, [isVisible, pulsateCount]);

  useEffect(() => {
    if (benchmarkData && benchmarkData.animations.length > 0) {
      setRendering(worstRenderingImpact(benchmarkData.animations));
      setComputational(worstComputationalImpact(benchmarkData.animations));
    } else {
      setRendering(null);
      setComputational(null);
    }
  }, [benchmarkData]);

  const handleClick = useCallback(() => {
    setShowBenchmark(true);
  }, [setShowBenchmark]);

  return {
    isVisible,
    shouldPulsate: isVisible && pulsateCount < 2,
    rendering,
    computational,
    handleClick
  };
};
