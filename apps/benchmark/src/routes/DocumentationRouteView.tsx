import React from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { RouteHeaderCard } from '../components/RouteHeaderCard';

export function DocumentationRouteView() {
  const { t } = useTranslation();
  const { documentationLinks } = useWorkbench();
  const primaryLink = documentationLinks[0]?.href ?? 'https://github.com/schmooky/spine-benchmark/blob/main/README.md';

  return (
    <div className="route-workspace">
      <RouteHeaderCard
        title={t('dashboard.sections.documentation')}
        subtitle={t('documentation.subtitle')}
      />

      <section className="route-static-actions">
        <p>{t('documentation.actions.externalHint')}</p>
        <a className="route-static-action-chip" href={primaryLink} target="_blank" rel="noreferrer">
          {t('documentation.actions.openDocs')}
        </a>
      </section>

      <div className="route-static-layout">
        <section className="route-static-card">
          <h3>{t('documentation.cards.officialResources')}</h3>
          <div className="route-links route-links-editorial">
            {documentationLinks.map((item) => (
              <a key={item.labelKey} href={item.href} target="_blank" rel="noreferrer">
                {t(item.labelKey)}
              </a>
            ))}
          </div>
        </section>

        <section className="route-static-card route-static-note">
          <h4>{t('documentation.cards.unavailableTitle')}</h4>
          <p>{t('documentation.cards.unavailableDescription')}</p>
        </section>
      </div>
    </div>
  );
}
