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
  files: StoredAssetFile[];
}

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

export function deriveAssetName(files: FileList | File[]): string {
  const list = Array.from(files);
  const skeleton = list.find((file) => file.name.endsWith('.json') || file.name.endsWith('.skel'));
  if (!skeleton) {
    return `Asset ${new Date().toLocaleString()}`;
  }
  return skeleton.name.replace(/\.(json|skel)$/i, '');
}

export async function saveAsset(files: FileList | File[], preferredName?: string): Promise<StoredAsset> {
  const list = Array.from(files);
  const now = Date.now();
  const name = preferredName?.trim() || deriveAssetName(list);
  const record: StoredAsset = {
    id: randomId(),
    name,
    createdAt: now,
    updatedAt: now,
    fileCount: list.length,
    totalBytes: list.reduce((sum, file) => sum + file.size, 0),
    files: []
  };

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
  return assets.sort((a, b) => b.updatedAt - a.updatedAt);
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
