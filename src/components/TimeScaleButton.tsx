import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './TimeScaleButton.css';

interface TimeScaleButtonProps {
  onClick: () => void;
  currentTimeScale: number;
}

export const TimeScaleButton: React.FC<TimeScaleButtonProps> = ({
  onClick,
  currentTimeScale
}) => {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);

  const getTimeScaleDisplay = (scale: number): string => {
    return `${scale}x`;
  };

  const isNonStandardScale = () => {
    const standardScales = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
    return !standardScales.includes(currentTimeScale);
  };

  return (
    <div 
      className={`time-scale-button ${isNonStandardScale() ? 'non-standard' : ''} ${isHovered ? 'hovered' : ''}`}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={t('timeScale.openTimeScale', 'Open time scale control')}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="button-icon">
        ⏱️
      </div>
      <div className="button-slider">
        <span className="button-text">
          {getTimeScaleDisplay(currentTimeScale)}
        </span>
      </div>
    </div>
  );
};