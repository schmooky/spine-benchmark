import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { XMarkIcon } from './Icons';
import { IconButton } from './IconButton';
import { SpineAnalysisResult } from '../core/SpineAnalyzer';
import { useUrlHash } from '../hooks/useUrlHash';

// Import analysis components
import { Summary } from './analysis/Summary';
import { MeshAnalysis } from './analysis/MeshAnalysis';
import { ClippingAnalysis } from './analysis/ClippingAnalysis';
import { BlendModeAnalysis } from './analysis/BlendModeAnalysis';
import { PhysicsAnalysis } from './analysis/PhysicsAnalysis';
import { SkeletonTree } from './analysis/SkeletonTree';
import { PerformanceSummary } from './analysis/PerformanceSummary';

interface InfoPanelProps {
  data: SpineAnalysisResult;
  performanceData?: any; // Optional performance data
  onClose: () => void;
}

export const InfoPanel: React.FC<InfoPanelProps> = ({ data, performanceData, onClose }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(performanceData ? 'performance' : 'summary');
  const { updateHash, getStateFromHash } = useUrlHash();
  
  // Check initial hash state for active tab
  useEffect(() => {
    const hashState = getStateFromHash();
    if (hashState.benchmarkTab) {
      setActiveTab(hashState.benchmarkTab);
    }
  }, [getStateFromHash]);

  // Update hash when active tab changes
  useEffect(() => {
    updateHash({ benchmarkInfo: true, benchmarkTab: activeTab });
  }, [activeTab, updateHash]);

  // Create a container for the portal if it doesn't exist
  const container = document.getElementById('info-panel-container') || (() => {
    const div = document.createElement('div');
    div.id = 'info-panel-container';
    document.body.appendChild(div);
    return div;
  })();
  
  const tabs = [
    ...(performanceData ? [{ id: 'performance', label: t('infoPanel.tabs.performance', 'Performance Impact') }] : []),
    { id: 'summary', label: t('infoPanel.tabs.summary') },
    { id: 'meshAnalysis', label: t('infoPanel.tabs.meshAnalysis') },
    { id: 'clippingAnalysis', label: t('infoPanel.tabs.clipping') },
    { id: 'blendModeAnalysis', label: t('infoPanel.tabs.blendModes') },
    { id: 'physicsAnalysis', label: t('infoPanel.tabs.physicsAnalysis') },
    { id: 'skeletonTree', label: t('infoPanel.tabs.skeletonTree') }
  ];
  
  const renderTabContent = () => {
    switch (activeTab) {
      case 'summary':
        return <Summary data={data} />;
      case 'meshAnalysis':
        return <MeshAnalysis data={data} />;
      case 'clippingAnalysis':
        return <ClippingAnalysis data={data} />;
      case 'blendModeAnalysis':
        return <BlendModeAnalysis data={data} />;
      case 'physicsAnalysis':
        return <PhysicsAnalysis data={data} />;
      case 'skeletonTree':
        return <SkeletonTree data={data} />;
      case 'performance':
        return performanceData ? <PerformanceSummary data={performanceData} /> : null;
      default:
        return <div>{t('infoPanel.content.selectTab')}</div>;
    }
  };
  
  return createPortal(
    <div className="info-panel-backdrop">
      <div className="info-panel">
        <div className="info-panel-header">
          <h2>{t('infoPanel.title')}</h2>
          <IconButton
            icon={<XMarkIcon />}
            onClick={onClose}
            tooltip={t('infoPanel.close')}
          />
        </div>
        
        <div className="info-panel-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(tab.id);
                updateHash({ benchmarkInfo: true, benchmarkTab: tab.id });
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        <div className="info-panel-content">
          <div className="tab-content">
            {renderTabContent()}
          </div>
        </div>
      </div>
    </div>,
    container
  );
};