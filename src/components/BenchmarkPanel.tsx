import React, { useEffect, useState } from 'react';
import { useBenchmarkPanel } from '../hooks/useBenchmarkPanel';
import { SpineAnalysisResult } from '../core/SpineAnalyzer';
import { SpinePerformanceAnalysisResult } from '../core/SpinePerformanceAnalyzer';
import './BenchmarkPanel.css';

interface BenchmarkPanelProps {
  benchmarkData: SpineAnalysisResult | null;
  performanceData: SpinePerformanceAnalysisResult | null;
  showBenchmark: boolean;
  setShowBenchmark: (show: boolean) => void;
}

export const BenchmarkPanel: React.FC<BenchmarkPanelProps> = ({
  benchmarkData,
  performanceData,
  showBenchmark,
  setShowBenchmark
}) => {
  const {
    isVisible,
    shouldPulsate,
    computationImpact,
    renderingImpact,
    ciClass,
    riClass,
    handleClick
  } = useBenchmarkPanel(benchmarkData, performanceData, showBenchmark, setShowBenchmark);

  const [isAnimating, setIsAnimating] = useState(false);

  // Handle pulsation animation trigger
  useEffect(() => {
    if (shouldPulsate) {
      setIsAnimating(true);
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 500); // Match animation duration
      
      return () => clearTimeout(timer);
    }
  }, [shouldPulsate]);

  if (!isVisible || computationImpact === null || renderingImpact === null) {
    return null;
  }

  const getImpactLabel = () => {
    const ci = Math.round(computationImpact);
    const ri = Math.round(renderingImpact);
    const total = ci + ri;
    
    let level = 'High';
    if (total <= 50) level = 'Low';
    else if (total <= 150) level = 'Moderate';
    
    return `Performance Impact: ${ci} CPU / ${ri} GPU (${level})`;
  };

  return (
    <div
      className={`benchmark-panel ${isAnimating ? 'pulsate' : ''}`}
      onClick={handleClick}
      role="button"
      aria-label={getImpactLabel()}
      title={getImpactLabel()}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="benchmark-impact-display">
        <div className={`impact-value ci ${ciClass}`}>
          {Math.round(computationImpact)}
        </div>
        <div className="impact-separator">/</div>
        <div className={`impact-value ri ${riClass}`}>
          {Math.round(renderingImpact)}
        </div>
      </div>
    </div>
  );
};