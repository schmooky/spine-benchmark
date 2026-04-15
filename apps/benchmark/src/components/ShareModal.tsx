import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Eye, EyeOff, RefreshCw, Image as ImageIcon, Package, Share2, X } from 'lucide-react';
import { generateStrongPassword } from '../utils/shareEncryption';
import './ShareModal.css';

export type ExportMode = 'gif' | 'bundle';
export type TtlOption = 1 | 3 | 7 | 30;

export interface ShareOptions {
  password: string;
  ttlDays: TtlOption;
  exportMode: ExportMode;
  savePassword: boolean;
}

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShare: (options: ShareOptions) => Promise<void>;
  hasDroppedFiles: boolean;
  isSharing: boolean;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  onShare,
  hasDroppedFiles,
  isSharing,
}) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [ttlDays, setTtlDays] = useState<TtlOption>(7);
  const [exportMode, setExportMode] = useState<ExportMode>('gif');

  const handleGeneratePassword = useCallback(() => {
    setPassword(generateStrongPassword(20));
    setShowPassword(true);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!password.trim()) return;
    await onShare({ password, ttlDays, exportMode, savePassword: false });
  }, [password, ttlDays, exportMode, onShare]);

  if (!isOpen) return null;

  const ttlLabel = (d: number) => (d === 1 ? t('share.ttl1Day') : t('share.ttlNDays', { days: d }));

  return (
    <div className="share-modal-backdrop" onClick={onClose}>
      <div className="share-modal" onClick={(e) => e.stopPropagation()}>
        <div className="share-modal-header">
          <div className="share-modal-title">
            <Share2 size={16} />
            {t('share.modalTitle')}
          </div>
          <button type="button" className="share-modal-close" onClick={onClose} aria-label={t('share.close')}>
            <X size={16} />
          </button>
        </div>

        <div className="share-modal-body">
          <div className="share-modal-desc">{t('share.description')}</div>

          <div className="share-field">
            <label className="share-label">
              <Lock size={12} />
              {t('share.passwordLabel')}
            </label>
            <div className="share-password-row">
              <input
                type={showPassword ? 'text' : 'password'}
                className="share-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('share.passwordPlaceholder')}
                autoComplete="new-password"
                spellCheck={false}
              />
              <button
                type="button"
                className="share-icon-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? t('share.hidePassword') : t('share.showPassword')}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                type="button"
                className="share-icon-btn"
                onClick={handleGeneratePassword}
                aria-label={t('share.generatePassword')}
                title={t('share.generatePassword')}
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          <div className="share-field">
            <label className="share-label">{t('share.ttlLabel')}</label>
            <div className="share-segmented">
              {[1, 3, 7, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`share-segment ${ttlDays === d ? 'active' : ''}`}
                  onClick={() => setTtlDays(d as TtlOption)}
                >
                  {ttlLabel(d)}
                </button>
              ))}
            </div>
          </div>

          <div className="share-field">
            <label className="share-label">{t('share.includeLabel')}</label>
            <div className="share-radio-grid">
              <button
                type="button"
                className={`share-radio-card ${exportMode === 'gif' ? 'active' : ''}`}
                onClick={() => setExportMode('gif')}
              >
                <ImageIcon size={18} />
                <div>
                  <div className="share-radio-title">{t('share.gifMode')}</div>
                  <div className="share-radio-sub">{t('share.gifModeDesc')}</div>
                </div>
              </button>
              <button
                type="button"
                className={`share-radio-card ${exportMode === 'bundle' ? 'active' : ''} ${!hasDroppedFiles ? 'disabled' : ''}`}
                onClick={() => hasDroppedFiles && setExportMode('bundle')}
                disabled={!hasDroppedFiles}
                title={!hasDroppedFiles ? t('share.bundleDisabledHint') : ''}
              >
                <Package size={18} />
                <div>
                  <div className="share-radio-title">{t('share.bundleMode')}</div>
                  <div className="share-radio-sub">{t('share.bundleModeDesc')}</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        <div className="share-modal-footer">
          <button type="button" className="share-btn-secondary" onClick={onClose} disabled={isSharing}>
            {t('share.cancel')}
          </button>
          <button
            type="button"
            className="share-btn-primary"
            onClick={handleSubmit}
            disabled={!password.trim() || isSharing}
          >
            {isSharing ? t('share.sharing') : t('share.submit')}
          </button>
        </div>
      </div>
    </div>
  );
};
