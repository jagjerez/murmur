import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, migrate, SCHEMA_VERSION } from './db';

describe('openDatabase + migrate', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function tempFile(name = 'memory.db'): string {
    const dir = mkdtempSync(join(tmpdir(), 'murmur-rag-'));
    dirs.push(dir);
    return join(dir, name);
  }

  function tableNames(db: ReturnType<typeof openDatabase>): string[] {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[];
    return rows.map((r) => r.name);
  }

  it('crea las tres tablas al migrar una base en memoria', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const names = tableNames(db);
    expect(names).toContain('memory_items');
    expect(names).toContain('sessions');
    expect(names).toContain('messages');
    db.close();
  });

  it('fija PRAGMA user_version a SCHEMA_VERSION', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const [row] = db.prepare('PRAGMA user_version').all() as { user_version: number }[];
    expect(row?.user_version).toBe(SCHEMA_VERSION);
    db.close();
  });

  it('migrar dos veces es idempotente (no falla ni duplica)', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    migrate(db);
    const names = tableNames(db);
    expect(names.filter((n) => n === 'memory_items')).toHaveLength(1);
    db.close();
  });

  it('crea índices por type y session_id', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as {
      name: string;
    }[];
    const names = rows.map((r) => r.name);
    expect(names).toContain('idx_memory_items_type');
    expect(names).toContain('idx_memory_items_session_id');
    expect(names).toContain('idx_messages_session_id');
    db.close();
  });

  it('persiste datos al reabrir un fichero', () => {
    const path = tempFile();

    const db1 = openDatabase(path);
    migrate(db1);
    db1
      .prepare('INSERT INTO memory_items(id, type, content, created_at) VALUES (?, ?, ?, ?)')
      .run('m1', 'short_term', 'recuerda esto', 1000);
    db1.close();

    const db2 = openDatabase(path);
    migrate(db2);
    const rows = db2.prepare('SELECT id, content FROM memory_items').all() as {
      id: string;
      content: string;
    }[];
    expect(rows).toEqual([{ id: 'm1', content: 'recuerda esto' }]);
    db2.close();
  });
});
