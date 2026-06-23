import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteStore } from './index';

describe('createSqliteStore', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function tempFile(name = 'memory.db'): string {
    const dir = mkdtempSync(join(tmpdir(), 'murmur-store-'));
    dirs.push(dir);
    return join(dir, name);
  }

  it('expone memory, conversation, embeddings, reset, close y path', () => {
    const store = createSqliteStore(':memory:');
    expect(store.memory).toBeDefined();
    expect(store.conversation).toBeDefined();
    expect(store.embeddings).toBeDefined();
    expect(typeof store.reset).toBe('function');
    expect(typeof store.close).toBe('function');
    expect(store.path).toBe(':memory:');
    store.close();
  });

  it('embeddings funciona a través del store y reset lo vacía', async () => {
    const store = createSqliteStore(':memory:');
    await store.memory.add({ id: 'm1', type: 'short_term', content: 'algo', createdAt: 1 });
    store.embeddings.upsertEmbedding('m1', new Float32Array([0.5, 0.5]), 'mock');
    expect(store.embeddings.getEmbedding('m1')).toBeDefined();

    await store.reset();
    expect(store.embeddings.allEmbeddings()).toEqual([]);
    store.close();
  });

  it('migra al abrir, de modo que memory y conversation funcionan', async () => {
    const store = createSqliteStore(':memory:');
    await store.memory.add({ id: 'm1', type: 'short_term', content: 'algo', createdAt: 1 });
    const session = store.conversation.createSession();
    store.conversation.addMessage({ sessionId: session.id, role: 'user', text: 'hola' });

    expect(await store.memory.count()).toBe(1);
    expect(store.conversation.getMessages(session.id)).toHaveLength(1);
    store.close();
  });

  it('reset deja las tres tablas vacías', async () => {
    const store = createSqliteStore(':memory:');
    await store.memory.add({ id: 'm1', type: 'short_term', content: 'algo', createdAt: 1 });
    const session = store.conversation.createSession();
    store.conversation.addMessage({ sessionId: session.id, role: 'user', text: 'hola' });

    await store.reset();

    expect(await store.memory.count()).toBe(0);
    expect(store.conversation.recentSessions(10)).toEqual([]);
    expect(store.conversation.getMessages(session.id)).toEqual([]);
    store.close();
  });

  it('pruneOlderThan borra memoria, mensajes y sesiones anteriores al umbral', async () => {
    let clock = 100;
    const store = createSqliteStore(':memory:', () => clock);

    await store.memory.add({ id: 'viejo', type: 'short_term', content: 'x', createdAt: 100 });
    const oldSession = store.conversation.createSession();
    store.conversation.addMessage({ sessionId: oldSession.id, role: 'user', text: 'antiguo' });

    clock = 500;
    await store.memory.add({ id: 'nuevo', type: 'short_term', content: 'y', createdAt: 500 });
    const newSession = store.conversation.createSession();
    store.conversation.addMessage({ sessionId: newSession.id, role: 'user', text: 'reciente' });

    await store.pruneOlderThan(300);

    const remaining = (await store.memory.all()).map((m) => m.id);
    expect(remaining).toEqual(['nuevo']);
    expect(store.conversation.getSession(oldSession.id)).toBeUndefined();
    expect(store.conversation.getSession(newSession.id)).toBeDefined();
    store.close();
  });

  it('exportAll devuelve memoria, sesiones y mensajes persistidos', async () => {
    const store = createSqliteStore(':memory:');
    await store.memory.add({ id: 'm1', type: 'long_term_fact', content: 'dato', createdAt: 7 });
    const session = store.conversation.createSession();
    store.conversation.addMessage({ sessionId: session.id, role: 'user', text: 'hola' });

    const dump = await store.exportAll();
    expect(dump.memory.map((m) => m.id)).toEqual(['m1']);
    expect(dump.sessions.map((s) => s.id)).toEqual([session.id]);
    expect(dump.messages.map((m) => m.text)).toEqual(['hola']);

    // Serializable a JSON sin pérdida.
    expect(() => JSON.stringify(dump)).not.toThrow();
    store.close();
  });

  it('persiste entre reaperturas del fichero', async () => {
    const path = tempFile();

    const store1 = createSqliteStore(path);
    await store1.memory.add({
      id: 'm1',
      type: 'long_term_fact',
      content: 'persiste',
      createdAt: 7,
    });
    const session = store1.conversation.createSession();
    store1.conversation.addMessage({ sessionId: session.id, role: 'assistant', text: 'guardado' });
    store1.close();

    const store2 = createSqliteStore(path);
    expect(await store2.memory.count()).toBe(1);
    expect((await store2.memory.get('m1'))?.content).toBe('persiste');
    expect(store2.conversation.getMessages(session.id).map((m) => m.text)).toEqual(['guardado']);
    store2.close();
  });
});
