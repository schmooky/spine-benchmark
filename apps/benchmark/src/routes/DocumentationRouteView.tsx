import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { RouteHeaderCard } from '../components/RouteHeaderCard';
import { OpenGraphLinkGrid } from '../components/OpenGraphLinkGrid';

export function DocumentationRouteView() {
  const { t } = useTranslation();
  const { documentationLinks } = useWorkbench();

  const links = useMemo(() => {
    return documentationLinks.map((item) => ({
      href: item.href,
      label: t(item.labelKey),
    }));
  }, [documentationLinks, t]);

  return (
    <div className="route-workspace">
      <RouteHeaderCard
        title={t('dashboard.sections.documentation')}
        subtitle={t('documentation.subtitle')}
      />

      <div className="route-static-layout">
        <OpenGraphLinkGrid links={links} />
      </div>
    </div>
  );
}
