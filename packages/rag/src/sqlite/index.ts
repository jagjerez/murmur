import { openDatabase, migrate } from './db';
import { SqliteMemoryStore } from './memory-store';
import { ConversationStore } from './conversation-store';

/** Store SQLite combinado: memoria + conversación sobre un único handle. */
export interface SqliteStore {
  readonly memory: SqliteMemoryStore;
  readonly conversation: ConversationStore;
  /** Vacía las tres tablas (memory_items, sessions, messages). */
  reset(): Promise<void>;
  /** Cierra el handle de base de datos. */
  close(): void;
  /** Ruta del fichero o `':memory:'`. */
  readonly path: string;
}

/**
 * Abre (o crea) la base de datos en `path`, aplica las migraciones y comparte el handle
 * entre `memory` y `conversation`. `path` puede ser un fichero o `':memory:'`.
 * `now` es inyectable para tests deterministas.
 */
export function createSqliteStore(path: string, now: () => number = Date.now): SqliteStore {
  const db = openDatabase(path);
  migrate(db);

  const memory = new SqliteMemoryStore(db, now);
  const conversation = new ConversationStore(db, now);

  return {
    memory,
    conversation,
    reset(): Promise<void> {
      db.exec('DELETE FROM messages; DELETE FROM sessions; DELETE FROM memory_items;');
      return Promise.resolve();
    },
    close(): void {
      db.close();
    },
    path,
  };
}

export { openDatabase, migrate, SCHEMA_VERSION, type Database } from './db';
export { SqliteMemoryStore } from './memory-store';
export { ConversationStore, type NewMessage } from './conversation-store';
