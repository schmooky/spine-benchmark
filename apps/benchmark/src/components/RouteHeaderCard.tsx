import React from 'react';
import { useTranslation } from 'react-i18next';

interface RouteHeaderCardProps {
  title: string;
  subtitle: string;
  version?: string;
}

export function RouteHeaderCard({ title, subtitle, version = 'v1.2.0' }: RouteHeaderCardProps) {
  const { t, i18n } = useTranslation();
  const languageLabel = t(`dashboard.languages.${i18n.language}`, { defaultValue: i18n.language.toUpperCase() });

  return (
    <header className="route-header-card">
      <div className="route-header-copy">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <div className="route-header-actions" aria-label="Route utilities">
        <span className="route-header-chip">
          {languageLabel}
        </span>
        <span className="route-header-chip route-header-chip-kbd">
          ⌘K
        </span>
        <span className="route-header-chip route-header-chip-version">
          {version}
        </span>
      </div>
    </header>
  );
}
