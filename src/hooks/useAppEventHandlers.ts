import { useCallback } from 'react';

export const useAppEventHandlers = () => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
    }
  }, []);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
    }
  }, []);

  return {
    handleKeyDown,
    handleContextMenu,
    handleWheel
  };
};