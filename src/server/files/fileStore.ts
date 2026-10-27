/**
 * Stockage privé des pièces jointes (PRD §9.9). Les fichiers sont indexés par une clé
 * générée par le système ; aucun accès direct ni URL publique : seule la façade d'API lit le
 * contenu après contrôle d'autorisation.
 */
export interface StoredFile {
  data: ArrayBuffer;
  mime: string;
}

export interface FileStore {
  put(key: string, file: StoredFile): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export function memoryFileStore(): FileStore {
  const files = new Map<string, StoredFile>();
  return {
    put: async (k, f) => void files.set(k, f),
    get: async (k) => files.get(k) ?? null,
    delete: async (k) => void files.delete(k),
    clear: async () => files.clear(),
  };
}

const DB_NAME = "mcoaching-private-files";
const STORE = "files";

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(factory: IDBFactory, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb(factory).then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = op(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result as T);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

export function indexedDbFileStore(factory: IDBFactory = indexedDB): FileStore {
  return {
    put: (k, f) => run<void>(factory, "readwrite", (s) => s.put(f, k)),
    get: async (k) => (await run<StoredFile | undefined>(factory, "readonly", (s) => s.get(k))) ?? null,
    delete: (k) => run<void>(factory, "readwrite", (s) => s.delete(k)),
    clear: () => run<void>(factory, "readwrite", (s) => s.clear()),
  };
}
