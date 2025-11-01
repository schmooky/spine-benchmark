import React from 'react';
import { useTranslation } from 'react-i18next';
import { AssetHistoryEntry } from '../hooks/useAssetHistory';
import './AssetHistoryDrawer.css';

interface AssetHistoryDrawerProps {
  isOpen: boolean;
  entries: AssetHistoryEntry[];
  onClose: () => void;
  onLoadEntry: (entry: AssetHistoryEntry) => void;
  onRemoveEntry: (id: string) => void;
  onClearHistory: () => void;
}

export const AssetHistoryDrawer: React.FC<AssetHistoryDrawerProps> = ({
  isOpen,
  entries,
  onClose,
  onLoadEntry,
  onRemoveEntry,
  onClearHistory
}) => {
  const { t } = useTranslation();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return t('history.yesterday', 'Yesterday');
    } else if (diffDays < 7) {
      return t('history.daysAgo', `${diffDays} days ago`);
    } else {
      return date.toLocaleDateString();
    }
  };

  const getCIRIClass = (value: number | undefined, type: 'ci' | 'ri') => {
    if (value === undefined) return '';
    
    if (type === 'ci') {
      if (value <= 50) return 'good';
      if (value <= 100) return 'fair';
      return 'poor';
    } else {
      if (value <= 25) return 'good';
      if (value <= 50) return 'fair';
      return 'poor';
    }
  };

  const getFileTypeIcon = (entry: AssetHistoryEntry) => {
    if (entry.jsonUrl && entry.atlasUrl) {
      return '🌐';
    }
    if (entry.isReloadable) {
      return '📁';
    }
    return '📄';
  };

  const getReloadabilityStatus = (entry: AssetHistoryEntry) => {
    if (entry.source === 'url') {
      return { canReload: true, reason: null };
    }
    if (entry.isReloadable && entry.storedFiles && entry.storedFiles.length > 0) {
      return { canReload: true, reason: null };
    }
    return {
      canReload: false,
      reason: t('history.cannotReloadFiles', 'Cannot reload files from history. Please drag and drop the files again.')
    };
  };

  return (
    <>
      {isOpen && <div className="asset-history-backdrop" onClick={onClose} />}
      <div className={`asset-history-drawer ${isOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <h3 className="drawer-title">
            {/* <span className="drawer-icon">📚</span> */}
            {t('history.title', 'Asset History')}
          </h3>
          <div className="drawer-actions">
            {entries.length > 0 && (
              <button 
                className="clear-history-btn"
                onClick={onClearHistory}
                title={t('history.clearAll', 'Clear all history')}
              >
                🗑️
              </button>
            )}
            <button 
              className="close-drawer-btn"
              onClick={onClose}
              title={t('history.close', 'Close')}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="drawer-content">
          {entries.length === 0 ? (
            <div className="empty-history">
              <div className="empty-icon">📭</div>
              <p>{t('history.empty', 'No assets loaded yet')}</p>
              <small>{t('history.emptyDescription', 'Load a Spine asset to see it appear here')}</small>
            </div>
          ) : (
            <div className="history-list">
              {entries.map((entry) => {
                const reloadStatus = getReloadabilityStatus(entry);
                return (
                  <div key={entry.id} className={`history-entry ${!reloadStatus.canReload ? 'not-reloadable' : ''}`}>
                    <div
                      className="entry-main"
                      onClick={() => reloadStatus.canReload ? onLoadEntry(entry) : null}
                      style={{ cursor: reloadStatus.canReload ? 'pointer' : 'not-allowed' }}
                    >
                      <div className="entry-header">
                        <span className="entry-icon">{getFileTypeIcon(entry)}</span>
                        <span className="entry-name" title={entry.name}>
                          {entry.name}
                        </span>
                        {!reloadStatus.canReload && (
                          <span className="reload-status" title={reloadStatus.reason || ''}>
                            ⚠️
                          </span>
                        )}
                        <button
                          className="remove-entry-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveEntry(entry.id);
                          }}
                          title={t('history.remove', 'Remove from history')}
                        >
                          ✕
                        </button>
                      </div>
                    
                    <div className="entry-details">
                      <div className="entry-date">
                        {formatDate(entry.loadedAt)}
                      </div>
                      
                      {(entry.ciValue !== undefined || entry.riValue !== undefined) && (
                        <div className="entry-metrics">
                          {entry.ciValue !== undefined && (
                            <span className={`metric-value ci ${getCIRIClass(entry.ciValue, 'ci')}`}>
                              CI: {Math.round(entry.ciValue)}
                            </span>
                          )}
                          {entry.riValue !== undefined && (
                            <span className={`metric-value ri ${getCIRIClass(entry.riValue, 'ri')}`}>
                              RI: {Math.round(entry.riValue)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {entry.files && entry.files.length > 0 && (
                      <div className="entry-files">
                        {entry.files.map((file, index) => (
                          <span key={index} className="file-badge">
                            {file.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {entry.jsonUrl && entry.atlasUrl && (
                      <div className="entry-urls">
                        <div className="url-item">
                          <span className="url-label">JSON:</span>
                          <span className="url-value" title={entry.jsonUrl}>
                            {entry.jsonUrl.split('/').pop() || entry.jsonUrl}
                          </span>
                        </div>
                        <div className="url-item">
                          <span className="url-label">Atlas:</span>
                          <span className="url-value" title={entry.atlasUrl}>
                            {entry.atlasUrl.split('/').pop() || entry.atlasUrl}
                          </span>
                        </div>
                      </div>
                    )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
};