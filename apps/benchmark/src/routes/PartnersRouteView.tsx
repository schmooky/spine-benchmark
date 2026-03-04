import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { RouteHeaderCard } from '../components/RouteHeaderCard';
import { OpenGraphLinkGrid } from '../components/OpenGraphLinkGrid';

export function PartnersRouteView() {
  const { t } = useTranslation();
  const { partnerTools } = useWorkbench();

  const links = useMemo(() => {
    return [
      ...partnerTools.map((item) => ({
        href: item.href,
        label: t(item.labelKey),
      })),
      {
        href: 'https://pixijs.com/',
        label: t('partners.links.pixi'),
      },
    ];
  }, [partnerTools, t]);

  return (
    <div className="route-workspace" data-tour="partner-links">
      <RouteHeaderCard
        title={t('dashboard.sections.partners')}
        subtitle={t('partners.subtitle')}
      />

      <div className="route-static-layout">
        <OpenGraphLinkGrid links={links} />
      </div>
    </div>
  );
}
