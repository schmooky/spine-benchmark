import React from 'react';
import { useTranslation } from 'react-i18next';
import { StoredAsset } from '../core/storage/assetStore';

interface PhysicsBakerPanelProps {
  asset: StoredAsset | null;
}

export const PhysicsBakerPanel: React.FC<PhysicsBakerPanelProps> = ({ asset }) => {
  const { t } = useTranslation();

  return (
    <section className="tool-panel">
      <h2>{t('physicsBaker.title')}</h2>
      <p className="tool-subtitle">{t('physicsBaker.subtitle')}</p>

      <div className="optimizer-card">
        <p>
          <strong>{t('physicsBaker.labels.asset')}</strong> {asset ? asset.name : t('physicsBaker.values.noneSelected')}
        </p>
        <p>{t('physicsBaker.comingSoon')}</p>
        <button type="button" className="primary-btn" disabled>
          {t('physicsBaker.actions.bake')}
        </button>
      </div>
    </section>
  );
};
