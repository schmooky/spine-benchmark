import { Application } from 'pixi.js';
import { useState, useRef, useEffect } from 'react';
import { BackgroundManager } from '../core/BackgroundManager';
import { useToast } from './ToastContext';

/**
 * useBackgroundManager - Custom hook for handling background management operations
 * 
 * This hook encapsulates all background management logic to reduce complexity in useSpineApp
 * and improve separation of concerns.
 */
export function useBackgroundManager(app: Application | null) {
  const backgroundManagerRef = useRef<BackgroundManager | null>(null);
  const [hasBackground, setHasBackground] = useState(false);
  const { addToast } = useToast();

  // Initialize background manager when app changes
  useEffect(() => {
    if (app) {
      backgroundManagerRef.current = new BackgroundManager(app);
    } else {
      backgroundManagerRef.current = null;
    }
    
    return () => {
      if (backgroundManagerRef.current) {
        backgroundManagerRef.current.destroy();
        backgroundManagerRef.current = null;
      }
    };
  }, [app]);

  /**
   * Set the background image using base64 data
   * @param base64Data - Base64 encoded image data
   */
  const setBackgroundImage = async (base64Data: string) => {
    if (!backgroundManagerRef.current) {
      addToast('Background manager not initialized', 'error');
      return;
    }
    
    try {
      await backgroundManagerRef.current.setBackgroundImage(base64Data);
      setHasBackground(true);
      addToast('Background image set successfully', 'success');
    } catch (error) {
      console.error('Error setting background image:', error);
      addToast(`Error setting background image: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };

  /**
   * Clear the background image
   */
  const clearBackgroundImage = () => {
    if (!backgroundManagerRef.current) {
      return;
    }
    
    backgroundManagerRef.current.clearBackground();
    setHasBackground(false);
    addToast('Background image removed', 'info');
  };

  return {
    hasBackground,
    setBackgroundImage,
    clearBackgroundImage
  };
}