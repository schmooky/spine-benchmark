import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { UrlLoadStatus } from './useUrlLoad';

/**
 * Unifies loading state from file drop, spine loader, and URL load.
 * Returns a single isAnyLoading flag and message for the loading indicator.
 */
export function useLoadingState(
  isDropLoading: boolean,
  spineLoading: boolean,
  urlLoadStatus: UrlLoadStatus
) {
  const { t } = useTranslation();

  const isAnyLoading = useMemo(
    () => isDropLoading || spineLoading || urlLoadStatus === 'loading',
    [isDropLoading, spineLoading, urlLoadStatus]
  );

  const loadingMessage = useMemo(() => {
    if (urlLoadStatus === 'loading') {
      return t('ui.loadingFromUrl', 'Loading from URL...');
    }
    return t('ui.loading');
  }, [urlLoadStatus, t]);

  return { isAnyLoading, loadingMessage };
}
