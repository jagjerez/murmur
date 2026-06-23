import type { MemoryItem } from '../types';
import type { EmbeddingProvider, NewMemoryItem, RagRetriever } from '../providers';
import { cosineSimilarity } from '../vector';
import type { SqliteStore } from './index';

const DEFAULT_LIMIT = 10;

/** Item recuperado junto a su puntuación de similitud coseno con la query. */
export interface ScoredMemoryItem {
  item: MemoryItem;
  score: number;
}

/**
 * `RagRetriever` respaldado por el store SQLite y un `EmbeddingProvider`. Extiende la
 * interfaz base con `index` (persiste item + embedding) y `retrieveScored`.
 */
export interface SqliteRagRetriever extends RagRetriever {
  /** Modelo bajo el que se indexan y consultan los embeddings. */
  readonly model: string;
  /** Persiste el `MemoryItem` y su embedding (clave de búsqueda). */
  index(item: NewMemoryItem): Promise<void>;
  /** Como `retrieve`, pero devuelve también el score de cada item. */
  retrieveScored(query: string, options?: { limit?: number }): Promise<ScoredMemoryItem[]>;
}

export interface SqliteRagRetrieverOptions {
  store: SqliteStore;
  embeddings: EmbeddingProvider;
  /** Etiqueta de modelo para los embeddings. Por defecto, el `id` del provider. */
  model?: string;
}

/**
 * Crea un retriever sobre SQLite. La búsqueda es un escaneo lineal en JS por similitud
 * coseno (`allEmbeddings(model)` → score → top-k), reemplazable detrás de `RagRetriever`.
 */
export function createSqliteRagRetriever(options: SqliteRagRetrieverOptions): SqliteRagRetriever {
  const { store, embeddings } = options;
  const model = options.model ?? embeddings.id;

  async function index(item: NewMemoryItem): Promise<void> {
    await store.memory.add(item);
    const [vector] = await embeddings.embed([item.content]);
    if (vector === undefined) {
      return;
    }
    store.embeddings.upsertEmbedding(item.id, vector, model);
  }

  async function score(query: string): Promise<ScoredMemoryItem[]> {
    const stored = store.embeddings.allEmbeddings(model);
    if (stored.length === 0) {
      return [];
    }
    const [queryVector] = await embeddings.embed([query]);
    if (queryVector === undefined) {
      return [];
    }
    const scored: ScoredMemoryItem[] = [];
    for (const entry of stored) {
      const item = await store.memory.get(entry.id);
      if (item === undefined) {
        continue;
      }
      scored.push({ item, score: cosineSimilarity(queryVector, entry.vector) });
    }
    // Orden estable: por score desc y, a igualdad, por id para reproducibilidad.
    scored.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
    return scored;
  }

  return {
    model,
    index,
    async retrieve(query: string, opts?: { limit?: number }): Promise<MemoryItem[]> {
      const limit = opts?.limit ?? DEFAULT_LIMIT;
      const scored = await score(query);
      return scored.slice(0, limit).map((s) => s.item);
    },
    async retrieveScored(query: string, opts?: { limit?: number }): Promise<ScoredMemoryItem[]> {
      const limit = opts?.limit ?? DEFAULT_LIMIT;
      const scored = await score(query);
      return scored.slice(0, limit);
    },
  };
}
