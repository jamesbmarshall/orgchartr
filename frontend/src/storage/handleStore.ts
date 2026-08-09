/**
 * Persists the picked FileSystemDirectoryHandle in IndexedDB so the user can reopen the same
 * folder on their next visit without re-picking it. Handles are structured-cloneable; the
 * browser still gates actual access behind (re-)granted permission.
 */

const DB_NAME = 'orgchartr-local';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'dataDir';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await withStore('readwrite', (store) => store.put(handle, HANDLE_KEY));
}

export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const value = await withStore<unknown>('readonly', (store) => store.get(HANDLE_KEY));
    return (value as FileSystemDirectoryHandle | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function clearDirectoryHandle(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(HANDLE_KEY));
  } catch {
    // Best-effort; a stale handle only means an extra picker prompt next visit.
  }
}
