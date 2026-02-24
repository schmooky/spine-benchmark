import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import en from './locales/en.json';
import ru from './locales/ru.json';
import zh from './locales/zh.json';
import uk from './locales/uk.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import pt from './locales/pt.json';
import es from './locales/es.json';

const resources = {
  en: { translation: en },
  ru: { translation: ru },
  zh: { translation: zh },
  uk: { translation: uk },
  fr: { translation: fr },
  de: { translation: de },
  pt: { translation: pt },
  es: { translation: es },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: false,
    
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'spine-benchmark-language',
    },
  });

export default i18n;