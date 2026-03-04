import React, { useEffect, useMemo, useState } from 'react';

export interface OpenGraphLinkItem {
  href: string;
  label: string;
}

interface OpenGraphPreview {
  imageUrl: string | null;
  title: string | null;
  description: string | null;
}

const previewCache = new Map<string, OpenGraphPreview | null>();

function resolveRemoteFetchProxy(): string | null {
  const raw = import.meta.env.VITE_REMOTE_FETCH_PROXY;
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function applyRemoteFetchProxy(url: string): string {
  const proxy = resolveRemoteFetchProxy();
  if (!proxy) return url;
  if (proxy.includes('{url}')) {
    return proxy.replace('{url}', encodeURIComponent(url));
  }
  const separator = proxy.includes('?') ? '&' : '?';
  return `${proxy}${separator}url=${encodeURIComponent(url)}`;
}

function getMetaContent(doc: Document, selectors: string[]): string | null {
  for (const selector of selectors) {
    const el = doc.querySelector<HTMLMetaElement>(selector);
    const content = el?.content?.trim();
    if (content) return content;
  }
  return null;
}

function normalizeImageUrl(imageUrl: string | null, pageUrl: string): string | null {
  if (!imageUrl) return null;
  try {
    return new URL(imageUrl, pageUrl).toString();
  } catch {
    return null;
  }
}

function getHostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

async function fetchOpenGraphPreview(url: string): Promise<OpenGraphPreview | null> {
  const cached = previewCache.get(url);
  if (cached !== undefined) return cached;

  const fetchUrl = applyRemoteFetchProxy(url);
  let response: Response;
  try {
    response = await fetch(fetchUrl, { mode: 'cors' });
  } catch {
    previewCache.set(url, null);
    return null;
  }

  if (!response.ok) {
    previewCache.set(url, null);
    return null;
  }

  let html = '';
  try {
    html = await response.text();
  } catch {
    previewCache.set(url, null);
    return null;
  }
  if (!html) {
    previewCache.set(url, null);
    return null;
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const ogImage = getMetaContent(doc, [
    'meta[property="og:image"]',
    'meta[property="og:image:url"]',
    'meta[name="twitter:image"]',
    'meta[name="twitter:image:src"]',
  ]);
  const ogTitle = getMetaContent(doc, [
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
  ]) ?? doc.querySelector('title')?.textContent?.trim() ?? null;
  const ogDescription = getMetaContent(doc, [
    'meta[property="og:description"]',
    'meta[name="description"]',
    'meta[name="twitter:description"]',
  ]);

  const preview: OpenGraphPreview = {
    imageUrl: normalizeImageUrl(ogImage, url),
    title: ogTitle,
    description: ogDescription,
  };
  previewCache.set(url, preview);
  return preview;
}

export function OpenGraphLinkGrid({ links }: { links: OpenGraphLinkItem[] }) {
  const [previews, setPreviews] = useState<Record<string, OpenGraphPreview>>({});

  const stableLinks = useMemo(() => {
    const deduped = new Map<string, OpenGraphLinkItem>();
    links.forEach((item) => {
      if (!deduped.has(item.href)) {
        deduped.set(item.href, item);
      }
    });
    return Array.from(deduped.values());
  }, [links]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const entries = await Promise.all(
        stableLinks.map(async (link) => {
          const preview = await fetchOpenGraphPreview(link.href);
          return [link.href, preview] as const;
        }),
      );

      if (cancelled) return;

      const next: Record<string, OpenGraphPreview> = {};
      entries.forEach(([href, preview]) => {
        if (preview) {
          next[href] = preview;
        }
      });
      setPreviews(next);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [stableLinks]);

  return (
    <div className="og-link-grid">
      {stableLinks.map((link) => {
        const preview = previews[link.href];
        const previewTitle = preview?.title || link.label;
        const previewDescription = preview?.description || '';
        const host = getHostFromUrl(link.href);

        return (
          <a
            key={link.href}
            className="og-link-card"
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {preview?.imageUrl ? (
              <div className="og-link-card-media">
                <img src={preview.imageUrl} alt="" loading="lazy" />
              </div>
            ) : (
              <div className="og-link-card-media og-link-card-media-fallback" aria-hidden="true">
                <span>{host.slice(0, 2).toUpperCase()}</span>
              </div>
            )}
            <div className="og-link-card-body">
              <h3>{previewTitle}</h3>
              <p className="og-link-card-host">{host}</p>
              {previewDescription && <p className="og-link-card-description">{previewDescription}</p>}
            </div>
          </a>
        );
      })}
    </div>
  );
}
