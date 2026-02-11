export interface StoredAssetFile {
  name: string;
  type: string;
  buffer: ArrayBuffer;
}

export interface StoredAsset {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  fileCount: number;
  totalBytes: number;
  previewImageDataUrl?: string;
  description?: string;
  files: StoredAssetFile[];
}

type BasicAssetFile = { name: string; type?: string };

const DB_NAME = 'spine-benchmark-assets';
const DB_VERSION = 1;
const STORE_NAME = 'assets';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isPreviewImage(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(png|jpg|jpeg|webp|gif|avif)$/i.test(file.name);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function isImageName(name: string): boolean {
  return /\.(png|jpg|jpeg|webp|gif|avif)$/i.test(name);
}

export function getAssetBundleCompleteness(files: BasicAssetFile[]): {
  hasSkeleton: boolean;
  hasAtlas: boolean;
  hasImages: boolean;
} {
  const hasSkeleton = files.some((file) => /\.(json|skel)$/i.test(file.name));
  const hasAtlas = files.some((file) => /\.atlas$/i.test(file.name));
  const hasImages = files.some((file) => (file.type || '').startsWith('image/') || isImageName(file.name));
  return { hasSkeleton, hasAtlas, hasImages };
}

export function isCompleteAssetBundle(files: BasicAssetFile[]): boolean {
  const { hasSkeleton, hasAtlas, hasImages } = getAssetBundleCompleteness(files);
  return hasSkeleton && hasAtlas && hasImages;
}

export function assertCompleteAssetBundle(files: BasicAssetFile[]): void {
  const { hasSkeleton, hasAtlas, hasImages } = getAssetBundleCompleteness(files);
  if (!hasSkeleton) {
    throw new Error('Missing skeleton file (.json or .skel).');
  }
  if (!hasAtlas) {
    throw new Error('Missing atlas file (.atlas).');
  }
  if (!hasImages) {
    throw new Error('Missing image files referenced by atlas.');
  }
}

export function deriveAssetName(files: FileList | File[]): string {
  const list = Array.from(files);
  const skeleton = list.find((file) => file.name.endsWith('.json') || file.name.endsWith('.skel'));
  if (!skeleton) {
    return `Asset ${new Date().toLocaleString()}`;
  }
  return skeleton.name.replace(/\.(json|skel)$/i, '');
}

export async function saveAsset(
  files: FileList | File[],
  preferredName?: string,
  options?: { description?: string }
): Promise<StoredAsset> {
  const list = Array.from(files);
  assertCompleteAssetBundle(list);
  const now = Date.now();
  const previewSource = list.find(isPreviewImage);
  const name = preferredName?.trim() || deriveAssetName(list);
  const record: StoredAsset = {
    id: randomId(),
    name,
    createdAt: now,
    updatedAt: now,
    fileCount: list.length,
    totalBytes: list.reduce((sum, file) => sum + file.size, 0),
    description: options?.description,
    files: []
  };

  if (previewSource) {
    try {
      record.previewImageDataUrl = await blobToDataUrl(previewSource);
    } catch {
      // Preview is optional and should not block asset persistence.
    }
  }

  for (const file of list) {
    const buffer = await file.arrayBuffer();
    record.files.push({
      name: file.name,
      type: file.type,
      buffer
    });
  }

  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return record;
}

export async function listAssets(): Promise<StoredAsset[]> {
  const db = await openDatabase();
  const assets = await new Promise<StoredAsset[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result || []) as StoredAsset[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return assets
    .filter((asset) => isCompleteAssetBundle(asset.files))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getAsset(assetId: string): Promise<StoredAsset | null> {
  const db = await openDatabase();
  const asset = await new Promise<StoredAsset | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(assetId);
    request.onsuccess = () => resolve((request.result as StoredAsset) || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return asset;
}

export async function deleteAsset(assetId: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(assetId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export function assetToFiles(asset: StoredAsset): File[] {
  return asset.files.map((file) => new File([file.buffer], file.name, { type: file.type }));
}
