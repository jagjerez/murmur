import type { MemoryItem } from '../types';
import type { Message, Session } from '@murmur/shared';
import { openDatabase, migrate } from './db';
import { SqliteMemoryStore } from './memory-store';
import { ConversationStore } from './conversation-store';
import { SqliteEmbeddingStore } from './embeddings-store';

/** Volcado serializable de todos los datos persistidos (para export/backup). */
export interface StoreExport {
  memory: MemoryItem[];
  sessions: Session[];
  messages: Message[];
}

/** Store SQLite combinado: memoria + conversación + embeddings sobre un único handle. */
export interface SqliteStore {
  readonly memory: SqliteMemoryStore;
  readonly conversation: ConversationStore;
  readonly embeddings: SqliteEmbeddingStore;
  /** Vacía todas las tablas (memory_items, sessions, messages, embeddings). */
  reset(): Promise<void>;
  /**
   * Retención: borra memoria, mensajes y sesiones anteriores a `beforeMs`
   * (`created_at`/`started_at < beforeMs`). Los datos en cascada se limpian solos.
   */
  pruneOlderThan(beforeMs: number): Promise<void>;
  /** Vuelca toda la memoria, sesiones y mensajes en un objeto serializable a JSON. */
  exportAll(): Promise<StoreExport>;
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
  const embeddings = new SqliteEmbeddingStore(db);

  return {
    memory,
    conversation,
    embeddings,
    reset(): Promise<void> {
      // `embeddings` cae en cascada al borrar `memory_items`, pero lo vaciamos explícitamente
      // primero por claridad y para no depender del orden ni del pragma de FK.
      db.exec(
        'DELETE FROM embeddings; DELETE FROM messages; DELETE FROM sessions; DELETE FROM memory_items;',
      );
      return Promise.resolve();
    },
    async pruneOlderThan(beforeMs: number): Promise<void> {
      await memory.pruneOlderThan(beforeMs);
      conversation.pruneOlderThan(beforeMs);
    },
    async exportAll(): Promise<StoreExport> {
      const { sessions, messages } = conversation.exportConversation();
      return { memory: await memory.all(), sessions, messages };
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
export { SqliteEmbeddingStore, type StoredEmbedding } from './embeddings-store';
export {
  createSqliteRagRetriever,
  type SqliteRagRetriever,
  type SqliteRagRetrieverOptions,
  type ScoredMemoryItem,
} from './retriever';
