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
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (shouldPulsate) {
      setIsAnimating(true);
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [shouldPulsate]);

  if (!isVisible || computationImpact === null || renderingImpact === null) {
    return null;
  }

  const ci = Math.round(computationImpact);
  const ri = Math.round(renderingImpact);
  const total = ci + ri;
  
  const getCIDescription = () => {
    if (ci <= 30) return 'Excellent CPU';
    if (ci <= 100) return 'Moderate CPU';
    return 'High CPU Load';
  };
  
  const getRIDescription = () => {
    if (ri <= 20) return 'Excellent GPU';
    if (ri <= 50) return 'Moderate GPU';
    return 'High GPU Load';
  };
  
  const getTotalDescription = () => {
    if (total <= 50) return 'Low Impact';
    if (total <= 150) return 'Moderate Impact';
    return 'High Impact';
  };

  return (
    <div
      className={`benchmark-panel ${isAnimating ? 'pulsate' : ''} ${isHovered ? 'expanded' : ''}`}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="button"
      aria-label={`Performance Impact: ${ci} CPU / ${ri} GPU (${getTotalDescription()})`}
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
          {ci}
        </div>
        <div className="impact-separator">/</div>
        <div className={`impact-value ri ${riClass}`}>
          {ri}
        </div>
      </div>
      
      {isHovered && (
        <div className="impact-tooltip">
          <div className="tooltip-row">
            <span className={`tooltip-label ci ${ciClass}`}>CPU:</span>
            <span className="tooltip-value">{ci}</span>
            <span className="tooltip-desc">{getCIDescription()}</span>
          </div>
          <div className="tooltip-row">
            <span className={`tooltip-label ri ${riClass}`}>GPU:</span>
            <span className="tooltip-value">{ri}</span>
            <span className="tooltip-desc">{getRIDescription()}</span>
          </div>
          <div className="tooltip-divider"></div>
          <div className="tooltip-row total">
            <span className="tooltip-label">Total:</span>
            <span className="tooltip-value">{total}</span>
            <span className="tooltip-desc">{getTotalDescription()}</span>
          </div>
        </div>
      )}
    </div>
  );
};