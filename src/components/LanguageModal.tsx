import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import './LanguageModal.css';

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

interface LanguageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LanguageModal: React.FC<LanguageModalProps> = ({ isOpen, onClose }) => {
  const { i18n, t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);
  const firstLanguageRef = useRef<HTMLButtonElement>(null);

  console.log('🌐 LanguageModal render:', { isOpen, currentLanguage: i18n.language });

  useEffect(() => {
    if (isOpen && firstLanguageRef.current) {
      console.log('🎯 Focusing first language option');
      firstLanguageRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const languageButtons = modalRef.current?.querySelectorAll('.language-option') as NodeListOf<HTMLButtonElement>;
        if (!languageButtons.length) return;

        const currentIndex = Array.from(languageButtons).findIndex(button => button === document.activeElement);
        let nextIndex: number;

        if (event.key === 'ArrowDown') {
          nextIndex = currentIndex < languageButtons.length - 1 ? currentIndex + 1 : 0;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : languageButtons.length - 1;
        }

        languageButtons[nextIndex].focus();
      }

      if (event.key === 'Enter' || event.key === ' ') {
        const activeElement = document.activeElement as HTMLButtonElement;
        if (activeElement?.classList.contains('language-option')) {
          event.preventDefault();
          activeElement.click();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleLanguageChange = (languageCode: string) => {
    console.log('🔄 Language change requested:', { from: i18n.language, to: languageCode });
    i18n.changeLanguage(languageCode);
    console.log('✅ Language changed, closing modal');
    onClose();
  };

  const handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      console.log('🖱️ Modal backdrop clicked - closing modal');
      onClose();
    }
  };

  if (!isOpen) {
    console.log('🚫 Modal not open - returning null');
    return null;
  }

  console.log('🎨 Rendering language modal with languages:', languages.map(l => l.code));

  return (
    <div className="language-modal-backdrop" onClick={handleBackdropClick}>
      <div className="language-modal-content" ref={modalRef}>
        <div className="language-modal-header">
          <h2 className="language-modal-title">{t('language.modal.title', 'Select Language')}</h2>
          <button 
            className="language-modal-close" 
            onClick={onClose}
            aria-label={t('ui.close')}
          >
            ×
          </button>
        </div>
        <div className="language-modal-body">
          <div className="language-options">
            {languages.map((language, index) => (
              <button
                key={language.code}
                ref={index === 0 ? firstLanguageRef : undefined}
                className={`language-option ${i18n.language === language.code ? 'current' : ''}`}
                onClick={() => handleLanguageChange(language.code)}
                aria-label={t('commands.language.switchTo', { 0: language.name })}
              >
                <span className="language-name">{language.name}</span>
                {i18n.language === language.code && (
                  <span className="language-current-indicator">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="language-modal-footer">
          <div className="language-modal-shortcuts">
            <span className="shortcut">
              <kbd>↑</kbd><kbd>↓</kbd> {t('commandPalette.shortcuts.navigate')}
            </span>
            <span className="shortcut">
              <kbd>Enter</kbd> {t('commandPalette.shortcuts.select')}
            </span>
            <span className="shortcut">
              <kbd>Esc</kbd> {t('commandPalette.shortcuts.close')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};