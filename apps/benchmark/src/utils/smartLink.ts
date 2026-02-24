export interface RemoteAssetTokenPayload {
  v: 1;
  j: string;
  a: string;
  i?: string[];
}

const TOKEN_COMPRESSED_PREFIX = 'z1.';
const TOKEN_JSON_PREFIX = 'j1.';

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function compress(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new CompressionStream('deflate');
    const writer = stream.writable.getWriter();
    const chunk = Uint8Array.from(bytes);
    await writer.write(chunk);
    await writer.close();
    const compressed = await new Response(stream.readable).arrayBuffer();
    return new Uint8Array(compressed);
  } catch {
    return null;
  }
}

async function decompress(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const stream = new DecompressionStream('deflate');
    const writer = stream.writable.getWriter();
    const chunk = Uint8Array.from(bytes);
    await writer.write(chunk);
    await writer.close();
    const inflated = await new Response(stream.readable).arrayBuffer();
    return new Uint8Array(inflated);
  } catch {
    return null;
  }
}

function isValidPayload(payload: unknown): payload is RemoteAssetTokenPayload {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as Partial<RemoteAssetTokenPayload>;
  if (candidate.v !== 1) return false;
  if (typeof candidate.j !== 'string' || typeof candidate.a !== 'string') return false;
  if (candidate.i && (!Array.isArray(candidate.i) || candidate.i.some((item) => typeof item !== 'string'))) {
    return false;
  }
  return true;
}

export async function encodeRemoteAssetToken(payload: RemoteAssetTokenPayload): Promise<string> {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  const compressed = await compress(bytes);
  if (compressed) {
    return TOKEN_COMPRESSED_PREFIX + bytesToBase64Url(compressed);
  }
  return TOKEN_JSON_PREFIX + bytesToBase64Url(bytes);
}

export async function decodeRemoteAssetToken(token: string): Promise<RemoteAssetTokenPayload> {
  if (!token) throw new Error('Empty smart-link token');

  if (token.startsWith(TOKEN_COMPRESSED_PREFIX)) {
    const raw = token.slice(TOKEN_COMPRESSED_PREFIX.length);
    const compressed = base64UrlToBytes(raw);
    const inflated = await decompress(compressed);
    if (!inflated) throw new Error('Unable to decompress smart-link token');
    const parsed = JSON.parse(new TextDecoder().decode(inflated));
    if (!isValidPayload(parsed)) throw new Error('Invalid smart-link token payload');
    return parsed;
  }

  if (token.startsWith(TOKEN_JSON_PREFIX)) {
    const raw = token.slice(TOKEN_JSON_PREFIX.length);
    const bytes = base64UrlToBytes(raw);
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!isValidPayload(parsed)) throw new Error('Invalid smart-link token payload');
    return parsed;
  }

  throw new Error('Unknown smart-link token format');
}

export async function buildSmartAssetLink(
  payload: RemoteAssetTokenPayload,
  currentLocationHref: string,
): Promise<string> {
  const token = await encodeRemoteAssetToken(payload);
  const url = new URL(currentLocationHref);
  url.searchParams.delete('json');
  url.searchParams.delete('atlas');
  url.searchParams.delete('asset');
  url.searchParams.set('a', token);

  return url.toString();
}
