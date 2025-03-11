import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from './Icons';
import { IconButton } from './IconButton';
import { BenchmarkData } from '../hooks/useSpineApp';

interface InfoPanelProps {
  data: BenchmarkData;
  onClose: () => void;
}

export const InfoPanel: React.FC<InfoPanelProps> = ({ data, onClose }) => {
  const [activeTab, setActiveTab] = useState('summary');
  
  // Create a container for the portal if it doesn't exist
  const container = document.getElementById('info-panel-container') || (() => {
    const div = document.createElement('div');
    div.id = 'info-panel-container';
    document.body.appendChild(div);
    return div;
  })();
  
  const tabs = [
    { id: 'summary', label: 'Summary' },
    { id: 'meshAnalysis', label: 'Mesh Analysis' },
    { id: 'clippingAnalysis', label: 'Clipping' },
    { id: 'blendModeAnalysis', label: 'Blend Modes' },
    { id: 'skeletonTree', label: 'Skeleton Tree' },
  ];
  
  const renderTabContent = () => {
    switch (activeTab) {
      case 'summary':
        return (
          <div className="tab-content">
            <h3>Benchmark Summary</h3>
            <div dangerouslySetInnerHTML={{ __html: data.summary || '<p>No summary data available</p>' }} />
          </div>
        );
      case 'meshAnalysis':
        return (
          <div className="tab-content">
            <h3>Mesh Analysis</h3>
            <div dangerouslySetInnerHTML={{ __html: data.meshAnalysis || '<p>No mesh analysis data available</p>' }} />
          </div>
        );
      case 'clippingAnalysis':
        return (
          <div className="tab-content">
            <h3>Clipping Analysis</h3>
            <div dangerouslySetInnerHTML={{ __html: data.clippingAnalysis || '<p>No clipping analysis data available</p>' }} />
          </div>
        );
      case 'blendModeAnalysis':
        return (
          <div className="tab-content">
            <h3>Blend Mode Analysis</h3>
            <div dangerouslySetInnerHTML={{ __html: data.blendModeAnalysis || '<p>No blend mode analysis data available</p>' }} />
          </div>
        );
      case 'skeletonTree':
        return (
          <div className="tab-content">
            <h3>Skeleton Tree</h3>
            <div dangerouslySetInnerHTML={{ __html: data.skeletonTree || '<p>No skeleton tree data available</p>' }} />
          </div>
        );
      default:
        return <div>Select a tab to view benchmark information</div>;
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
              onClick={() => setActiveTab(tab.id)}
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