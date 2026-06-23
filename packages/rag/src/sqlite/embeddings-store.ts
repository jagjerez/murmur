import type { Vector } from '../vector';
import { float32ToBytes, bytesToFloat32 } from '../vector';
import type { Database } from './db';

/** Embedding almacenado de un `MemoryItem`. */
export interface StoredEmbedding {
  /** `memory_item_id` del item al que pertenece. */
  id: string;
  vector: Float32Array;
}

interface EmbeddingRow {
  memory_item_id: string;
  vector: Uint8Array;
}

/**
 * Almacenamiento de vectores en la tabla `embeddings` (migración v2). Cada embedding
 * está ligado 1:1 a un `MemoryItem` por su PK/FK con `ON DELETE CASCADE`: borrar el
 * item borra su vector. Toda la SQL usa parámetros vinculados (sin concatenación).
 */
export class SqliteEmbeddingStore {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  /** Inserta o reemplaza el embedding del item. El BLOB se guarda como Float32 LE. */
  upsertEmbedding(memoryItemId: string, vector: Vector, model: string): void {
    const f32 = vector instanceof Float32Array ? vector : Float32Array.from(vector);
    const bytes = float32ToBytes(f32);
    this.#db
      .prepare(
        `INSERT INTO embeddings(memory_item_id, model, dim, vector) VALUES (?, ?, ?, ?)
         ON CONFLICT(memory_item_id) DO UPDATE SET
           model = excluded.model, dim = excluded.dim, vector = excluded.vector`,
      )
      .run(memoryItemId, model, f32.length, bytes);
  }

  /** Devuelve el embedding del item, o `undefined` si no existe. */
  getEmbedding(memoryItemId: string): StoredEmbedding | undefined {
    const row = this.#db
      .prepare('SELECT memory_item_id, vector FROM embeddings WHERE memory_item_id = ?')
      .get(memoryItemId) as unknown as EmbeddingRow | undefined;
    if (!row) {
      return undefined;
    }
    return { id: row.memory_item_id, vector: bytesToFloat32(row.vector) };
  }

  /** Todos los embeddings, opcionalmente filtrados por `model`. */
  allEmbeddings(model?: string): StoredEmbedding[] {
    const rows = (model === undefined
      ? this.#db.prepare('SELECT memory_item_id, vector FROM embeddings').all()
      : this.#db
          .prepare('SELECT memory_item_id, vector FROM embeddings WHERE model = ?')
          .all(model)) as unknown as EmbeddingRow[];
    return rows.map((row) => ({ id: row.memory_item_id, vector: bytesToFloat32(row.vector) }));
  }
}
