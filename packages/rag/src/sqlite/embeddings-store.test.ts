import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase, migrate, type Database } from './db';
import { SqliteMemoryStore } from './memory-store';
import { SqliteEmbeddingStore } from './embeddings-store';

describe('SqliteEmbeddingStore', () => {
  let db: Database;
  let memory: SqliteMemoryStore;
  let embeddings: SqliteEmbeddingStore;

  beforeEach(async () => {
    db = openDatabase(':memory:');
    migrate(db);
    memory = new SqliteMemoryStore(db);
    embeddings = new SqliteEmbeddingStore(db);
    await memory.add({ id: 'a', type: 'short_term', content: 'hola', createdAt: 1 });
    await memory.add({ id: 'b', type: 'short_term', content: 'adios', createdAt: 2 });
  });

  afterEach(() => {
    db.close();
  });

  it('upsert + get hace round-trip exacto del vector', () => {
    const vec = new Float32Array([0.1, -0.2, 0.3]);
    embeddings.upsertEmbedding('a', vec, 'mock');
    const got = embeddings.getEmbedding('a');
    expect(got).toBeDefined();
    expect(Array.from(got!.vector)).toEqual(Array.from(vec));
    expect(got!.id).toBe('a');
  });

  it('upsert sobre el mismo id reemplaza el vector y el modelo', () => {
    embeddings.upsertEmbedding('a', new Float32Array([1, 0]), 'mock');
    embeddings.upsertEmbedding('a', new Float32Array([0, 1, 2]), 'other');
    const got = embeddings.getEmbedding('a');
    expect(Array.from(got!.vector)).toEqual([0, 1, 2]);
    const all = embeddings.allEmbeddings();
    expect(all).toHaveLength(1);
  });

  it('acepta number[] además de Float32Array', () => {
    embeddings.upsertEmbedding('a', [4, 5, 6], 'mock');
    const got = embeddings.getEmbedding('a');
    expect(Array.from(got!.vector)).toEqual([4, 5, 6]);
  });

  it('getEmbedding devuelve undefined si no existe', () => {
    expect(embeddings.getEmbedding('nope')).toBeUndefined();
  });

  it('allEmbeddings devuelve todos con id y vector', () => {
    embeddings.upsertEmbedding('a', new Float32Array([1, 0]), 'mock');
    embeddings.upsertEmbedding('b', new Float32Array([0, 1]), 'mock');
    const all = embeddings.allEmbeddings();
    expect(all.map((e) => e.id).sort()).toEqual(['a', 'b']);
    const a = all.find((e) => e.id === 'a');
    expect(Array.from(a!.vector)).toEqual([1, 0]);
  });

  it('allEmbeddings(model) filtra por modelo', () => {
    embeddings.upsertEmbedding('a', new Float32Array([1, 0]), 'mock');
    embeddings.upsertEmbedding('b', new Float32Array([0, 1]), 'openai');
    expect(embeddings.allEmbeddings('mock').map((e) => e.id)).toEqual(['a']);
    expect(embeddings.allEmbeddings('openai').map((e) => e.id)).toEqual(['b']);
    expect(embeddings.allEmbeddings()).toHaveLength(2);
  });

  it('borrar el MemoryItem borra su embedding (ON DELETE CASCADE)', async () => {
    embeddings.upsertEmbedding('a', new Float32Array([1, 0]), 'mock');
    expect(embeddings.getEmbedding('a')).toBeDefined();
    await memory.delete('a');
    expect(embeddings.getEmbedding('a')).toBeUndefined();
  });
});
