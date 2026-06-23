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

  it('pruneOlderThan borra mensajes y sesiones anteriores al umbral', () => {
    clock = 100;
    const vieja = store.createSession();
    store.addMessage({ sessionId: vieja.id, role: 'user', text: 'antiguo' });
    clock = 500;
    const nueva = store.createSession();
    store.addMessage({ sessionId: nueva.id, role: 'user', text: 'reciente' });

    store.pruneOlderThan(300);

    expect(store.getSession(vieja.id)).toBeUndefined();
    expect(store.getMessages(vieja.id)).toEqual([]);
    expect(store.getSession(nueva.id)).toBeDefined();
    expect(store.getMessages(nueva.id).map((m) => m.text)).toEqual(['reciente']);
  });

  it('pruneOlderThan borra mensajes antiguos aunque la sesión sea reciente', () => {
    clock = 500;
    const session = store.createSession();
    clock = 100;
    store.addMessage({ sessionId: session.id, role: 'user', text: 'antiguo' });
    clock = 600;
    store.addMessage({ sessionId: session.id, role: 'assistant', text: 'reciente' });

    store.pruneOlderThan(300);

    // La sesión sigue (started_at 500 >= 300) pero el mensaje viejo desaparece.
    expect(store.getSession(session.id)).toBeDefined();
    expect(store.getMessages(session.id).map((m) => m.text)).toEqual(['reciente']);
  });

  it('exportConversation devuelve todas las sesiones y mensajes', () => {
    clock = 100;
    const s1 = store.createSession();
    store.addMessage({ sessionId: s1.id, role: 'user', text: 'hola' });
    clock = 200;
    const s2 = store.createSession();
    store.addMessage({ sessionId: s2.id, role: 'assistant', text: 'qué tal' });

    const { sessions, messages } = store.exportConversation();
    expect(sessions.map((s) => s.id).sort()).toEqual([s1.id, s2.id].sort());
    expect(messages.map((m) => m.text).sort()).toEqual(['hola', 'qué tal']);
  });
});
