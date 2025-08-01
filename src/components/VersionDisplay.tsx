import React from 'react';

interface VersionDisplayProps {
  appVersion: string;
  spineVersion: string;
}

export const VersionDisplay: React.FC<VersionDisplayProps> = ({ 
  appVersion, 
  spineVersion 
}) => {
  return (
    <div className="version-display">
      <div className="version-line">v{appVersion}</div>
      <div className="version-line">Spine {spineVersion}</div>
    </div>
  );
};