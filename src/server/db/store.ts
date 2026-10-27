/**
 * Stockage du backend simulé.
 *
 * - `transaction(fn)` : exécution exclusive (Web Locks API entre onglets + mutex local),
 *   relecture de l'état le plus récent DANS le verrou, application sur une copie,
 *   puis écriture atomique. Si `fn` lève une erreur, rien n'est écrit (rollback).
 * - L'horloge applicative inclut le décalage de l'horloge de démonstration.
 *
 * À remplacer par PostgreSQL + transactions SQL côté serveur.
 */
import type { Database } from "@/modules/core/types";
import { createEmptyDatabase, SCHEMA_VERSION } from "./schema";

export interface StorageAdapter {
  read(): string | null;
  write(raw: string): void;
  clear(): void;
}

export const STORAGE_KEY = "mcoaching.db.v1";

export function localStorageAdapter(): StorageAdapter {
  return {
    read: () => window.localStorage.getItem(STORAGE_KEY),
    write: (raw) => window.localStorage.setItem(STORAGE_KEY, raw),
    clear: () => window.localStorage.removeItem(STORAGE_KEY),
  };
}

export function memoryAdapter(): StorageAdapter {
  let value: string | null = null;
  return { read: () => value, write: (raw) => (value = raw), clear: () => (value = null) };
}

type Listener = () => void;

export class Store {
  private cacheRaw: string | null = null;
  private cacheDb: Database | null = null;
  private localQueue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<Listener>();

  constructor(
    private readonly adapter: StorageAdapter,
    private readonly baseClock: () => number = () => Date.now(),
  ) {}

  /** Instant courant de l'application (horloge réelle + décalage de démonstration). */
  now(db?: Database): Date {
    const offset = (db ?? this.snapshot()).meta.clock_offset_ms;
    return new Date(this.baseClock() + offset);
  }

  realNow(): Date {
    return new Date(this.baseClock());
  }

  /** Lecture seule de l'état courant. Ne jamais muter l'objet renvoyé. */
  snapshot(): Database {
    const raw = this.adapter.read();
    if (raw && raw === this.cacheRaw && this.cacheDb) return this.cacheDb;
    let db: Database;
    if (!raw) {
      db = createEmptyDatabase(new Date(this.baseClock()).toISOString());
      const serialized = JSON.stringify(db);
      this.adapter.write(serialized);
      this.cacheRaw = serialized;
    } else {
      db = JSON.parse(raw) as Database;
      if (db.schema_version !== SCHEMA_VERSION) {
        throw new Error(`Version de schéma inattendue (${db.schema_version}). Réinitialisez les données locales.`);
      }
      this.cacheRaw = raw;
    }
    this.cacheDb = db;
    return db;
  }

  async transaction<T>(fn: (db: Database, now: Date) => T | Promise<T>): Promise<T> {
    return this.exclusive(async () => {
      const draft = structuredClone(this.snapshot());
      const result = await fn(draft, this.now(draft));
      const serialized = JSON.stringify(draft);
      if (serialized === this.cacheRaw) return result; // aucune modification : ni écriture ni notification
      this.adapter.write(serialized);
      this.cacheRaw = serialized;
      this.cacheDb = draft;
      this.emit();
      return result;
    });
  }

  /** Remplace intégralement la base (réinitialisation, seed). */
  async replace(db: Database): Promise<void> {
    await this.exclusive(() => {
      const serialized = JSON.stringify(db);
      this.adapter.write(serialized);
      this.cacheRaw = serialized;
      this.cacheDb = db;
      this.emit();
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** À appeler quand un autre onglet a modifié le stockage. */
  externalChange(): void {
    this.cacheRaw = null;
    this.emit();
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  private exclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = async () => {
      const locks = typeof navigator !== "undefined" ? (navigator as Navigator).locks : undefined;
      if (locks) return locks.request(STORAGE_KEY, { mode: "exclusive" }, async () => fn()) as Promise<T>;
      return fn();
    };
    const next = this.localQueue.then(run, run);
    this.localQueue = next.catch(() => undefined);
    return next;
  }
}
