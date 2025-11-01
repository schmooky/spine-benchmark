import { useState, useCallback, useEffect } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';
import { commandRegistry, Command, CommandCategory } from '../utils/commandRegistry';
import { useUrlHash } from './useUrlHash';

interface UseCommandPaletteReturn {
  isOpen: boolean;
  query: string;
  selectedIndex: number;
  groupedCommands: CommandCategory[];
  totalCommands: number;
  openPalette: () => void;
  closePalette: () => void;
  setQuery: (query: string) => void;
  selectNext: () => void;
  selectPrevious: () => void;
  executeSelected: () => void;
  executeCommand: (commandId: string) => void;
}

export function useCommandPalette(): UseCommandPaletteReturn {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { updateHash, getStateFromHash, onHashChange } = useUrlHash();

  useEffect(() => {
    commandRegistry.loadRecentCommands();
    
    const hashState = getStateFromHash();
    if (hashState.commandPalette) {
      setIsOpen(true);
    }
  }, [getStateFromHash]);

  useEffect(() => {
    const cleanup = onHashChange((hashState) => {
      setIsOpen(hashState.commandPalette);
      if (!hashState.commandPalette) {
        setQuery('');
        setSelectedIndex(0);
      }
    });
    
    return cleanup;
  }, [onHashChange]);

  const openPalette = useCallback(() => {
    console.log('🎯 Opening command palette');
    setIsOpen(true);
    setQuery('');
    setSelectedIndex(0);
    updateHash({ commandPalette: true });
  }, [updateHash]);

  const closePalette = useCallback(() => {
    console.log('🚪 Closing command palette');
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
    updateHash({ commandPalette: false });
  }, [updateHash]);

  const groupedCommands = commandRegistry.getGroupedCommands(query, t);
  
  const flatCommands: Command[] = groupedCommands.reduce((acc, category) => {
    return [...acc, ...category.commands];
  }, [] as Command[]);

  const totalCommands = flatCommands.length;

  const selectNext = useCallback(() => {
    setSelectedIndex(prev => (prev + 1) % Math.max(1, totalCommands));
  }, [totalCommands]);

  const selectPrevious = useCallback(() => {
    setSelectedIndex(prev => prev === 0 ? Math.max(0, totalCommands - 1) : prev - 1);
  }, [totalCommands]);

  const executeSelected = useCallback(() => {
    if (flatCommands[selectedIndex]) {
      commandRegistry.executeCommand(flatCommands[selectedIndex].id);
      closePalette();
    }
  }, [flatCommands, selectedIndex, closePalette]);

  const executeCommand = useCallback((commandId: string) => {
    console.log('🎮 Command palette executing command:', commandId);
    commandRegistry.executeCommand(commandId);
    closePalette();
  }, [closePalette]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useHotkeys('ctrl+k,cmd+k', (e) => {
    e.preventDefault();
    console.log('⌨️ Ctrl+K pressed, palette open:', isOpen);
    if (isOpen) {
      closePalette();
    } else {
      openPalette();
    }
  }, { enableOnFormTags: true });

  useHotkeys('escape', () => {
    if (isOpen) {
      closePalette();
    }
  }, { enableOnFormTags: true, enabled: isOpen });

  useHotkeys('enter', () => {
    if (isOpen) {
      executeSelected();
    }
  }, { enableOnFormTags: true, enabled: isOpen });

  useHotkeys('arrowdown', (e) => {
    if (isOpen) {
      e.preventDefault();
      selectNext();
    }
  }, { enableOnFormTags: true, enabled: isOpen });

  useHotkeys('arrowup', (e) => {
    if (isOpen) {
      e.preventDefault();
      selectPrevious();
    }
  }, { enableOnFormTags: true, enabled: isOpen });

  return {
    isOpen,
    query,
    selectedIndex,
    groupedCommands,
    totalCommands,
    openPalette,
    closePalette,
    setQuery,
    selectNext,
    selectPrevious,
    executeSelected,
    executeCommand
  };
}