import React from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkbench } from '../workbench/WorkbenchContext';

export function PartnersRouteView() {
  const { t } = useTranslation();
  const { partnerTools } = useWorkbench();

  return (
    <section className="route-section" data-tour="partner-links">
      <div className="route-section-header">
        <h3>{t('dashboard.sections.partners')}</h3>
      </div>
      <div className="route-links">
        {partnerTools.map((item) => (
          <a key={item.labelKey} href={item.href} target="_blank" rel="noreferrer">
            {t(item.labelKey)}
          </a>
        ))}
      </div>
    </section>
  );
}
