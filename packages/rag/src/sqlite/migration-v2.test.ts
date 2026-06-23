import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate, SCHEMA_VERSION } from './db';

describe('migración v2 (tabla embeddings)', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function tempFile(name = 'memory.db'): string {
    const dir = mkdtempSync(join(tmpdir(), 'murmur-mig-'));
    dirs.push(dir);
    return join(dir, name);
  }

  function tableNames(db: ReturnType<typeof openDatabase>): string[] {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[];
    return rows.map((r) => r.name);
  }

  it('SCHEMA_VERSION es 2', () => {
    expect(SCHEMA_VERSION).toBe(2);
  });

  it('migrar crea la tabla embeddings y fija user_version a 2', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    expect(tableNames(db)).toContain('embeddings');
    const [row] = db.prepare('PRAGMA user_version').all() as { user_version: number }[];
    expect(row?.user_version).toBe(2);
    db.close();
  });

  it('la tabla embeddings tiene FK a memory_items con ON DELETE CASCADE', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const fks = db.prepare('PRAGMA foreign_key_list(embeddings)').all() as {
      table: string;
      from: string;
      to: string;
      on_delete: string;
    }[];
    expect(fks).toHaveLength(1);
    expect(fks[0]?.table).toBe('memory_items');
    expect(fks[0]?.from).toBe('memory_item_id');
    expect(fks[0]?.on_delete).toBe('CASCADE');
    db.close();
  });

  it('migrar dos veces es idempotente', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    migrate(db);
    expect(tableNames(db).filter((n) => n === 'embeddings')).toHaveLength(1);
    db.close();
  });

  it('migración v1 → v2 sobre una db con datos: preserva los datos y añade la tabla', () => {
    const path = tempFile();

    // Simula una base v1: esquema antiguo sin tabla embeddings, user_version = 1.
    const v1 = new DatabaseSync(path);
    v1.exec('PRAGMA foreign_keys = ON');
    v1.exec(`
      CREATE TABLE memory_items (
        id         TEXT PRIMARY KEY,
        type       TEXT NOT NULL,
        content    TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        session_id TEXT
      );
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, ended_at INTEGER
      );
      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL
      );
    `);
    v1.prepare('INSERT INTO memory_items(id, type, content, created_at) VALUES (?, ?, ?, ?)').run(
      'm1',
      'long_term_fact',
      'dato previo',
      1234,
    );
    v1.exec('PRAGMA user_version = 1');
    v1.close();

    // Reabrir y migrar a v2.
    const db = openDatabase(path);
    migrate(db);

    const [ver] = db.prepare('PRAGMA user_version').all() as { user_version: number }[];
    expect(ver?.user_version).toBe(2);
    expect(tableNames(db)).toContain('embeddings');

    const rows = db.prepare('SELECT id, content FROM memory_items').all() as {
      id: string;
      content: string;
    }[];
    expect(rows).toEqual([{ id: 'm1', content: 'dato previo' }]);
    db.close();
  });
});
