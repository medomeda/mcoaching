import { indexedDbFileStore, memoryFileStore, type FileStore } from "./files/fileStore";
import { localStorageAdapter, memoryAdapter, Store, STORAGE_KEY } from "./db/store";

export interface Runtime {
  store: Store;
  files: FileStore;
}

let runtime: Runtime | null = null;

export function getRuntime(): Runtime {
  if (runtime) return runtime;
  if (typeof window === "undefined") throw new Error("Le backend simulé s’exécute uniquement dans le navigateur.");
  const store = new Store(localStorageAdapter());
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY || e.key === null) store.externalChange();
  });
  runtime = { store, files: indexedDbFileStore() };
  return runtime;
}

/** Tests : runtime en mémoire avec horloge contrôlable. */
export function createMemoryRuntime(clock?: () => number): Runtime {
  return { store: new Store(memoryAdapter(), clock), files: memoryFileStore() };
}

export function setRuntime(r: Runtime | null): void {
  runtime = r;
}

/** Remplace temporairement le runtime (seed) et renvoie le précédent. */
export function swapRuntime(r: Runtime | null): Runtime | null {
  const prev = runtime;
  runtime = r;
  return prev;
}
