import { useEffect, useState, useCallback } from 'react';
import { SpineAnalysisResult } from '../core/SpineAnalyzer';
import { SpinePerformanceAnalysisResult } from '../core/SpinePerformanceAnalyzer';
import { PERFORMANCE_CONFIG } from '../core/config/performanceConfig';

export interface UseBenchmarkPanelResult {
  isVisible: boolean;
  shouldPulsate: boolean;
  computationImpact: number | null;
  renderingImpact: number | null;
  ciClass: string;
  riClass: string;
  handleClick: () => void;
}

export const useBenchmarkPanel = (
  benchmarkData: SpineAnalysisResult | null,
  performanceData: SpinePerformanceAnalysisResult | null,
  showBenchmark: boolean,
  setShowBenchmark: (show: boolean) => void
): UseBenchmarkPanelResult => {
  const [isVisible, setIsVisible] = useState(false);
  const [pulsateCount, setPulsateCount] = useState(0);
  const [computationImpact, setComputationImpact] = useState<number | null>(null);
  const [renderingImpact, setRenderingImpact] = useState<number | null>(null);
  const [ciClass, setCiClass] = useState('');
  const [riClass, setRiClass] = useState('');

  // Determine if panel should be visible
  useEffect(() => {
    const shouldShowPanel = benchmarkData !== null && !showBenchmark;
    setIsVisible(shouldShowPanel);
    
    // Reset pulsation when visibility changes
    if (shouldShowPanel) {
      setPulsateCount(0);
    }
  }, [benchmarkData, showBenchmark]);

  // Handle pulsation animation - exactly twice
  useEffect(() => {
    if (!isVisible || pulsateCount >= 2) {
      return;
    }

    const timer = setTimeout(() => {
      setPulsateCount(prev => prev + 1);
    }, 500); // Match animation duration

    return () => clearTimeout(timer);
  }, [isVisible, pulsateCount]);

  // Calculate CI and RI separately when performanceData changes
  useEffect(() => {
    if (performanceData) {
      const ci = performanceData.globalMetrics.computationImpact;
      const ri = performanceData.globalMetrics.renderingImpact;
      
      setComputationImpact(ci);
      setRenderingImpact(ri);
      
      // Determine CI class (CPU impact - lower is better)
      // Uses centralized thresholds from PERFORMANCE_CONFIG
      if (ci <= PERFORMANCE_CONFIG.ciThresholds.low) {
        setCiClass('good'); // Green - low CPU impact
      } else if (ci <= PERFORMANCE_CONFIG.ciThresholds.moderate) {
        setCiClass('fair'); // Yellow - moderate CPU impact
      } else {
        setCiClass('poor'); // Red - high CPU impact
      }
      
      // Determine RI class (GPU impact - lower is better)
      // Uses centralized thresholds from PERFORMANCE_CONFIG
      if (ri <= PERFORMANCE_CONFIG.riThresholds.low) {
        setRiClass('good'); // Green - low GPU impact
      } else if (ri <= PERFORMANCE_CONFIG.riThresholds.moderate) {
        setRiClass('fair'); // Yellow - moderate GPU impact
      } else {
        setRiClass('poor'); // Red - high GPU impact
      }
    } else {
      setComputationImpact(null);
      setRenderingImpact(null);
      setCiClass('');
      setRiClass('');
    }
  }, [performanceData]);

  const handleClick = useCallback(() => {
    setShowBenchmark(true);
  }, [setShowBenchmark]);

  return {
    isVisible,
    shouldPulsate: isVisible && pulsateCount < 2,
    computationImpact,
    renderingImpact,
    ciClass,
    riClass,
    handleClick
  };
};