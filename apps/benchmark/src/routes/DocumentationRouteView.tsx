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
        subtitle="Quick links to guides and references used by animators and game teams."
      />

      <section className="route-static-actions">
        <p>Resources are external links and open in a new tab.</p>
        <a className="route-static-action-chip" href={primaryLink} target="_blank" rel="noreferrer">
          Open Docs
        </a>
      </section>

      <div className="route-static-layout">
        <section className="route-static-card">
          <h3>Official resources</h3>
          <div className="route-links route-links-editorial">
            {documentationLinks.map((item) => (
              <a key={item.labelKey} href={item.href} target="_blank" rel="noreferrer">
                {t(item.labelKey)}
              </a>
            ))}
          </div>
        </section>

        <section className="route-static-card route-static-note">
          <h4>If links are unavailable</h4>
          <p>Documentation links are currently unavailable. Please try again later.</p>
        </section>
      </div>
    </div>
  );
}
