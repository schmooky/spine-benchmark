import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from './ToastContext';
import {
  buildSmartAssetLink,
  decodeRemoteAssetToken,
  RemoteAssetTokenPayload,
} from '../utils/smartLink';
import { copyTextToClipboard } from '../utils/clipboard';

export type UrlLoadStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UrlLoadRequestOptions {
  imageUrls?: string[];
}

export interface UseUrlLoadOptions {
  app: unknown;
  loadAssetFromRemoteBundle: (
    jsonUrl: string,
    atlasUrl: string,
    options?: UrlLoadRequestOptions,
  ) => Promise<unknown>;
}

const STALE_LOAD_RESULT = '__stale_load_result__';

function getUrlLoadErrorMessage(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : t('error.urlLoadUnknown');

  const lower = raw.toLowerCase();
  if (lower.includes('cors') || lower.includes('failed to fetch') || lower.includes('networkerror')) {
    return t('error.urlLoadCors');
  }

  return raw;
}

/**
 * Handles loading Spine from URL query params on mount and from modal.
 * Returns status, handler, and whether initial URL load was attempted.
 */
export function useUrlLoad({ app, loadAssetFromRemoteBundle }: UseUrlLoadOptions) {
  const [urlLoadStatus, setUrlLoadStatus] = useState<UrlLoadStatus>('idle');
  const [urlLoadAttempted, setUrlLoadAttempted] = useState(false);
  const { addToast } = useToast();
  const { t } = useTranslation();

  const replaceLocationWithSmartToken = useCallback(
    async (payload: RemoteAssetTokenPayload) => {
      const nextUrl = await buildSmartAssetLink(payload, window.location.href);
      window.history.replaceState({}, '', nextUrl);
      return nextUrl;
    },
    [],
  );

  const handleUrlLoad = useCallback(
    async (jsonUrl: string, atlasUrl: string, options?: UrlLoadRequestOptions) => {
      try {
        setUrlLoadStatus('loading');
        await loadAssetFromRemoteBundle(jsonUrl, atlasUrl, options);
        setUrlLoadStatus('success');

        const payload: RemoteAssetTokenPayload = {
          v: 1,
          j: jsonUrl,
          a: atlasUrl,
        };
        if (options?.imageUrls?.length) {
          payload.i = options.imageUrls;
        }
        const smartLink = await replaceLocationWithSmartToken(payload);
        const copied = await copyTextToClipboard(smartLink);
        addToast(t('success.loadedFromUrl'), 'success');
        if (copied) {
          addToast(t('toolRouteControls.status.smartLinkCopied'), 'success');
        } else {
          addToast(t('toolRouteControls.status.smartLinkCopyFailedManual'), 'warning');
        }
      } catch (error) {
        if (error instanceof Error && error.message === STALE_LOAD_RESULT) {
          return;
        }
        setUrlLoadStatus('error');
        const message = getUrlLoadErrorMessage(error, t);
        addToast(
          t('error.failedToLoadFromUrls', { error: message }),
          'error'
        );
      }
    },
    [loadAssetFromRemoteBundle, replaceLocationWithSmartToken, addToast, t]
  );

  useEffect(() => {
    if (!app || urlLoadAttempted) return;

    const checkAndLoadFromUrl = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const smartToken = urlParams.get('a');
      const jsonUrl = urlParams.get('json');
      const atlasUrl = urlParams.get('atlas');

      if (!smartToken && !(jsonUrl && atlasUrl)) {
        return;
      }

      setUrlLoadAttempted(true);
      setUrlLoadStatus('loading');

      if (smartToken) {
        try {
          const payload = await decodeRemoteAssetToken(smartToken);
          await loadAssetFromRemoteBundle(payload.j, payload.a, {
            imageUrls: payload.i,
          });
          setUrlLoadStatus('success');
          addToast(t('success.loadedFromUrl'), 'success');
          return;
        } catch (error) {
          if (error instanceof Error && error.message === STALE_LOAD_RESULT) {
            return;
          }
          setUrlLoadStatus('error');
          const message = getUrlLoadErrorMessage(error, t);
          addToast(
            t('error.failedToLoadFromUrls', { error: message }),
            'error'
          );
          if (!(jsonUrl && atlasUrl)) {
            return;
          }
        }
      }

      if (jsonUrl && atlasUrl) {
        try {
          await loadAssetFromRemoteBundle(jsonUrl, atlasUrl);
          setUrlLoadStatus('success');
          addToast(t('success.loadedFromUrl'), 'success');
        } catch (error) {
          if (error instanceof Error && error.message === STALE_LOAD_RESULT) {
            return;
          }
          setUrlLoadStatus('error');
          const message = getUrlLoadErrorMessage(error, t);
          addToast(
            t('error.failedToLoadFromUrls', { error: message }),
            'error'
          );
        }
      }
    };

    checkAndLoadFromUrl();
  }, [app, loadAssetFromRemoteBundle, urlLoadAttempted, addToast, t]);

  return { urlLoadStatus, urlLoadAttempted, handleUrlLoad };
}
