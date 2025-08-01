import React from 'react';
import { useTranslation } from 'react-i18next';
import { ModernSelect } from './ModernSelect';

const languages = [
  { code: 'en', name: 'English' },
  { code: 'ru', name: 'Русский' },
  { code: 'zh', name: '繁體中文' },
  { code: 'uk', name: 'Українська' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt', name: 'Português (Brasil)' },
  { code: 'es', name: 'Español' },
];

export const LanguageSelector: React.FC = () => {
  const { i18n, t } = useTranslation();

  const handleLanguageChange = (languageCode: string) => {
    i18n.changeLanguage(languageCode);
  };

  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  return (
    <div className="language-selector">
      <ModernSelect
        value={currentLanguage.code}
        onChange={handleLanguageChange}
        options={languages.map(lang => ({
          value: lang.code,
          label: lang.name
        }))}
        placeholder={t('language.selector')}
      />
    </div>
  );
};