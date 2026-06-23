import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Message } from '@murmur/shared';
import { openDatabase, migrate, type Database } from './db';
import { ConversationStore } from './conversation-store';

describe('ConversationStore', () => {
  let db: Database;
  let store: ConversationStore;
  let clock: number;

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
    clock = 1000;
    store = new ConversationStore(db, () => clock);
  });

  afterEach(() => {
    db.close();
  });

  it('createSession crea una sesión con id y startedAt del reloj', () => {
    clock = 5000;
    const session = store.createSession();
    expect(session.id).toBeTruthy();
    expect(session.startedAt).toBe(5000);
    expect(session.endedAt).toBeUndefined();
    expect(store.getSession(session.id)).toEqual(session);
  });

  it('genera ids únicos por sesión', () => {
    const a = store.createSession();
    const b = store.createSession();
    expect(a.id).not.toBe(b.id);
  });

  it('endSession fija ended_at', () => {
    const session = store.createSession();
    clock = 9000;
    store.endSession(session.id);
    const got = store.getSession(session.id);
    expect(got?.endedAt).toBe(9000);
  });

  it('getSession devuelve undefined si no existe', () => {
    expect(store.getSession('nope')).toBeUndefined();
  });

  it('addMessage + getMessages recupera en orden cronológico', () => {
    const session = store.createSession();
    const m1 = store.addMessage({ sessionId: session.id, role: 'user', text: 'hola' });
    clock = 2000;
    const m2 = store.addMessage({ sessionId: session.id, role: 'assistant', text: 'qué tal' });

    const msgs = store.getMessages(session.id);
    expect(msgs.map((m: Message) => m.text)).toEqual(['hola', 'qué tal']);
    expect(msgs[0]?.id).toBe(m1.id);
    expect(msgs[1]?.id).toBe(m2.id);
    expect(msgs[0]?.role).toBe('user');
    expect(msgs[1]?.role).toBe('assistant');
    expect(msgs[0]?.createdAt).toBe(1000);
    expect(msgs[1]?.createdAt).toBe(2000);
  });

  it('getMessages solo devuelve mensajes de la sesión pedida', () => {
    const s1 = store.createSession();
    const s2 = store.createSession();
    store.addMessage({ sessionId: s1.id, role: 'user', text: 'en s1' });
    store.addMessage({ sessionId: s2.id, role: 'user', text: 'en s2' });
    expect(store.getMessages(s1.id).map((m: Message) => m.text)).toEqual(['en s1']);
  });

  it('recentSessions ordena desc por started_at y respeta el límite', () => {
    clock = 100;
    const a = store.createSession();
    clock = 300;
    const b = store.createSession();
    clock = 200;
    const c = store.createSession();
    const recent = store.recentSessions(2);
    expect(recent.map((s) => s.id)).toEqual([b.id, c.id]);
    expect(a.id).toBeTruthy();
  });
});
