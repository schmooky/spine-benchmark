import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { XMarkIcon } from './Icons';
import { IconButton } from './IconButton';
import { BenchmarkData } from '../hooks/useSpineApp';
import { useUrlHash } from '../hooks/useUrlHash';

interface InfoPanelProps {
  data: BenchmarkData;
  onClose: () => void;
}

export const InfoPanel: React.FC<InfoPanelProps> = ({ data, onClose }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('summary');
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
    { id: 'summary', label: t('infoPanel.tabs.summary') },
    { id: 'meshAnalysis', label: t('infoPanel.tabs.meshAnalysis') },
    { id: 'clippingAnalysis', label: t('infoPanel.tabs.clipping') },
    { id: 'blendModeAnalysis', label: t('infoPanel.tabs.blendModes') },
    { id: 'skeletonTree', label: t('infoPanel.tabs.skeletonTree') },
  ];
  
  const renderTabContent = () => {
    switch (activeTab) {
      case 'summary':
        return (
          <div className="tab-content">
            <div dangerouslySetInnerHTML={{ __html: data.summary || `<p>${t('infoPanel.content.noData', { 0: 'summary' })}</p>` }} />
          </div>
        );
      case 'meshAnalysis':
        return (
          <div className="tab-content">
            <div dangerouslySetInnerHTML={{ __html: data.meshAnalysis || `<p>${t('infoPanel.content.noData', { 0: 'mesh analysis' })}</p>` }} />
          </div>
        );
      case 'clippingAnalysis':
        return (
          <div className="tab-content">
            <div dangerouslySetInnerHTML={{ __html: data.clippingAnalysis || `<p>${t('infoPanel.content.noData', { 0: 'clipping analysis' })}</p>` }} />
          </div>
        );
      case 'blendModeAnalysis':
        return (
          <div className="tab-content">
            <div dangerouslySetInnerHTML={{ __html: data.blendModeAnalysis || `<p>${t('infoPanel.content.noData', { 0: 'blend mode analysis' })}</p>` }} />
          </div>
        );
      case 'skeletonTree':
        return (
          <div className="tab-content">
            <div dangerouslySetInnerHTML={{ __html: data.skeletonTree || `<p>${t('infoPanel.content.noData', { 0: 'skeleton tree' })}</p>` }} />
          </div>
        );
      default:
        return <div>{t('infoPanel.content.selectTab')}</div>;
    }
  };
  
  return createPortal(
    <div className="info-panel-backdrop">
      <div className="info-panel">
        <div className="info-panel-header">
          <h2>Spine Benchmark Analysis</h2>
          <IconButton 
            icon={<XMarkIcon />} 
            onClick={onClose}
            tooltip="Close"
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
          {renderTabContent()}
        </div>
      </div>
    </div>,
    container
  );
};