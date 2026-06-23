import { MemoryError } from '@murmur/shared';
import { MEMORY_TYPES, type MemoryItem, type MemoryType } from '../types';
import type { MemoryStore, NewMemoryItem } from '../providers';
import type { Database } from './db';

interface MemoryRow {
  id: string;
  type: string;
  content: string;
  created_at: number;
  session_id: string | null;
}

function rowToItem(row: MemoryRow): MemoryItem {
  const item: MemoryItem = {
    id: row.id,
    type: row.type as MemoryType,
    content: row.content,
    createdAt: row.created_at,
  };
  if (row.session_id !== null) {
    item.sessionId = row.session_id;
  }
  return item;
}

function assertValidType(type: string): asserts type is MemoryType {
  if (!(MEMORY_TYPES as readonly string[]).includes(type)) {
    throw new MemoryError(
      `Tipo de memoria inválido: "${type}". Válidos: ${MEMORY_TYPES.join(', ')}.`,
    );
  }
}

/** `MemoryStore` respaldado por SQLite (tabla `memory_items`). */
export class SqliteMemoryStore implements MemoryStore {
  readonly #db: Database;
  readonly #now: () => number;

  constructor(db: Database, now: () => number = Date.now) {
    this.#db = db;
    this.#now = now;
  }

  async add(item: NewMemoryItem): Promise<void> {
    assertValidType(item.type);
    const createdAt = item.createdAt ?? this.#now();
    this.#db
      .prepare(
        'INSERT INTO memory_items(id, type, content, created_at, session_id) VALUES (?, ?, ?, ?, ?)',
      )
      .run(item.id, item.type, item.content, createdAt, item.sessionId ?? null);
  }

  all(): Promise<MemoryItem[]> {
    const rows = this.#db
      .prepare('SELECT id, type, content, created_at, session_id FROM memory_items')
      .all() as unknown as MemoryRow[];
    return Promise.resolve(rows.map(rowToItem));
  }

  clear(): Promise<void> {
    this.#db.exec('DELETE FROM memory_items');
    return Promise.resolve();
  }

  getByType(type: MemoryType): Promise<MemoryItem[]> {
    assertValidType(type);
    const rows = this.#db
      .prepare('SELECT id, type, content, created_at, session_id FROM memory_items WHERE type = ?')
      .all(type) as unknown as MemoryRow[];
    return Promise.resolve(rows.map(rowToItem));
  }

  recent(limit: number): Promise<MemoryItem[]> {
    const rows = this.#db
      .prepare(
        'SELECT id, type, content, created_at, session_id FROM memory_items ORDER BY created_at DESC, id DESC LIMIT ?',
      )
      .all(limit) as unknown as MemoryRow[];
    return Promise.resolve(rows.map(rowToItem));
  }

  get(id: string): Promise<MemoryItem | undefined> {
    const row = this.#db
      .prepare('SELECT id, type, content, created_at, session_id FROM memory_items WHERE id = ?')
      .get(id) as unknown as MemoryRow | undefined;
    return Promise.resolve(row ? rowToItem(row) : undefined);
  }

  delete(id: string): Promise<void> {
    this.#db.prepare('DELETE FROM memory_items WHERE id = ?').run(id);
    return Promise.resolve();
  }

  count(): Promise<number> {
    const row = this.#db.prepare('SELECT COUNT(*) AS n FROM memory_items').get() as unknown as {
      n: number;
    };
    return Promise.resolve(row.n);
  }

  /**
   * Borra los items con `created_at < beforeMs` (retención). Devuelve el número de
   * items eliminados. Los embeddings asociados caen en cascada (`ON DELETE CASCADE`).
   */
  pruneOlderThan(beforeMs: number): Promise<number> {
    const info = this.#db
      .prepare('DELETE FROM memory_items WHERE created_at < ?')
      .run(beforeMs) as unknown as { changes: number | bigint };
    return Promise.resolve(Number(info.changes));
  }
}
