export interface RemoteAssetBundleOptions {
  imageUrls?: string[];
}

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

const IMAGE_EXTENSION_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  ktx2: 'image/ktx2',
  basis: 'image/basis',
};

function inferMimeTypeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSION_TO_MIME[ext] ?? 'application/octet-stream';
}

function getFileNameFromUrl(url: string, fallback: string): string {
  try {
    const parsed = new URL(url, window.location.href);
    const name = decodeURIComponent(parsed.pathname.split('/').pop() || '').trim();
    return name || fallback;
  } catch {
    return fallback;
  }
}

function resolveUrl(rawUrl: string, baseUrl?: string): string {
  try {
    return new URL(rawUrl, baseUrl ?? window.location.href).toString();
  } catch {
    return rawUrl;
  }
}

async function fetchOrThrow(url: string, label: string): Promise<Response> {
  const fetchUrl = applyRemoteFetchProxy(url);
  let response: Response;
  try {
    response = await fetch(fetchUrl, { mode: 'cors' });
  } catch {
    throw new Error(
      `${label} fetch failed. This URL is likely blocked by CORS. ` +
        'Use a CORS-enabled source, host the files on the same origin, set VITE_REMOTE_FETCH_PROXY, or load local files into the asset library.',
    );
  }

  if (!response.ok) {
    throw new Error(`${label} fetch failed (${response.status} ${response.statusText})`);
  }
  return response;
}

export function extractAtlasPageNames(atlasText: string): string[] {
  const lines = atlasText.split(/\r?\n/);
  const pages: string[] = [];
  const metadataKeys = new Set(['size', 'format', 'filter', 'repeat', 'pma', 'scale']);
  let currentCandidate: string | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      currentCandidate = null;
      continue;
    }
    if (line.includes(':')) continue;

    const next = lines.slice(i + 1).map((item) => item.trim()).find(Boolean) ?? '';
    if (next.includes(':')) {
      const key = next.split(':')[0].trim();
      if (metadataKeys.has(key)) {
        currentCandidate = line;
        if (!pages.includes(currentCandidate)) pages.push(currentCandidate);
      }
    }
  }
  return pages;
}

export function parseImageUrlList(raw: string): string[] {
  return raw
    .split(/[\n,]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function fetchRemoteAssetBundleFiles(
  jsonUrl: string,
  atlasUrl: string,
  options?: RemoteAssetBundleOptions,
): Promise<File[]> {
  const resolvedJsonUrl = resolveUrl(jsonUrl);
  const resolvedAtlasUrl = resolveUrl(atlasUrl);

  const jsonResponse = await fetchOrThrow(resolvedJsonUrl, 'JSON');
  const atlasResponse = await fetchOrThrow(resolvedAtlasUrl, 'Atlas');

  const jsonBlob = await jsonResponse.blob();
  const atlasText = await atlasResponse.text();

  const jsonFileName = getFileNameFromUrl(resolvedJsonUrl, 'skeleton.json');
  const atlasFileName = getFileNameFromUrl(resolvedAtlasUrl, 'skeleton.atlas');

  const jsonFile = new File([jsonBlob], jsonFileName, {
    type: jsonResponse.headers.get('content-type') || 'application/json',
  });
  const atlasFile = new File([atlasText], atlasFileName, {
    type: atlasResponse.headers.get('content-type') || 'text/plain',
  });

  const pageNames = extractAtlasPageNames(atlasText);
  const overrides = options?.imageUrls?.filter(Boolean) ?? [];
  const atlasBaseUrl = resolvedAtlasUrl.substring(0, resolvedAtlasUrl.lastIndexOf('/') + 1);

  const imageFiles: File[] = [];
  for (let i = 0; i < pageNames.length; i += 1) {
    const pageName = pageNames[i];
    const rawImageUrl = overrides[i] ?? pageName;
    const resolvedImageUrl = resolveUrl(rawImageUrl, atlasBaseUrl);
    const imageResponse = await fetchOrThrow(resolvedImageUrl, `Image "${pageName}"`);
    const imageBlob = await imageResponse.blob();

    imageFiles.push(
      new File([imageBlob], pageName, {
        type: imageResponse.headers.get('content-type') || inferMimeTypeFromName(pageName),
      }),
    );
  }

  return [jsonFile, atlasFile, ...imageFiles];
}
