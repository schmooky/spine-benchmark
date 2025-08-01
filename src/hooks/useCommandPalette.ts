import { useState, useCallback, useEffect } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { commandRegistry, Command, CommandCategory } from '../utils/commandRegistry';

export interface UseCommandPaletteReturn {
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
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Load recent commands on mount
  useEffect(() => {
    commandRegistry.loadRecentCommands();
  }, []);

  const openPalette = useCallback(() => {
    setIsOpen(true);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const closePalette = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  // Get grouped commands based on current query
  const groupedCommands = commandRegistry.getGroupedCommands(query);
  
  // Flatten commands for navigation
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
    commandRegistry.executeCommand(commandId);
    closePalette();
  }, [closePalette]);

  // Update selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard shortcuts
  useHotkeys('ctrl+k,cmd+k', (e) => {
    e.preventDefault();
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