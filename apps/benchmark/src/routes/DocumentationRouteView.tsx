import React from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkbench } from '../workbench/WorkbenchContext';

export function DocumentationRouteView() {
  const { t } = useTranslation();
  const { documentationLinks } = useWorkbench();

  return (
    <section className="route-section">
      <div className="route-section-header">
        <h3>{t('dashboard.sections.documentation')}</h3>
      </div>
      <div className="route-links">
        {documentationLinks.map((item) => (
          <a key={item.labelKey} href={item.href} target="_blank" rel="noreferrer">
            {t(item.labelKey)}
          </a>
        ))}
      </div>
    </section>
  );
}
