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

  useEffect(() => {
    const shouldShowPanel = benchmarkData !== null && !showBenchmark;
    setIsVisible(shouldShowPanel);
    
    if (shouldShowPanel) {
      setPulsateCount(0);
    }
  }, [benchmarkData, showBenchmark]);

  useEffect(() => {
    if (!isVisible || pulsateCount >= 2) {
      return;
    }

    const timer = setTimeout(() => {
      setPulsateCount(prev => prev + 1);
    }, 500);

    return () => clearTimeout(timer);
  }, [isVisible, pulsateCount]);

  useEffect(() => {
    if (performanceData) {
      const ci = performanceData.globalMetrics.computationImpact;
      const ri = performanceData.globalMetrics.renderingImpact;
      
      setComputationImpact(ci);
      setRenderingImpact(ri);
      
      if (ci <= PERFORMANCE_CONFIG.ciThresholds.low) {
        setCiClass('good');
      } else if (ci <= PERFORMANCE_CONFIG.ciThresholds.moderate) {
        setCiClass('fair');
      } else {
        setCiClass('poor');
      }
      
      if (ri <= PERFORMANCE_CONFIG.riThresholds.low) {
        setRiClass('good');
      } else if (ri <= PERFORMANCE_CONFIG.riThresholds.moderate) {
        setRiClass('fair');
      } else {
        setRiClass('poor');
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