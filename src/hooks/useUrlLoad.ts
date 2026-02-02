import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from './ToastContext';

export type UrlLoadStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UseUrlLoadOptions {
  app: unknown;
  loadSpineFromUrls: (jsonUrl: string, atlasUrl: string) => Promise<unknown>;
}

/**
 * Handles loading Spine from URL query params on mount and from modal.
 * Returns status, handler, and whether initial URL load was attempted.
 */
export function useUrlLoad({ app, loadSpineFromUrls }: UseUrlLoadOptions) {
  const [urlLoadStatus, setUrlLoadStatus] = useState<UrlLoadStatus>('idle');
  const [urlLoadAttempted, setUrlLoadAttempted] = useState(false);
  const { addToast } = useToast();
  const { t } = useTranslation();

  const handleUrlLoad = useCallback(
    async (jsonUrl: string, atlasUrl: string) => {
      try {
        setUrlLoadStatus('loading');
        await loadSpineFromUrls(jsonUrl, atlasUrl);
        setUrlLoadStatus('success');

        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('json', jsonUrl);
        newUrl.searchParams.set('atlas', atlasUrl);
        window.history.replaceState({}, '', newUrl);

        addToast(t('success.loadedFromUrl', 'Successfully loaded Spine from URL'), 'success');
      } catch (error) {
        setUrlLoadStatus('error');
        addToast(
          t('error.failedToLoadFromUrls', { error: (error as Error).message }),
          'error'
        );
      }
    },
    [loadSpineFromUrls, addToast, t]
  );

  useEffect(() => {
    if (!app || urlLoadAttempted) return;

    const checkAndLoadFromUrl = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const jsonUrl = urlParams.get('json');
      const atlasUrl = urlParams.get('atlas');

      if (jsonUrl && atlasUrl) {
        setUrlLoadAttempted(true);
        setUrlLoadStatus('loading');

        try {
          await loadSpineFromUrls(jsonUrl, atlasUrl);
          setUrlLoadStatus('success');
          addToast(t('success.loadedFromUrl', 'Successfully loaded Spine from URL'), 'success');
        } catch (error) {
          setUrlLoadStatus('error');
          addToast(
            t('error.failedToLoadFromUrls', { error: (error as Error).message }),
            'error'
          );
        }
      }
    };

    checkAndLoadFromUrl();
  }, [app, loadSpineFromUrls, urlLoadAttempted, addToast, t]);

  return { urlLoadStatus, urlLoadAttempted, handleUrlLoad };
}
