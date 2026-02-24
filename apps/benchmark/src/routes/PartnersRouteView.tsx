import React from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { RouteHeaderCard } from '../components/RouteHeaderCard';

export function PartnersRouteView() {
  const { t } = useTranslation();
  const { partnerTools } = useWorkbench();
  const primaryLink = partnerTools[0]?.href ?? 'https://esotericsoftware.com/spine-editor';

  return (
    <div className="route-workspace" data-tour="partner-links">
      <RouteHeaderCard
        title={t('dashboard.sections.partners')}
        subtitle="Trusted tools and ecosystems that help Spine teams ship faster."
      />

      <section className="route-static-actions">
        <p>Partner links open in a new tab.</p>
        <a className="route-static-action-chip" href={primaryLink} target="_blank" rel="noreferrer">
          View Partners
        </a>
      </section>

      <div className="route-static-layout">
        <section className="route-static-card">
          <h3>Ecosystem links</h3>
          <div className="route-links route-links-editorial">
            {partnerTools.map((item) => (
              <a key={item.labelKey} href={item.href} target="_blank" rel="noreferrer">
                {t(item.labelKey)}
              </a>
            ))}
            <a href="https://pixijs.com/" target="_blank" rel="noreferrer">
              PixiJS
            </a>
          </div>
        </section>

        <section className="route-static-card route-static-note">
          <h4>If partner config is unavailable</h4>
          <p>Partner links are currently unavailable. Please check back soon.</p>
        </section>
      </div>
    </div>
  );
}
