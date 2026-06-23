import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { MemoryItem } from '../types';
import { createMockEmbeddingProvider } from '../embeddings';
import { createSqliteStore, type SqliteStore } from './index';
import { createSqliteRagRetriever } from './retriever';

describe('createSqliteRagRetriever', () => {
  let store: SqliteStore;

  beforeEach(() => {
    store = createSqliteStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  function item(id: string, content: string): MemoryItem {
    return { id, type: 'long_term_fact', content, createdAt: 1 };
  }

  it('index añade el MemoryItem al store y guarda su embedding', async () => {
    const embeddings = createMockEmbeddingProvider();
    const retriever = createSqliteRagRetriever({ store, embeddings });

    await retriever.index(item('a', 'el gato duerme en el sofá'));

    expect(await store.memory.get('a')).toBeDefined();
    expect(store.embeddings.getEmbedding('a')).toBeDefined();
  });

  it('retrieve devuelve el item más similar primero', async () => {
    const embeddings = createMockEmbeddingProvider();
    const retriever = createSqliteRagRetriever({ store, embeddings });

    await retriever.index(item('cats', 'los gatos cazan ratones por la noche'));
    await retriever.index(item('cooking', 'receta de tortilla de patatas con cebolla'));
    await retriever.index(item('space', 'la galaxia de Andrómeda colisionará con la Vía Láctea'));

    const results = await retriever.retrieve('gatos cazando ratones', { limit: 3 });
    expect(results[0]?.id).toBe('cats');
  });

  it('retrieve respeta el límite', async () => {
    const embeddings = createMockEmbeddingProvider();
    const retriever = createSqliteRagRetriever({ store, embeddings });

    await retriever.index(item('a', 'alpha uno'));
    await retriever.index(item('b', 'beta dos'));
    await retriever.index(item('c', 'gamma tres'));
    await retriever.index(item('d', 'delta cuatro'));

    const results = await retriever.retrieve('alpha beta gamma delta', { limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('retrieve sin items devuelve []', async () => {
    const embeddings = createMockEmbeddingProvider();
    const retriever = createSqliteRagRetriever({ store, embeddings });
    expect(await retriever.retrieve('lo que sea', { limit: 5 })).toEqual([]);
  });

  it('retrieve por defecto limita (no devuelve toda la memoria sin tope)', async () => {
    const embeddings = createMockEmbeddingProvider();
    const retriever = createSqliteRagRetriever({ store, embeddings });
    for (let i = 0; i < 12; i++) {
      await retriever.index(item(`m${i}`, `tema número ${i} sobre algo distinto`));
    }
    const results = await retriever.retrieve('tema');
    expect(results.length).toBeLessThanOrEqual(10);
    expect(results.length).toBeGreaterThan(0);
  });

  it('retrieveScored devuelve {item, score} ordenado descendente por score', async () => {
    const embeddings = createMockEmbeddingProvider();
    const retriever = createSqliteRagRetriever({ store, embeddings });

    await retriever.index(item('cats', 'los gatos cazan ratones por la noche'));
    await retriever.index(item('space', 'la galaxia de Andrómeda y la Vía Láctea'));

    const scored = await retriever.retrieveScored('gatos cazando ratones', { limit: 2 });
    expect(scored).toHaveLength(2);
    expect(scored[0]?.item.id).toBe('cats');
    expect(scored[0]!.score).toBeGreaterThanOrEqual(scored[1]!.score);
    expect(typeof scored[0]?.score).toBe('number');
  });

  it('solo puntúa embeddings del modelo configurado', async () => {
    // Un embedding de otro modelo en el store no debe contaminar el ranking de retrieve.
    const embeddings = createMockEmbeddingProvider();
    const retriever = createSqliteRagRetriever({ store, embeddings, model: 'mock' });

    await retriever.index(item('a', 'manzanas y peras'));
    // Item con embedding de otro modelo, insertado manualmente.
    await store.memory.add(item('b', 'no debería aparecer porque su modelo difiere'));
    store.embeddings.upsertEmbedding('b', new Float32Array([1, 0, 0, 0]), 'otro-modelo');

    const results = await retriever.retrieve('manzanas', { limit: 10 });
    expect(results.map((r) => r.id)).toEqual(['a']);
  });

  it('el id del retriever refleja el modelo del provider', () => {
    const embeddings = createMockEmbeddingProvider();
    const retriever = createSqliteRagRetriever({ store, embeddings });
    expect(typeof retriever.model).toBe('string');
    expect(retriever.model.length).toBeGreaterThan(0);
  });
});
