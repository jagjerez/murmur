import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryError } from '@murmur/shared';
import type { MemoryItem } from '../types';
import { openDatabase, migrate, type Database } from './db';
import { SqliteMemoryStore } from './memory-store';

describe('SqliteMemoryStore', () => {
  let db: Database;
  let store: SqliteMemoryStore;

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
    store = new SqliteMemoryStore(db);
  });

  afterEach(() => {
    db.close();
  });

  function item(partial: Partial<MemoryItem> & { id: string }): MemoryItem {
    return {
      type: 'short_term',
      content: 'contenido',
      createdAt: 1000,
      ...partial,
    };
  }

  it('add + all hace round-trip preservando los campos', async () => {
    const m = item({ id: 'a', type: 'long_term_fact', content: 'el cielo es azul', createdAt: 42 });
    await store.add(m);
    const all = await store.all();
    expect(all).toEqual([m]);
  });

  it('preserva sessionId cuando está presente y lo omite cuando no', async () => {
    await store.add(item({ id: 'a', sessionId: 's1' }));
    await store.add(item({ id: 'b' }));
    const all = await store.all();
    const a = all.find((x) => x.id === 'a');
    const b = all.find((x) => x.id === 'b');
    expect(a?.sessionId).toBe('s1');
    expect(b?.sessionId).toBeUndefined();
  });

  it('getByType filtra por tipo', async () => {
    await store.add(item({ id: 'a', type: 'short_term' }));
    await store.add(item({ id: 'b', type: 'long_term_fact' }));
    await store.add(item({ id: 'c', type: 'long_term_fact' }));
    const facts = await store.getByType('long_term_fact');
    expect(facts.map((x) => x.id).sort()).toEqual(['b', 'c']);
  });

  it('recent ordena descendente por created_at y respeta el límite', async () => {
    await store.add(item({ id: 'a', createdAt: 100 }));
    await store.add(item({ id: 'b', createdAt: 300 }));
    await store.add(item({ id: 'c', createdAt: 200 }));
    const recent = await store.recent(2);
    expect(recent.map((x) => x.id)).toEqual(['b', 'c']);
  });

  it('get devuelve el item o undefined', async () => {
    await store.add(item({ id: 'a' }));
    expect((await store.get('a'))?.id).toBe('a');
    expect(await store.get('nope')).toBeUndefined();
  });

  it('delete elimina el item y count refleja el total', async () => {
    await store.add(item({ id: 'a' }));
    await store.add(item({ id: 'b' }));
    expect(await store.count()).toBe(2);
    await store.delete('a');
    expect(await store.count()).toBe(1);
    expect(await store.get('a')).toBeUndefined();
  });

  it('clear vacía la tabla', async () => {
    await store.add(item({ id: 'a' }));
    await store.add(item({ id: 'b' }));
    await store.clear();
    expect(await store.count()).toBe(0);
    expect(await store.all()).toEqual([]);
  });

  it('usa now() inyectable cuando createdAt no se aporta', async () => {
    const storeWithClock = new SqliteMemoryStore(db, () => 7777);
    await storeWithClock.add({ id: 'a', type: 'short_term', content: 'x' } as MemoryItem);
    const got = await storeWithClock.get('a');
    expect(got?.createdAt).toBe(7777);
  });

  it('type inválido lanza MemoryError', async () => {
    await expect(
      store.add(item({ id: 'a', type: 'no_existe' as MemoryItem['type'] })),
    ).rejects.toBeInstanceOf(MemoryError);
  });

  it('pruneOlderThan borra solo los items anteriores al umbral', async () => {
    await store.add(item({ id: 'viejo', createdAt: 100 }));
    await store.add(item({ id: 'limite', createdAt: 200 }));
    await store.add(item({ id: 'nuevo', createdAt: 300 }));

    const removed = await store.pruneOlderThan(200);

    expect(removed).toBe(1);
    const ids = (await store.all()).map((x) => x.id).sort();
    expect(ids).toEqual(['limite', 'nuevo']);
  });

  it('pruneOlderThan no borra nada si todo es posterior', async () => {
    await store.add(item({ id: 'a', createdAt: 500 }));
    expect(await store.pruneOlderThan(100)).toBe(0);
    expect(await store.count()).toBe(1);
  });
});
