import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { Application } from 'pixi.js';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SpineLoader } from '../core/SpineLoader';
import { useToast } from './ToastContext';
import { tIndexed } from '../utils/indexedMessage';

const STALE_LOAD_RESULT = '__stale_load_result__';

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
  const spineInstanceRef = useRef<Spine | null>(null);
  const loadSequenceRef = useRef(0);
  const { addToast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    spineInstanceRef.current = spineInstance;
  }, [spineInstance]);

  const disposeSpine = useCallback((instance: Spine | null) => {
    if (!instance) return;
    try {
      instance.state.clearTracks();
      if (instance.parent) {
        instance.parent.removeChild(instance);
      }
    } catch (error) {
      console.warn('Failed to dispose previous spine instance', error);
    }
  }, []);

  const startLoad = useCallback(() => {
    const loadId = ++loadSequenceRef.current;
    const existing = spineInstanceRef.current;
    if (existing) {
      disposeSpine(existing);
      spineInstanceRef.current = null;
    }
    setSpineInstance(null);
    setIsLoading(true);
    return loadId;
  }, [disposeSpine]);

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

    const loadId = startLoad();
    
    try {
      console.log('Loading Spine files from URLs:', { jsonUrl, atlasUrl });

      // Load spine files from URLs
      const newSpineInstance = await loaderRef.current.loadSpineFromUrls(jsonUrl, atlasUrl);
      
      if (!newSpineInstance) {
        throw new Error(t('error.failedToLoadSpineFromUrls'));
      }

      // Ignore stale async result if another load started later.
      if (loadId !== loadSequenceRef.current) {
        disposeSpine(newSpineInstance);
        throw new Error(STALE_LOAD_RESULT);
      }

      spineInstanceRef.current = newSpineInstance;
      setSpineInstance(newSpineInstance);
      addToast(t('success.loadedFromUrl'), 'success');
      
      return newSpineInstance;
      
    } catch (error) {
      if (loadId !== loadSequenceRef.current && error instanceof Error && error.message === STALE_LOAD_RESULT) {
        throw error;
      }
      console.error('Error loading Spine files from URLs:', error);
      addToast(
        tIndexed(t, 'error.loadingError', [error instanceof Error ? error.message : t('dashboard.messages.unknownError')]),
        'error'
      );
      throw error;
    } finally {
      if (loadId === loadSequenceRef.current) {
        setIsLoading(false);
      }
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

    const loadId = startLoad();
    
    try {
      // Log file information for debugging
      console.log(`Processing ${files.length} files:`);
      Array.from(files).forEach((file, index) => {
        console.log(`File ${index + 1}: ${file.name} (${file.type})`);
      });

      // Load spine files
      const newSpineInstance = await loaderRef.current.loadSpineFiles(files);
      
      if (!newSpineInstance) {
        throw new Error(t('error.failedToLoadSpineInstance'));
      }

      // Ignore stale async result if another load started later.
      if (loadId !== loadSequenceRef.current) {
        disposeSpine(newSpineInstance);
        throw new Error(STALE_LOAD_RESULT);
      }

      spineInstanceRef.current = newSpineInstance;
      setSpineInstance(newSpineInstance);
      addToast(t('success.loadedFromFile'), 'success');
      
      return newSpineInstance;
      
    } catch (error) {
      if (loadId !== loadSequenceRef.current && error instanceof Error && error.message === STALE_LOAD_RESULT) {
        throw error;
      }
      console.error('Error loading Spine files:', error);
      addToast(
        tIndexed(t, 'error.loadingError', [error instanceof Error ? error.message : t('dashboard.messages.unknownError')]),
        'error'
      );
      throw error;
    } finally {
      if (loadId === loadSequenceRef.current) {
        setIsLoading(false);
      }
    }
  };

  /**
   * Clear the current spine instance
   */
  const clearSpineInstance = () => {
    const existing = spineInstanceRef.current;
    if (existing) {
      disposeSpine(existing);
      spineInstanceRef.current = null;
    }
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
