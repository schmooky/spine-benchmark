/**
 * IndexedDB persistence for user-uploaded spine bundles, so the Library can
 * re-offer anything dropped before. Two stores: lightweight metadata (for the
 * list) and the raw File[] (read only when a bundle is actually loaded). File
 * objects are stored directly - the structured-clone algorithm preserves their
 * name, type and bytes.
 */

const DB_NAME = "spine-workbench";
const DB_VERSION = 1;
const META = "bundleMeta";
const FILES = "bundleFiles";

export interface BundleMeta {
  id: string;
  name: string;
  savedAt: number;
  fileNames: string[];
  bytes: number;
}

interface FilesRecord {
  id: string;
  files: File[];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META))
        db.createObjectStore(META, { keyPath: "id" });
      if (!db.objectStoreNames.contains(FILES))
        db.createObjectStore(FILES, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** All saved bundles' metadata, newest first. */
export async function listBundles(): Promise<BundleMeta[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(META, "readonly").objectStore(META).getAll();
      req.onsuccess = () =>
        resolve(
          (req.result as BundleMeta[]).sort((a, b) => b.savedAt - a.savedAt),
        );
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Persist (or overwrite, keyed by id) a bundle's files + metadata. */
export async function saveBundle(
  id: string,
  name: string,
  files: File[],
): Promise<BundleMeta> {
  const meta: BundleMeta = {
    id,
    name,
    savedAt: Date.now(),
    fileNames: files.map((f) => f.name),
    bytes: files.reduce((sum, f) => sum + f.size, 0),
  };
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction([META, FILES], "readwrite");
      t.objectStore(META).put(meta);
      t.objectStore(FILES).put({ id, files } satisfies FilesRecord);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    return meta;
  } finally {
    db.close();
  }
}

/** The stored File[] for a bundle (empty if missing). */
export async function getBundleFiles(id: string): Promise<File[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(FILES, "readonly").objectStore(FILES).get(id);
      req.onsuccess = () =>
        resolve(((req.result as FilesRecord | undefined)?.files ?? []) as File[]);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteBundle(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction([META, FILES], "readwrite");
      t.objectStore(META).delete(id);
      t.objectStore(FILES).delete(id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}
