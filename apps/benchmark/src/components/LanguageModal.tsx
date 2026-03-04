import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import './LanguageModal.css';
import { tIndexed } from '../utils/indexedMessage';
import { XMarkIcon } from './Icons';

const languages = [
  { code: 'en', labelKey: 'dashboard.languages.en' },
  { code: 'ru', labelKey: 'dashboard.languages.ru' },
];

interface LanguageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LanguageModal: React.FC<LanguageModalProps> = ({ isOpen, onClose }) => {
  const { i18n, t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);
  const firstLanguageRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen && firstLanguageRef.current) {
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
    i18n.changeLanguage(languageCode);
    onClose();
  };

  const handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="language-modal-backdrop" onClick={handleBackdropClick}>
      <div className="language-modal-content" ref={modalRef}>
        <div className="language-modal-header">
          <h2 className="language-modal-title">{t('language.modal.title')}</h2>
          <button 
            className="language-modal-close" 
            onClick={onClose}
            aria-label={t('ui.close')}
          >
            <XMarkIcon size={16} />
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
                aria-label={tIndexed(t, 'commands.language.switchTo', [t(language.labelKey)])}
              >
                <span className="language-name">{t(language.labelKey)}</span>
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
              <kbd>{t('ui.keys.enter')}</kbd> {t('commandPalette.shortcuts.select')}
            </span>
            <span className="shortcut">
              <kbd>{t('ui.keys.escape')}</kbd> {t('commandPalette.shortcuts.close')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
