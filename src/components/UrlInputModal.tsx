import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface UrlInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (jsonUrl: string, atlasUrl: string) => void;
}

export const UrlInputModal: React.FC<UrlInputModalProps> = ({ isOpen, onClose, onLoad }) => {
  const [jsonUrl, setJsonUrl] = useState('');
  const [atlasUrl, setAtlasUrl] = useState('');
  const { t } = useTranslation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (jsonUrl && atlasUrl) {
      onLoad(jsonUrl, atlasUrl);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>{t('ui.loadFromUrl')}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="json-url">{t('ui.urlModal.jsonLabel')}</label>
            <input
              id="json-url"
              type="url"
              value={jsonUrl}
              onChange={(e) => setJsonUrl(e.target.value)}
              placeholder={t('ui.urlModal.jsonPlaceholder')}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="atlas-url">{t('ui.urlModal.atlasLabel')}</label>
            <input
              id="atlas-url"
              type="url"
              value={atlasUrl}
              onChange={(e) => setAtlasUrl(e.target.value)}
              placeholder={t('ui.urlModal.atlasPlaceholder')}
              required
            />
          </div>
          <div className="form-actions">
            <button type="button" onClick={onClose}>
              {t('ui.cancel')}
            </button>
            <button type="submit">{t('ui.load')}</button>
          </div>
        </form>
      </div>
    </div>
  );
};
