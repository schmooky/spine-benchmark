import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBenchmarkPanel } from '../hooks/useBenchmarkPanel';
import { SpineAnalysisResult } from '../core/SpineAnalyzer';
import { getImpactBadgeClass } from '../core/utils/scoreCalculator';
import './BenchmarkPanel.css';

interface BenchmarkPanelProps {
  benchmarkData: SpineAnalysisResult | null;
  showBenchmark: boolean;
  setShowBenchmark: (show: boolean) => void;
}

export const BenchmarkPanel: React.FC<BenchmarkPanelProps> = ({
  benchmarkData,
  showBenchmark,
  setShowBenchmark
}) => {
  const { t } = useTranslation();
  const {
    isVisible,
    shouldPulsate,
    rendering,
    computational,
    handleClick
  } = useBenchmarkPanel(benchmarkData, showBenchmark, setShowBenchmark);

  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (shouldPulsate) {
      setIsAnimating(true);
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [shouldPulsate]);

  if (!isVisible || !rendering || !computational) {
    return null;
  }

  return (
    <div
      className={`benchmark-panel ${isAnimating ? 'pulsate' : ''}`}
      onClick={handleClick}
      role="button"
      aria-label="Open benchmark information"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="benchmark-impact-row">
        <span className="benchmark-impact-label">RI</span>
        <span className="benchmark-impact-value" style={{ color: rendering.color }}>
          {Math.round(rendering.cost)}
        </span>
      </div>
      <div className="benchmark-impact-row">
        <span className="benchmark-impact-label">CI</span>
        <span className="benchmark-impact-value" style={{ color: computational.color }}>
          {Math.round(computational.cost)}
        </span>
      </div>
    </div>
  );
};
