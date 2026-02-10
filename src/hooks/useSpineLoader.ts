import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { Application } from 'pixi.js';
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SpineLoader } from '../core/SpineLoader';
import { useToast } from './ToastContext';

/**
 * useSpineLoader - Custom hook for handling Spine file loading operations
 * 
 * This hook encapsulates all spine loading logic to reduce complexity in useSpineApp
 * and improve separation of concerns.
 */
export function useSpineLoader(app: Application | null) {
  const [spineInstance, setSpineInstance] = useState<Spine | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const loaderRef = useRef<SpineLoader | null>(null);
  const { addToast } = useToast();
  const { t } = useTranslation();

  // Initialize loader when app changes
  useEffect(() => {
    if (app) {
      loaderRef.current = new SpineLoader(app);
    } else {
      loaderRef.current = null;
    }
  }, [app]);

  /**
   * Load spine files from URLs
   * @param jsonUrl - URL to the JSON skeleton file
   * @param atlasUrl - URL to the atlas file
   * @returns Promise<Spine> - Loaded Spine instance
   */
  const loadSpineFromUrls = async (jsonUrl: string, atlasUrl: string): Promise<Spine> => {
    if (!app || !loaderRef.current) {
      const message = t('dashboard.messages.notInitialized');
      addToast(message, 'error');
      throw new Error(message);
    }

    setIsLoading(true);
    
    try {
      console.log('Loading Spine files from URLs:', { jsonUrl, atlasUrl });
      
      // Remove previous Spine instance if exists
      if (spineInstance) {
        setSpineInstance(null);
      }

      // Load spine files from URLs
      const newSpineInstance = await loaderRef.current.loadSpineFromUrls(jsonUrl, atlasUrl);
      
      if (!newSpineInstance) {
        throw new Error('Failed to load Spine instance from URLs');
      }

      setSpineInstance(newSpineInstance);
      addToast(t('success.loadedFromUrl'), 'success');
      
      return newSpineInstance;
      
    } catch (error) {
      console.error('Error loading Spine files from URLs:', error);
      addToast(t('error.loadingError', { 0: error instanceof Error ? error.message : t('dashboard.messages.unknownError') }), 'error');
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Load spine files from FileList
   * @param files - FileList containing Spine files
   * @returns Promise<Spine> - Loaded Spine instance
   */
  const loadSpineFiles = async (files: FileList): Promise<Spine> => {
    if (!app || !loaderRef.current) {
      const message = t('dashboard.messages.notInitialized');
      addToast(message, 'error');
      throw new Error(message);
    }

    setIsLoading(true);
    
    try {
      // Log file information for debugging
      console.log(`Processing ${files.length} files:`);
      Array.from(files).forEach((file, index) => {
        console.log(`File ${index + 1}: ${file.name} (${file.type})`);
      });

      // Remove previous Spine instance if exists
      if (spineInstance) {
        setSpineInstance(null);
      }

      // Load spine files
      const newSpineInstance = await loaderRef.current.loadSpineFiles(files);
      
      if (!newSpineInstance) {
        throw new Error('Failed to load Spine instance');
      }

      setSpineInstance(newSpineInstance);
      addToast(t('success.loadedFromFile'), 'success');
      
      return newSpineInstance;
      
    } catch (error) {
      console.error('Error loading Spine files:', error);
      addToast(t('error.loadingError', { 0: error instanceof Error ? error.message : t('dashboard.messages.unknownError') }), 'error');
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Clear the current spine instance
   */
  const clearSpineInstance = () => {
    setSpineInstance(null);
  };

  return {
    spineInstance,
    isLoading,
    loadSpineFiles,
    loadSpineFromUrls,
    clearSpineInstance
  };
}
