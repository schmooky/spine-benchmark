import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './AssetHistoryButton.css';

interface AssetHistoryButtonProps {
  onClick: () => void;
  hasHistory: boolean;
}

export const AssetHistoryButton: React.FC<AssetHistoryButtonProps> = ({
  onClick,
  hasHistory
}) => {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      className={`asset-history-button ${hasHistory ? 'has-history' : ''} ${isHovered ? 'hovered' : ''}`}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={t('history.openHistory', 'Open asset history')}
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
        📚
      </div>
      {/* <div className="button-slider">
        <span className="button-text">
          {t('history.buttonText', 'History')}
        </span>
      </div> */}
    </div>
  );
};