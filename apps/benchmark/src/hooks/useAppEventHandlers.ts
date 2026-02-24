import { useCallback } from 'react';

export const useAppEventHandlers = () => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Prevent default browser behavior for common shortcuts
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      // Prevent save dialog
      e.preventDefault();
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      // Prevent open dialog
      e.preventDefault();
    }
  }, []);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    // Disable right-click context menu
    e.preventDefault();
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    // Prevent zooming the entire page
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