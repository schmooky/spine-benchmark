import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './TimeScalePanel.css';

interface TimeScalePanelProps {
  isOpen: boolean;
  currentTimeScale: number;
  onTimeScaleChange: (scale: number) => void;
  onClose: () => void;
}

const TIME_SCALE_OPTIONS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

export const TimeScalePanel: React.FC<TimeScalePanelProps> = ({
  isOpen,
  currentTimeScale,
  onTimeScaleChange,
  onClose
}) => {
  const { t } = useTranslation();
  const [selectedScale, setSelectedScale] = useState(currentTimeScale);

  useEffect(() => {
    setSelectedScale(currentTimeScale);
  }, [currentTimeScale]);

  const handleScaleChange = (scale: number) => {
    setSelectedScale(scale);
    onTimeScaleChange(scale);
  };

  const getScaleLabel = (scale: number): string => {
    if (scale === 1.0) return 'Normal';
    if (scale < 1.0) return 'Slow';
    return 'Fast';
  };

  const getScaleDescription = (scale: number): string => {
    if (scale === 0.25) return 'Quarter Speed';
    if (scale === 0.5) return 'Half Speed';
    if (scale === 0.75) return 'Three Quarters Speed';
    if (scale === 1.0) return 'Normal Speed';
    if (scale === 1.25) return 'One and Quarter Speed';
    if (scale === 1.5) return 'One and Half Speed';
    if (scale === 1.75) return 'One and Three Quarters Speed';
    if (scale === 2.0) return 'Double Speed';
    return `${scale}x Speed`;
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="time-scale-panel-backdrop" onClick={onClose} />
      <div className="time-scale-panel">
        <div className="time-scale-header">
          <h3 className="time-scale-title">
            {t('timeScale.title', 'Animation Speed Control')}
          </h3>
          <button 
            className="time-scale-close-button" 
            onClick={onClose}
            aria-label={t('timeScale.close', 'Close')}
          >
            ✕
          </button>
        </div>
        
        <div className="time-scale-content">
          <div className="time-scale-current">
            <div className="current-scale-display">
              <span className="current-scale-value">{selectedScale}x</span>
              <span className="current-scale-label">{getScaleLabel(selectedScale)}</span>
            </div>
            <div className="current-scale-description">
              {getScaleDescription(selectedScale)}
            </div>
          </div>
          
          <div className="time-scale-options">
            {TIME_SCALE_OPTIONS.map((scale) => (
              <button
                key={scale}
                className={`time-scale-option ${selectedScale === scale ? 'active' : ''}`}
                onClick={() => handleScaleChange(scale)}
              >
                <div className="option-value">{scale}x</div>
                <div className="option-label">{getScaleLabel(scale)}</div>
              </button>
            ))}
          </div>
          
          <div className="time-scale-slider-container">
            <label className="slider-label">
              {t('timeScale.fineControl', 'Fine Control')}
            </label>
            <input
              type="range"
              min="0.1"
              max="3.0"
              step="0.05"
              value={selectedScale}
              onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
              className="time-scale-slider"
            />
            <div className="slider-marks">
              <span>0.1x</span>
              <span>1.0x</span>
              <span>3.0x</span>
            </div>
          </div>
          
          <div className="time-scale-actions">
            <button 
              className="reset-button"
              onClick={() => handleScaleChange(1.0)}
            >
              {t('timeScale.reset', 'Reset to Normal')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};