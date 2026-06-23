import type { Message, Session } from '@murmur/shared';
import type { ConversationStore } from '@murmur/rag';

/** Datos de un mensaje nuevo (el store asigna `id` y `createdAt`). */
type NewMessage = Omit<Message, 'id' | 'createdAt'>;

/**
 * Almacén de conversación en memoria para el webview.
 *
 * El `ConversationStore` de `@murmur/rag` se apoya en SQLite (`better-sqlite3`,
 * `node:crypto`) y NO resuelve en el navegador. El orchestrator sólo necesita las
 * operaciones de sesión/mensaje; esta implementación las cubre en memoria. La
 * persistencia real en disco (vía comandos Tauri) llega en una fase posterior.
 *
 * Coincide con la superficie pública de `ConversationStore`; se expone como tal
 * mediante `createMemoryConversationStore` (cast documentado: el orchestrator usa
 * sólo estos métodos públicos, no los campos privados de la clase SQLite).
 */
class MemoryConversationStore {
  private readonly sessions = new Map<string, Session>();
  private readonly messages = new Map<string, Message[]>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  createSession(): Session {
    const session: Session = { id: globalThis.crypto.randomUUID(), startedAt: this.now() };
    this.sessions.set(session.id, session);
    this.messages.set(session.id, []);
    return session;
  }

  endSession(id: string): void {
    const session = this.sessions.get(id);
    if (session) session.endedAt = this.now();
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  recentSessions(limit: number): Session[] {
    return [...this.sessions.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, limit);
  }

  addMessage(message: NewMessage): Message {
    const full: Message = {
      id: globalThis.crypto.randomUUID(),
      sessionId: message.sessionId,
      role: message.role,
      text: message.text,
      createdAt: this.now(),
    };
    const list = this.messages.get(message.sessionId);
    if (list) list.push(full);
    return full;
  }

  getMessages(sessionId: string): Message[] {
    return (this.messages.get(sessionId) ?? []).slice();
  }
}

/**
 * Crea un `ConversationStore` en memoria para el webview. El cast es seguro: el
 * orchestrator depende sólo de los métodos públicos, que esta clase implementa.
 */
export function createMemoryConversationStore(now?: () => number): ConversationStore {
  return new MemoryConversationStore(now) as unknown as ConversationStore;
}
