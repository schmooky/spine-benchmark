import React from 'react';
import { useTranslation } from 'react-i18next';

interface VersionDisplayProps {
  appVersion: string;
  spineVersion: string;
}

export const VersionDisplay: React.FC<VersionDisplayProps> = ({ 
  appVersion, 
  spineVersion 
}) => {
  const { t } = useTranslation();

  return (
    <div className="version-display">
      <div className="version-line">{t('ui.version.app', { version: appVersion })}</div>
      <div className="version-line">{t('ui.version.spine', { version: spineVersion })}</div>
    </div>
  );
};
