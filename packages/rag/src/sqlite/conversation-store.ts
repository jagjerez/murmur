import { randomUUID } from 'node:crypto';
import type { Message, Role, Session } from '@murmur/shared';
import type { Database } from './db';

/** Datos de un mensaje nuevo: el store asigna `id` y `createdAt`. */
export type NewMessage = Omit<Message, 'id' | 'createdAt'>;

interface SessionRow {
  id: string;
  started_at: number;
  ended_at: number | null;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  text: string;
  created_at: number;
}

function rowToSession(row: SessionRow): Session {
  const session: Session = { id: row.id, startedAt: row.started_at };
  if (row.ended_at !== null) {
    session.endedAt = row.ended_at;
  }
  return session;
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as Role,
    text: row.text,
    createdAt: row.created_at,
  };
}

/** Persistencia de sesiones y mensajes sobre SQLite (`sessions`, `messages`). */
export class ConversationStore {
  readonly #db: Database;
  readonly #now: () => number;

  constructor(db: Database, now: () => number = Date.now) {
    this.#db = db;
    this.#now = now;
  }

  createSession(): Session {
    const session: Session = { id: randomUUID(), startedAt: this.#now() };
    this.#db
      .prepare('INSERT INTO sessions(id, started_at, ended_at) VALUES (?, ?, ?)')
      .run(session.id, session.startedAt, null);
    return session;
  }

  endSession(id: string): void {
    this.#db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(this.#now(), id);
  }

  getSession(id: string): Session | undefined {
    const row = this.#db
      .prepare('SELECT id, started_at, ended_at FROM sessions WHERE id = ?')
      .get(id) as unknown as SessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  recentSessions(limit: number): Session[] {
    const rows = this.#db
      .prepare(
        'SELECT id, started_at, ended_at FROM sessions ORDER BY started_at DESC, id DESC LIMIT ?',
      )
      .all(limit) as unknown as SessionRow[];
    return rows.map(rowToSession);
  }

  addMessage(message: NewMessage): Message {
    const full: Message = {
      id: randomUUID(),
      sessionId: message.sessionId,
      role: message.role,
      text: message.text,
      createdAt: this.#now(),
    };
    this.#db
      .prepare(
        'INSERT INTO messages(id, session_id, role, text, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(full.id, full.sessionId, full.role, full.text, full.createdAt);
    return full;
  }

  getMessages(sessionId: string): Message[] {
    const rows = this.#db
      .prepare(
        'SELECT id, session_id, role, text, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC, rowid ASC',
      )
      .all(sessionId) as unknown as MessageRow[];
    return rows.map(rowToMessage);
  }
}
