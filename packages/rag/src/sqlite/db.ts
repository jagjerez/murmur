// Motor SQLite: `node:sqlite` (DatabaseSync), integrado en Node >= 22.5 (el entorno es Node 26).
// Elegido frente a `better-sqlite3` porque no añade dependencias ni build nativo y funciona
// directamente bajo Vitest (verificado con un test mínimo antes de implementar). Si en algún
// entorno futuro `node:sqlite` no estuviera disponible, el fallback documentado es
// `better-sqlite3` detrás de esta misma capa de acceso (openDatabase/migrate).
import { DatabaseSync } from 'node:sqlite';

/** Handle de base de datos. Tipado a partir de `node:sqlite`. */
export type Database = DatabaseSync;

/** Versión del esquema; se persiste en `PRAGMA user_version`. */
export const SCHEMA_VERSION = 1;

/**
 * Abre (o crea) una base de datos en `path`. Acepta una ruta de fichero o `':memory:'`.
 * Activa claves foráneas para integridad referencial de mensajes ↔ sesiones.
 */
export function openDatabase(path: string): Database {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

/**
 * Crea las tablas e índices si faltan y fija `PRAGMA user_version`. Idempotente: reejecutar
 * no falla ni duplica, y reabrir una base existente conserva los datos.
 */
export function migrate(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_items (
      id         TEXT PRIMARY KEY,
      type       TEXT NOT NULL,
      content    TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      session_id TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      ended_at   INTEGER
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role       TEXT NOT NULL,
      text       TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memory_items_type ON memory_items(type);
    CREATE INDEX IF NOT EXISTS idx_memory_items_session_id ON memory_items(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
  `);

  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}
