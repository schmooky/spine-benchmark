import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCommandPalette } from '../hooks/useCommandPalette';
import { Command, CommandCategory } from '../utils/commandRegistry';
import './CommandPalette.css';

interface CommandItemProps {
  command: Command;
  isSelected: boolean;
  onClick: () => void;
}

const CommandItem: React.FC<CommandItemProps> = ({ command, isSelected, onClick }) => {
  return (
    <div
      className={`command-item ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      role="option"
      aria-selected={isSelected}
    >
      <div className="command-content">
        <div className="command-title">{command.title}</div>
        {command.description && (
          <div className="command-description">{command.description}</div>
        )}
      </div>
      {command.category && (
        <div className="command-category">{command.category}</div>
      )}
    </div>
  );
};

interface CommandCategoryProps {
  category: CommandCategory;
  selectedIndex: number;
  flatCommandsBeforeCategory: number;
  onCommandClick: (commandId: string) => void;
}

const CommandCategorySection: React.FC<CommandCategoryProps> = ({
  category,
  selectedIndex,
  flatCommandsBeforeCategory,
  onCommandClick
}) => {
  return (
    <div className="command-category-section">
      <div className="command-category-header">{category.title}</div>
      <div className="command-category-items">
        {category.commands.map((command, index) => {
          const globalIndex = flatCommandsBeforeCategory + index;
          return (
            <CommandItem
              key={command.id}
              command={command}
              isSelected={selectedIndex === globalIndex}
              onClick={() => onCommandClick(command.id)}
            />
          );
        })}
      </div>
    </div>
  );
};

export const CommandPalette: React.FC = () => {
  const { t } = useTranslation();
  const {
    isOpen,
    query,
    selectedIndex,
    groupedCommands,
    totalCommands,
    closePalette,
    setQuery,
    executeCommand
  } = useCommandPalette();

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when palette opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    const selectedElement = document.querySelector('.command-item.selected');
    if (selectedElement) {
      selectedElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [selectedIndex]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleCommandClick = (commandId: string) => {
    executeCommand(commandId);
  };

  // Calculate flat command indices for proper selection highlighting
  let flatCommandsCount = 0;
  const categoriesWithIndices = groupedCommands.map(category => {
    const startIndex = flatCommandsCount;
    flatCommandsCount += category.commands.length;
    return { category, startIndex };
  });

  if (!isOpen) {
    return null;
  }

  return (
      <div className="command-palette-backdrop" onClick={closePalette}>
          <div className="command-palette-content" onClick={(e) => e.stopPropagation()}>
            <div className="command-palette-header">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={handleInputChange}
                placeholder={t('commandPalette.placeholder')}
                className="command-palette-input"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            
            <div className="command-palette-body">
              {totalCommands === 0 ? (
                <div className="command-palette-empty">
                  <div className="empty-message">{t('commandPalette.noCommands')}</div>
                  <div className="empty-hint">{t('commandPalette.tryDifferent')}</div>
                </div>
              ) : (
                <div className="command-palette-results" role="listbox">
                  {categoriesWithIndices.map(({ category, startIndex }) => (
                    <CommandCategorySection
                      key={category.id}
                      category={category}
                      selectedIndex={selectedIndex}
                      flatCommandsBeforeCategory={startIndex}
                      onCommandClick={handleCommandClick}
                    />
                  ))}
                </div>
              )}
            </div>
            
            <div className="command-palette-footer">
              <div className="command-palette-shortcuts">
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